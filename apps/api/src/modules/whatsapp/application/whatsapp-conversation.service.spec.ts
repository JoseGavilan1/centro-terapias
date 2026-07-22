import { ConflictException } from '@nestjs/common';
import { AppointmentStatus, ConfirmedVia } from '@centro/shared';
import { AgendaAccessService } from '../../agenda/application/agenda-access.service';
import { AppointmentRecord } from '../../agenda/domain/appointment.repository';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  UpsertWhatsAppConversationData,
  WhatsAppConversationRecord,
  WhatsAppConversationRepository,
  WhatsAppConversationStep,
} from '../domain/whatsapp-conversation.repository';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WhatsAppConversationService } from './whatsapp-conversation.service';
import { WHATSAPP_TEMPLATE_KEYS } from './whatsapp-templates';

const ORG_ID = 'org-1';
const PATIENT_ID = 'patient-1';
const PHONE = '+56911111111';
const FROM_PHONE_NUMBER_ID = 'wa-number-1';

function makeAppointment(overrides: Partial<AppointmentRecord> = {}): AppointmentRecord {
  return {
    id: 'appt-1',
    organizationId: ORG_ID,
    therapySlotId: 'slot-1',
    patientId: PATIENT_ID,
    professionalId: 'prof-1',
    date: new Date('2026-07-20'),
    startMinute: 9 * 60,
    durationMinutes: 45,
    status: AppointmentStatus.PENDIENTE,
    confirmedVia: null,
    notes: null,
    attendanceMarkedById: null,
    attendanceMarkedAt: null,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

class FakeWhatsAppConversationRepository implements WhatsAppConversationRepository {
  conversations = new Map<string, WhatsAppConversationRecord>();
  private seq = 0;

  findByPhone(organizationId: string, phone: string): Promise<WhatsAppConversationRecord | null> {
    return Promise.resolve(this.conversations.get(`${organizationId}:${phone}`) ?? null);
  }

  upsert(data: UpsertWhatsAppConversationData): Promise<WhatsAppConversationRecord> {
    this.seq += 1;
    const record: WhatsAppConversationRecord = {
      id: `conv-${this.seq}`,
      organizationId: data.organizationId,
      phone: data.phone,
      currentStep: data.currentStep,
      context: data.context,
      expiresAt: data.expiresAt,
    };
    this.conversations.set(`${data.organizationId}:${data.phone}`, record);
    return Promise.resolve(record);
  }
}

class FakeAgendaAccessService {
  nextAppointment: AppointmentRecord | null = null;
  respondError: Error | null = null;
  respondCalls: Array<{ appointmentId: string; response: 'CONFIRM' | 'CANCEL' }> = [];

  findNextUpcomingAppointment(): Promise<AppointmentRecord | null> {
    return Promise.resolve(this.nextAppointment);
  }

  respondToAppointmentViaWhatsApp(
    _organizationId: string,
    appointmentId: string,
    response: 'CONFIRM' | 'CANCEL',
  ): Promise<AppointmentRecord> {
    this.respondCalls.push({ appointmentId, response });
    if (this.respondError) {
      return Promise.reject(this.respondError);
    }
    return Promise.resolve(
      makeAppointment({
        id: appointmentId,
        status: response === 'CONFIRM' ? AppointmentStatus.CONFIRMADA : AppointmentStatus.CANCELADA,
        confirmedVia: response === 'CONFIRM' ? ConfirmedVia.WHATSAPP : null,
      }),
    );
  }
}

interface SentMessage {
  organizationId: string;
  fromPhoneNumberId: string;
  to: string;
  body: string;
  templateKey: string;
  appointmentId?: string;
}

class FakeWhatsAppMessagingService {
  sent: SentMessage[] = [];
  inbound: Array<{ organizationId: string; from: string; body: string }> = [];

  send(params: SentMessage): Promise<Record<string, unknown>> {
    this.sent.push(params);
    return Promise.resolve({});
  }

  recordInbound(
    organizationId: string,
    from: string,
    body: string,
  ): Promise<Record<string, unknown>> {
    this.inbound.push({ organizationId, from, body });
    return Promise.resolve({});
  }
}

interface FakePatient {
  id: string;
  organizationId: string;
  phone: string;
  isActive: boolean;
  firstName: string;
  lastName: string;
}

interface FakeAdmin {
  organizationId: string;
  role: string;
  isActive: boolean;
  phone: string | null;
}

class FakePrismaService {
  patients: FakePatient[] = [];
  admins: FakeAdmin[] = [];
  organizations: Array<{ id: string; googleFormsUrl: string | null }> = [];

  patient = {
    findMany: ({
      where,
    }: {
      where: { organizationId: string; phone: string; isActive?: boolean };
    }) =>
      Promise.resolve(
        this.patients
          .filter(
            (p) =>
              p.organizationId === where.organizationId &&
              p.phone === where.phone &&
              (where.isActive === undefined || p.isActive === where.isActive),
          )
          .map((p) => ({ id: p.id, firstName: p.firstName, lastName: p.lastName })),
      ),
    findFirst: ({ where }: { where: { id: string; organizationId: string } }) =>
      Promise.resolve(
        this.patients.find((p) => p.id === where.id && p.organizationId === where.organizationId) ??
          null,
      ),
  };

  user = {
    findMany: ({ where }: { where: { organizationId: string; role: string; isActive: boolean } }) =>
      Promise.resolve(
        this.admins
          .filter(
            (a) =>
              a.organizationId === where.organizationId &&
              a.role === where.role &&
              a.isActive === where.isActive &&
              a.phone !== null,
          )
          .map((a) => ({ phone: a.phone })),
      ),
  };

  organization = {
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(this.organizations.find((o) => o.id === where.id) ?? null),
  };
}

describe('WhatsAppConversationService', () => {
  let conversationRepo: FakeWhatsAppConversationRepository;
  let agendaAccess: FakeAgendaAccessService;
  let messaging: FakeWhatsAppMessagingService;
  let prisma: FakePrismaService;
  let service: WhatsAppConversationService;

  beforeEach(() => {
    conversationRepo = new FakeWhatsAppConversationRepository();
    agendaAccess = new FakeAgendaAccessService();
    messaging = new FakeWhatsAppMessagingService();
    prisma = new FakePrismaService();
    prisma.patients = [
      {
        id: PATIENT_ID,
        organizationId: ORG_ID,
        phone: PHONE,
        isActive: true,
        firstName: 'Sofía',
        lastName: 'Gómez',
      },
    ];
    prisma.organizations = [{ id: ORG_ID, googleFormsUrl: 'https://forms.example/nuevo' }];

    service = new WhatsAppConversationService(
      conversationRepo,
      agendaAccess as unknown as AgendaAccessService,
      messaging as unknown as WhatsAppMessagingService,
      prisma as unknown as PrismaService,
    );
  });

  function incoming(text: string) {
    return service.handleIncomingMessage({
      organizationId: ORG_ID,
      fromPhoneNumberId: FROM_PHONE_NUMBER_ID,
      phone: PHONE,
      text,
    });
  }

  it('registra el mensaje entrante siempre, sin importar el estado', async () => {
    await incoming('hola');
    expect(messaging.inbound).toEqual([{ organizationId: ORG_ID, from: PHONE, body: 'hola' }]);
  });

  it('IDLE + cualquier texto envía el menú y pasa a AWAITING_MENU_CHOICE', async () => {
    await incoming('hola');
    expect(messaging.sent[0].templateKey).toBe(WHATSAPP_TEMPLATE_KEYS.MAIN_MENU);
    const conversation = await conversationRepo.findByPhone(ORG_ID, PHONE);
    expect(conversation?.currentStep).toBe(WhatsAppConversationStep.AWAITING_MENU_CHOICE);
  });

  describe('AWAITING_MENU_CHOICE', () => {
    beforeEach(async () => {
      await incoming('hola'); // pasa a AWAITING_MENU_CHOICE
      messaging.sent = [];
    });

    it('"1" con una próxima cita PENDIENTE la confirma con confirmedVia=WHATSAPP', async () => {
      agendaAccess.nextAppointment = makeAppointment({ status: AppointmentStatus.PENDIENTE });
      await incoming('1');
      expect(agendaAccess.respondCalls).toEqual([{ appointmentId: 'appt-1', response: 'CONFIRM' }]);
      expect(
        messaging.sent.some((m) => m.templateKey === WHATSAPP_TEMPLATE_KEYS.CONFIRMATION_ACK),
      ).toBe(true);
    });

    it('"1"/"2" sin citas próximas responde el mensaje fijo sin mutar nada', async () => {
      agendaAccess.nextAppointment = null;
      await incoming('1');
      expect(agendaAccess.respondCalls).toHaveLength(0);
      expect(messaging.sent[0].templateKey).toBe(WHATSAPP_TEMPLATE_KEYS.NO_UPCOMING_APPOINTMENT);
    });

    it('"1" sobre una cita ya CONFIRMADA no vuelve a mutar', async () => {
      agendaAccess.nextAppointment = makeAppointment({ status: AppointmentStatus.CONFIRMADA });
      await incoming('1');
      expect(agendaAccess.respondCalls).toHaveLength(0);
      expect(messaging.sent[0].templateKey).toBe(WHATSAPP_TEMPLATE_KEYS.ALREADY_CONFIRMED);
    });

    it('"2" cancela la próxima cita sin notificar administradores', async () => {
      agendaAccess.nextAppointment = makeAppointment({ status: AppointmentStatus.PENDIENTE });
      prisma.admins = [
        { organizationId: ORG_ID, role: 'ADMIN', isActive: true, phone: '+56922222222' },
      ];
      await incoming('2');
      expect(agendaAccess.respondCalls).toEqual([{ appointmentId: 'appt-1', response: 'CANCEL' }]);
      expect(
        messaging.sent.some(
          (m) => m.templateKey === WHATSAPP_TEMPLATE_KEYS.ADMIN_CANCELLATION_NOTICE,
        ),
      ).toBe(false);
    });

    it('"3" responde el mensaje fijo de reagendamiento sin mutar nada', async () => {
      await incoming('3');
      expect(agendaAccess.respondCalls).toHaveLength(0);
      expect(messaging.sent[0].templateKey).toBe(WHATSAPP_TEMPLATE_KEYS.RESCHEDULE_INFO);
    });

    it('"4" responde con el enlace de admisión de la organización', async () => {
      await incoming('4');
      expect(messaging.sent[0].templateKey).toBe(WHATSAPP_TEMPLATE_KEYS.NEW_PATIENT_INFO);
      expect(messaging.sent[0].body).toContain('https://forms.example/nuevo');
    });

    it('una opción inválida reenvía el menú y la conversación sigue esperando', async () => {
      await incoming('9');
      expect(messaging.sent[0].templateKey).toBe(WHATSAPP_TEMPLATE_KEYS.INVALID_OPTION);
      const conversation = await conversationRepo.findByPhone(ORG_ID, PHONE);
      expect(conversation?.currentStep).toBe(WhatsAppConversationStep.AWAITING_MENU_CHOICE);
    });
  });

  describe('AWAITING_ATTENDANCE_CONFIRMATION (recordatorio automático)', () => {
    beforeEach(async () => {
      await service.startAttendanceConfirmation(
        ORG_ID,
        FROM_PHONE_NUMBER_ID,
        PHONE,
        makeAppointment({ status: AppointmentStatus.PENDIENTE }),
        '2026-07-20',
        '09:00',
      );
      messaging.sent = [];
    });

    it('"1" confirma y vuelve a IDLE', async () => {
      await incoming('1');
      expect(agendaAccess.respondCalls).toEqual([{ appointmentId: 'appt-1', response: 'CONFIRM' }]);
      expect(
        messaging.sent.some((m) => m.templateKey === WHATSAPP_TEMPLATE_KEYS.CONFIRMATION_ACK),
      ).toBe(true);
      const conversation = await conversationRepo.findByPhone(ORG_ID, PHONE);
      expect(conversation?.currentStep).toBe(WhatsAppConversationStep.IDLE);
    });

    it('"2" cancela, notifica a los ADMIN con teléfono y vuelve a IDLE', async () => {
      prisma.admins = [
        { organizationId: ORG_ID, role: 'ADMIN', isActive: true, phone: '+56922222222' },
        { organizationId: ORG_ID, role: 'ADMIN', isActive: true, phone: null },
      ];
      await incoming('2');
      expect(agendaAccess.respondCalls).toEqual([{ appointmentId: 'appt-1', response: 'CANCEL' }]);
      const notice = messaging.sent.find(
        (m) => m.templateKey === WHATSAPP_TEMPLATE_KEYS.ADMIN_CANCELLATION_NOTICE,
      );
      expect(notice?.to).toBe('+56922222222');
      const conversation = await conversationRepo.findByPhone(ORG_ID, PHONE);
      expect(conversation?.currentStep).toBe(WhatsAppConversationStep.IDLE);
    });

    it('una respuesta inválida repite la pregunta y sigue en el mismo paso', async () => {
      await incoming('9');
      expect(agendaAccess.respondCalls).toHaveLength(0);
      expect(messaging.sent[0].templateKey).toBe(
        WHATSAPP_TEMPLATE_KEYS.INVALID_ATTENDANCE_RESPONSE,
      );
      const conversation = await conversationRepo.findByPhone(ORG_ID, PHONE);
      expect(conversation?.currentStep).toBe(
        WhatsAppConversationStep.AWAITING_ATTENDANCE_CONFIRMATION,
      );
    });

    it('una transición inválida responde un mensaje fijo de error sin propagar la excepción', async () => {
      agendaAccess.respondError = new ConflictException('inválida');
      await expect(incoming('1')).resolves.toBeUndefined();
      expect(messaging.sent[0].templateKey).toBe(WHATSAPP_TEMPLATE_KEYS.INVALID_TRANSITION);
    });
  });

  it('una conversación vencida se trata como IDLE', async () => {
    await conversationRepo.upsert({
      organizationId: ORG_ID,
      phone: PHONE,
      currentStep: WhatsAppConversationStep.AWAITING_MENU_CHOICE,
      context: null,
      expiresAt: new Date(Date.now() - 1000),
    });
    await incoming('1');
    expect(messaging.sent[0].templateKey).toBe(WHATSAPP_TEMPLATE_KEYS.MAIN_MENU);
  });

  it('un mismo teléfono con varios pacientes actúa sobre la cita más próxima entre todos', async () => {
    prisma.patients.push({
      id: 'patient-2',
      organizationId: ORG_ID,
      phone: PHONE,
      isActive: true,
      firstName: 'Hijo',
      lastName: 'Dos',
    });
    const later = makeAppointment({ id: 'appt-later', date: new Date('2026-08-01') });
    const sooner = makeAppointment({ id: 'appt-sooner', date: new Date('2026-07-15') });
    let call = 0;
    agendaAccess.findNextUpcomingAppointment = () => {
      call += 1;
      return Promise.resolve(call === 1 ? later : sooner);
    };
    await incoming('hola');
    await incoming('1');
    expect(agendaAccess.respondCalls[0].appointmentId).toBe('appt-sooner');
  });
});
