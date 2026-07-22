import { ConflictException, NotFoundException } from '@nestjs/common';
import { IncidentStatus, IncidentType, UserRole } from '@centro/shared';
import { AgendaAccessService } from '../../agenda/application/agenda-access.service';
import { AuditService } from '../../audit/application/audit.service';
import { WhatsAppMessagingService } from '../../whatsapp/application/whatsapp-messaging.service';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateIncidentData,
  IncidentFilters,
  IncidentRecord,
  IncidentRepository,
} from '../domain/incident.repository';
import { IncidentsService } from './incidents.service';

const ORG_ID = 'org-1';

function makeIncident(overrides: Partial<IncidentRecord> = {}): IncidentRecord {
  return {
    id: 'incident-1',
    organizationId: ORG_ID,
    patientId: null,
    reportedById: 'reporter-1',
    type: IncidentType.ACCIDENTE,
    description: 'El paciente se golpeó la rodilla durante el ejercicio.',
    occurredAt: new Date('2026-03-01T14:00:00Z'),
    status: IncidentStatus.ABIERTA,
    createdAt: new Date('2026-03-01T15:00:00Z'),
    updatedAt: new Date('2026-03-01T15:00:00Z'),
    ...overrides,
  };
}

class FakeIncidentRepository implements IncidentRepository {
  entries: IncidentRecord[] = [];
  private seq = 0;
  lastFilters: IncidentFilters | undefined;

  findById(organizationId: string, id: string): Promise<IncidentRecord | null> {
    return Promise.resolve(
      this.entries.find((e) => e.id === id && e.organizationId === organizationId) ?? null,
    );
  }

  findMany(
    organizationId: string,
    filters: IncidentFilters,
  ): Promise<{ data: IncidentRecord[]; total: number }> {
    this.lastFilters = filters;
    const data = this.entries.filter(
      (e) =>
        e.organizationId === organizationId &&
        (!filters.status || e.status === filters.status) &&
        (!filters.type || e.type === filters.type) &&
        (!filters.patientId || e.patientId === filters.patientId) &&
        (!filters.reportedById || e.reportedById === filters.reportedById),
    );
    return Promise.resolve({ data, total: data.length });
  }

  create(data: CreateIncidentData): Promise<IncidentRecord> {
    this.seq += 1;
    const entry = makeIncident({
      ...data,
      id: `incident-${this.seq}`,
      status: IncidentStatus.ABIERTA,
    });
    this.entries.push(entry);
    return Promise.resolve(entry);
  }

  updateStatus(
    organizationId: string,
    id: string,
    status: IncidentStatus,
  ): Promise<IncidentRecord> {
    const idx = this.entries.findIndex((e) => e.id === id && e.organizationId === organizationId);
    if (idx === -1) {
      throw new NotFoundException('Incidencia no encontrada');
    }
    this.entries[idx] = { ...this.entries[idx], status, updatedAt: new Date() };
    return Promise.resolve(this.entries[idx]);
  }
}

class FakeAuditService {
  entries: unknown[] = [];
  log(entry: unknown): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

class FakeAgendaAccessService {
  assignedIds: string[] = [];
  getAssignedPatientIds(): Promise<string[]> {
    return Promise.resolve(this.assignedIds);
  }
}

class FakeMessagingService {
  sendCalls: unknown[] = [];
  send(params: unknown): Promise<{ id: string }> {
    this.sendCalls.push(params);
    return Promise.resolve({ id: 'msg-1' });
  }
}

class FakePrismaService {
  patients: Record<string, { id: string; firstName: string; lastName: string }> = {};
  organizationWhatsappPhoneNumberId: string | null = null;
  admins: Array<{ phone: string | null }> = [];

