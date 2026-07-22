import { AppointmentStatus } from '@centro/shared';
import { AgendaAccessService } from '../../agenda/application/agenda-access.service';
import { AppointmentRecord } from '../../agenda/domain/appointment.repository';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { WHATSAPP_TEMPLATE_KEYS } from './whatsapp-templates';
import { WhatsAppConversationService } from './whatsapp-conversation.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WhatsAppReminderService } from './whatsapp-reminder.service';

const ORG_A = 'org-a';
const ORG_B = 'org-b';

function makeAppointment(overrides: Partial<AppointmentRecord> = {}): AppointmentRecord {
  return {
    id: 'appt-1',
    organizationId: ORG_A,
    therapySlotId: 'slot-1',
    patientId: 'patient-1',
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

class FakeAgendaAccessService {
  due: AppointmentRecord[] = [];
  findAppointmentsDueForReminder(): Promise<AppointmentRecord[]> {
    return Promise.resolve(this.due);
  }
}

class FakeWhatsAppMessagingService {
  alreadySent = new Set<string>();
  hasBeenSentForAppointment(appointmentId: string, templateKey: string): Promise<boolean> {
    return Promise.resolve(this.alreadySent.has(`${appointmentId}:${templateKey}`));
  }
}

class FakeWhatsAppConversationService {
  startCalls: Array<{
    organizationId: string;
    fromPhoneNumberId: string;
    phone: string;
    appointmentId: string;
  }> = [];
  startAttendanceConfirmation(
    organizationId: string,
    fromPhoneNumberId: string,
    phone: string,
    appointment: AppointmentRecord,
  ): Promise<void> {
    this.startCalls.push({
      organizationId,
      fromPhoneNumberId,
      phone,
      appointmentId: appointment.id,
    });
    return Promise.resolve();
  }
}

interface FakeOrganization {
  id: string;
  whatsappPhoneNumberId: string | null;
}
interface FakePatient {
  id: string;
  organizationId: string;
  phone: string | null;
}

class FakePrismaService {
  organizations: FakeOrganization[] = [];
  patients: FakePatient[] = [];

  organization = {
    findUnique: ({ where }: { where: { id: string } }) =>
      Promise.resolve(this.organizations.find((o) => o.id === where.id) ?? null),
  };

  patient = {
    findFirst: ({ where }: { where: { id: string; organizationId: string } }) =>
      Promise.resolve(
        this.patients.find((p) => p.id === where.id && p.organizationId === where.organizationId) ??
          null,
      ),
  };
}

describe('WhatsAppReminderService', () => {
  let agendaAccess: FakeAgendaAccessService;
  let messaging: FakeWhatsAppMessagingService;
  let conversation: FakeWhatsAppConversationService;
  let prisma: FakePrismaService;
  let service: WhatsAppReminderService;

  beforeEach(() => {
    agendaAccess = new FakeAgendaAccessService();
    messaging = new FakeWhatsAppMessagingService();
    conversation = new FakeWhatsAppConversationService();
    prisma = new FakePrismaService();
    service = new WhatsAppReminderService(
      agendaAccess as unknown as AgendaAccessService,
      messaging as unknown as WhatsAppMessagingService,
      conversation as unknown as WhatsAppConversationService,
      prisma as unknown as PrismaService,
    );
  });

  it('envía el recordatorio de una cita PENDIENTE de mañana sin recordatorio previo', async () => {
    agendaAccess.due = [makeAppointment()];
    prisma.organizations = [{ id: ORG_A, whatsappPhoneNumberId: 'wa-a' }];
    prisma.patients = [{ id: 'patient-1', organizationId: ORG_A, phone: '+56911111111' }];

    const result = await service.sendDueReminders();

    expect(result).toEqual({ sent: 1, skipped: 0 });
    expect(conversation.startCalls).toEqual([
      {
        organizationId: ORG_A,
        fromPhoneNumberId: 'wa-a',
        phone: '+56911111111',
        appointmentId: 'appt-1',
      },
    ]);
  });

  it('es idempotente: una cita que ya recibió el recordatorio se omite', async () => {
    agendaAccess.due = [makeAppointment()];
    prisma.organizations = [{ id: ORG_A, whatsappPhoneNumberId: 'wa-a' }];
    prisma.patients = [{ id: 'patient-1', organizationId: ORG_A, phone: '+56911111111' }];
    messaging.alreadySent.add(`appt-1:${WHATSAPP_TEMPLATE_KEYS.ATTENDANCE_REMINDER}`);

    const result = await service.sendDueReminders();

    expect(result).toEqual({ sent: 0, skipped: 1 });
    expect(conversation.startCalls).toHaveLength(0);
  });

  it('omite una cita cuya organización no tiene whatsappPhoneNumberId configurado', async () => {
    agendaAccess.due = [makeAppointment()];
    prisma.organizations = [{ id: ORG_A, whatsappPhoneNumberId: null }];
    prisma.patients = [{ id: 'patient-1', organizationId: ORG_A, phone: '+56911111111' }];

    const result = await service.sendDueReminders();

    expect(result).toEqual({ sent: 0, skipped: 1 });
  });

  it('omite una cita cuyo paciente no tiene teléfono', async () => {
    agendaAccess.due = [makeAppointment()];
    prisma.organizations = [{ id: ORG_A, whatsappPhoneNumberId: 'wa-a' }];
    prisma.patients = [{ id: 'patient-1', organizationId: ORG_A, phone: null }];

    const result = await service.sendDueReminders();

    expect(result).toEqual({ sent: 0, skipped: 1 });
  });

  it('envía el recordatorio correcto a cada organización sin cruzarlas', async () => {
    agendaAccess.due = [
      makeAppointment({ id: 'appt-a', organizationId: ORG_A, patientId: 'patient-a' }),
      makeAppointment({ id: 'appt-b', organizationId: ORG_B, patientId: 'patient-b' }),
    ];
    prisma.organizations = [
      { id: ORG_A, whatsappPhoneNumberId: 'wa-a' },
      { id: ORG_B, whatsappPhoneNumberId: 'wa-b' },
    ];
    prisma.patients = [
      { id: 'patient-a', organizationId: ORG_A, phone: '+56911111111' },
      { id: 'patient-b', organizationId: ORG_B, phone: '+56922222222' },
    ];

    const result = await service.sendDueReminders();

    expect(result).toEqual({ sent: 2, skipped: 0 });
    expect(conversation.startCalls).toEqual([
      {
        organizationId: ORG_A,
        fromPhoneNumberId: 'wa-a',
        phone: '+56911111111',
        appointmentId: 'appt-a',
      },
      {
        organizationId: ORG_B,
        fromPhoneNumberId: 'wa-b',
        phone: '+56922222222',
        appointmentId: 'appt-b',
      },
    ]);
  });
});