  patient = {
    findFirst: ({ where }: { where: { id: string } }) =>
      Promise.resolve(this.patients[where.id] ?? null),
  };
  organization = {
    findUnique: () =>
      Promise.resolve({ whatsappPhoneNumberId: this.organizationWhatsappPhoneNumberId }),
  };
  user = {
    findMany: () => Promise.resolve(this.admins),
  };
}

describe('IncidentsService', () => {
  let repo: FakeIncidentRepository;
  let audit: FakeAuditService;
  let agendaAccess: FakeAgendaAccessService;
  let messaging: FakeMessagingService;
  let prisma: FakePrismaService;
  let service: IncidentsService;
  let admin: AuthenticatedUser;
  let professional: AuthenticatedUser;
  const context = { ip: '127.0.0.1', userAgent: 'jest' };

  beforeEach(() => {
    repo = new FakeIncidentRepository();
    audit = new FakeAuditService();
    agendaAccess = new FakeAgendaAccessService();
    messaging = new FakeMessagingService();
    prisma = new FakePrismaService();
    service = new IncidentsService(
      repo,
      agendaAccess as unknown as AgendaAccessService,
      audit as unknown as AuditService,
      messaging as unknown as WhatsAppMessagingService,
      prisma as unknown as PrismaService,
    );
    admin = {
      userId: 'admin-1',
      organizationId: ORG_ID,
      email: 'admin@demo.cl',
      role: UserRole.ADMIN,
      specialty: null,
    };
    professional = {
      userId: 'prof-1',
      organizationId: ORG_ID,
      email: 'prof@demo.cl',
      role: UserRole.PROFESSIONAL,
      specialty: null,
    };
  });

  describe('create', () => {
    it('PROFESSIONAL puede reportar sin indicar paciente', async () => {
      const dto = await service.create(
        ORG_ID,
        {
          type: IncidentType.ACCIDENTE,
          description: 'Se cayó en el pasillo.',
          occurredAt: '2026-03-01',
        },
        professional,
        context,
      );
      expect(dto.status).toBe(IncidentStatus.ABIERTA);
      expect(dto.reportedById).toBe('prof-1');
      expect(audit.entries).toHaveLength(1);
    });

    it('PROFESSIONAL puede reportar sobre un paciente asignado', async () => {
      prisma.patients['patient-1'] = { id: 'patient-1', firstName: 'Sofía', lastName: 'Gómez' };
      agendaAccess.assignedIds = ['patient-1'];

      const dto = await service.create(
        ORG_ID,
        {
          patientId: 'patient-1',
          type: IncidentType.VIOLENCIA,
          description: 'Situación reportada por el apoderado.',
          occurredAt: '2026-03-01',
        },
        professional,
        context,
      );
      expect(dto.patientId).toBe('patient-1');
    });

    it('rechaza con 404 si el paciente no está asignado al PROFESSIONAL', async () => {
      prisma.patients['patient-1'] = { id: 'patient-1', firstName: 'Sofía', lastName: 'Gómez' };
      agendaAccess.assignedIds = [];

      await expect(
        service.create(
          ORG_ID,
          {
            patientId: 'patient-1',
            type: IncidentType.ABUSO,
            description: 'x',
            occurredAt: '2026-03-01',
          },
          professional,
          context,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ADMIN puede reportar sobre cualquier paciente de la organización', async () => {
      prisma.patients['patient-1'] = { id: 'patient-1', firstName: 'Sofía', lastName: 'Gómez' };

      const dto = await service.create(
        ORG_ID,
        {
          patientId: 'patient-1',
          type: IncidentType.SITUACION_GRAVE,
          description: 'x',
          occurredAt: '2026-03-01',
        },
        admin,
        context,
      );
      expect(dto.patientId).toBe('patient-1');
    });

    it('rechaza con 404 si el paciente no existe en la organización', async () => {
      await expect(
        service.create(
          ORG_ID,
          {
            patientId: 'no-existe',
            type: IncidentType.ACCIDENTE,
            description: 'x',
            occurredAt: '2026-03-01',
          },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('notifica a los administradores por WhatsApp si la organización lo tiene configurado', async () => {
      prisma.organizationWhatsappPhoneNumberId = 'wa-org-a';
      prisma.admins = [{ phone: '+56900000001' }];

      await service.create(
        ORG_ID,
        { type: IncidentType.VIOLENCIA, description: 'x', occurredAt: '2026-03-01' },
        professional,
        context,
      );
      expect(messaging.sendCalls).toHaveLength(1);
    });

    it('no falla ni intenta notificar si la organización no tiene WhatsApp configurado', async () => {
      prisma.organizationWhatsappPhoneNumberId = null;

      await service.create(
        ORG_ID,
        { type: IncidentType.VIOLENCIA, description: 'x', occurredAt: '2026-03-01' },
        professional,
        context,
      );
      expect(messaging.sendCalls).toHaveLength(0);
    });
  });

  describe('findMany', () => {
    it('ADMIN ve todas las incidencias de la organización, sin filtro de reportante', async () => {
      repo.entries.push(
        makeIncident({ reportedById: 'prof-1' }),
        makeIncident({ id: 'incident-2', reportedById: 'admin-1' }),
      );
      const result = await service.findMany(ORG_ID, admin, {});
      expect(result.total).toBe(2);
      expect(repo.lastFilters?.reportedById).toBeUndefined();
    });

    it('PROFESSIONAL solo ve las que reportó', async () => {
      repo.entries.push(makeIncident({ reportedById: 'prof-1' }));
      await service.findMany(ORG_ID, professional, {});
      expect(repo.lastFilters?.reportedById).toBe('prof-1');
    });
  });

  describe('findOne', () => {
    it('PROFESSIONAL recibe 404 al pedir una incidencia que no reportó', async () => {
      repo.entries.push(makeIncident({ reportedById: 'admin-1' }));
      await expect(service.findOne(ORG_ID, professional, 'incident-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('PROFESSIONAL puede ver la que sí reportó', async () => {
      repo.entries.push(makeIncident({ reportedById: 'prof-1' }));
      const dto = await service.findOne(ORG_ID, professional, 'incident-1');
      expect(dto.id).toBe('incident-1');
    });
  });

  describe('updateStatus', () => {
    it('ADMIN mueve ABIERTA -> EN_REVISION -> CERRADA', async () => {
      repo.entries.push(makeIncident());
      const inReview = await service.updateStatus(
        ORG_ID,
        'incident-1',
        { status: IncidentStatus.EN_REVISION },
        admin,
        context,
      );
      expect(inReview.status).toBe(IncidentStatus.EN_REVISION);

      const closed = await service.updateStatus(
        ORG_ID,
        'incident-1',
        { status: IncidentStatus.CERRADA },
        admin,
        context,
      );
      expect(closed.status).toBe(IncidentStatus.CERRADA);
      expect(audit.entries).toHaveLength(2);
    });

    it('rechaza modificar una incidencia ya CERRADA', async () => {
      repo.entries.push(makeIncident({ status: IncidentStatus.CERRADA }));
      await expect(
        service.updateStatus(
          ORG_ID,
          'incident-1',
          { status: IncidentStatus.ABIERTA },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('404 sobre una incidencia inexistente', async () => {
      await expect(
        service.updateStatus(
          ORG_ID,
          'no-existe',
          { status: IncidentStatus.CERRADA },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
