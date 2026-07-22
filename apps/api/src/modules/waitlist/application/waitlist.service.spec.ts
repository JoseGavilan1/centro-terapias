import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Specialty, UserRole, WaitlistStatus, Weekday } from '@centro/shared';
import { TherapySlotsService } from '../../agenda/application/therapy-slots.service';
import { AuditService } from '../../audit/application/audit.service';
import { PatientsService } from '../../patients/application/patients.service';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateWaitlistEntryData,
  UpdateWaitlistEntryData,
  WaitlistEntryFilters,
  WaitlistEntryRecord,
  WaitlistEntryRepository,
} from '../domain/waitlist-entry.repository';
import { WaitlistService } from './waitlist.service';

const ORG_ID = 'org-1';

function makeEntry(overrides: Partial<WaitlistEntryRecord> = {}): WaitlistEntryRecord {
  return {
    id: 'entry-1',
    organizationId: ORG_ID,
    childFirstName: 'Martina',
    childLastName: 'Soto',
    childRut: '12345678-5',
    childBirthDate: new Date('2019-05-10T00:00:00Z'),
    guardianName: 'Paula Soto',
    guardianPhone: '+56911111111',
    guardianEmail: null,
    requestedSpecialty: Specialty.FONOAUDIOLOGIA,
    reason: 'Retraso del lenguaje',
    sede: null,
    status: WaitlistStatus.PENDIENTE,
    assignedPatientId: null,
    assignedTherapySlotId: null,
    discardReason: null,
    resolvedAt: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

class FakeWaitlistEntryRepository implements WaitlistEntryRepository {
  entries: WaitlistEntryRecord[] = [];
  private seq = 0;
  organizationTokens: Record<string, string> = {};

  findById(organizationId: string, id: string): Promise<WaitlistEntryRecord | null> {
    return Promise.resolve(
      this.entries.find((e) => e.id === id && e.organizationId === organizationId) ?? null,
    );
  }

  findMany(
    organizationId: string,
    filters: WaitlistEntryFilters,
  ): Promise<{ data: WaitlistEntryRecord[]; total: number }> {
    const data = this.entries.filter(
      (e) =>
        e.organizationId === organizationId &&
        (!filters.status || e.status === filters.status) &&
        (!filters.requestedSpecialty || e.requestedSpecialty === filters.requestedSpecialty),
    );
    return Promise.resolve({ data, total: data.length });
  }

  create(data: CreateWaitlistEntryData): Promise<WaitlistEntryRecord> {
    this.seq += 1;
    const entry = makeEntry({ ...data, id: `entry-${this.seq}`, status: WaitlistStatus.PENDIENTE });
    this.entries.push(entry);
    return Promise.resolve(entry);
  }

  update(
    organizationId: string,
    id: string,
    data: UpdateWaitlistEntryData,
  ): Promise<WaitlistEntryRecord> {
    const idx = this.entries.findIndex((e) => e.id === id && e.organizationId === organizationId);
    if (idx === -1) {
      throw new NotFoundException('Entrada no encontrada');
    }
    const definedChanges = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    this.entries[idx] = { ...this.entries[idx], ...definedChanges, updatedAt: new Date() };
    return Promise.resolve(this.entries[idx]);
  }

  findOrganizationIdByIntakeToken(token: string): Promise<string | null> {
    return Promise.resolve(this.organizationTokens[token] ?? null);
  }
}

class FakeAuditService {
  entries: unknown[] = [];
  log(entry: unknown): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

class FakePatientsService {
  createCalls: unknown[] = [];
  nextId = 'patient-1';
  shouldConflict = false;

  create(
    organizationId: string,
    dto: Record<string, unknown>,
  ): Promise<{ id: string; rut: string }> {
    this.createCalls.push({ organizationId, dto });
    if (this.shouldConflict) {
      return Promise.reject(new ConflictException('Ya existe un paciente con ese RUT'));
    }
    return Promise.resolve({ id: this.nextId, rut: dto.rut as string });
  }
}

class FakeTherapySlotsService {
  createCalls: unknown[] = [];
  nextId = 'slot-1';
  shouldConflict = false;

  create(organizationId: string, dto: Record<string, unknown>): Promise<{ id: string }> {
    this.createCalls.push({ organizationId, dto });
    if (this.shouldConflict) {
      return Promise.reject(new ConflictException('Horario solapado'));
    }
    return Promise.resolve({ id: this.nextId });
  }
}

class FakePrismaService {
  deletedPatientIds: string[] = [];
  patient = {
    delete: ({ where }: { where: { id: string } }) => {
      this.deletedPatientIds.push(where.id);
      return Promise.resolve();
    },
  };
}

describe('WaitlistService', () => {
  let repo: FakeWaitlistEntryRepository;
  let audit: FakeAuditService;
  let patientsService: FakePatientsService;
  let therapySlotsService: FakeTherapySlotsService;
  let prisma: FakePrismaService;
  let service: WaitlistService;
  let admin: AuthenticatedUser;
  const context = { ip: '127.0.0.1', userAgent: 'jest' };

  const assignDto = {
    professionalId: 'prof-1',
    weekday: Weekday.MONDAY,
    startTime: '09:00',
    durationMinutes: 45,
    validFrom: '2026-03-01',
  };

  beforeEach(() => {
    repo = new FakeWaitlistEntryRepository();
    audit = new FakeAuditService();
    patientsService = new FakePatientsService();
    therapySlotsService = new FakeTherapySlotsService();
    prisma = new FakePrismaService();
    service = new WaitlistService(
      repo,
      patientsService as unknown as PatientsService,
      therapySlotsService as unknown as TherapySlotsService,
      audit as unknown as AuditService,
      prisma as unknown as PrismaService,
    );
    admin = {
      userId: 'admin-1',
      organizationId: ORG_ID,
      email: 'admin@demo.cl',
      role: UserRole.ADMIN,
      specialty: null,
    };
  });

  describe('intake / create', () => {
    it('crea una entrada PENDIENTE vía webhook sin auditoría (sin actor)', async () => {
      const dto = await service.intake(ORG_ID, {
        childFirstName: 'Martina',
        childLastName: 'Soto',
        guardianName: 'Paula Soto',
        guardianPhone: '+56911111111',
      });
      expect(dto.status).toBe(WaitlistStatus.PENDIENTE);
      expect(audit.entries).toHaveLength(0);
    });

    it('crea una entrada manual y audita CREATE', async () => {
      const dto = await service.create(
        ORG_ID,
        {
          childFirstName: 'Martina',
          childLastName: 'Soto',
          guardianName: 'Paula Soto',
          guardianPhone: '+56911111111',
        },
        admin,
        context,
      );
      expect(dto.status).toBe(WaitlistStatus.PENDIENTE);
      expect(audit.entries).toHaveLength(1);
    });
  });

  describe('assign', () => {
    it('crea Patient + TherapySlot, marca ASIGNADA y propaga sede', async () => {
      repo.entries.push(makeEntry());
      const dto = await service.assign(ORG_ID, 'entry-1', { ...assignDto, sede: 'Providencia' }, admin, context);

      expect(dto.status).toBe(WaitlistStatus.ASIGNADA);
      expect(dto.assignedPatientId).toBe('patient-1');
      expect(dto.assignedTherapySlotId).toBe('slot-1');
      expect(dto.sede).toBe('Providencia');
      expect(patientsService.createCalls).toHaveLength(1);
      expect(therapySlotsService.createCalls).toHaveLength(1);
    });

    it('usa el rut/fecha de nacimiento de la entrada cuando el DTO no los envía', async () => {
      repo.entries.push(makeEntry());
      await service.assign(ORG_ID, 'entry-1', assignDto, admin, context);
      const call = patientsService.createCalls[0] as { dto: Record<string, unknown> };
      expect(call.dto.rut).toBe('12345678-5');
      expect(call.dto.birthDate).toBe('2019-05-10');
    });

    it('exige rut si ni la entrada ni el DTO lo traen', async () => {
      repo.entries.push(makeEntry({ childRut: null }));
      await expect(
        service.assign(ORG_ID, 'entry-1', assignDto, admin, context),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('propaga 409 si el RUT ya pertenece a un paciente existente, entrada sigue PENDIENTE', async () => {
      repo.entries.push(makeEntry());
      patientsService.shouldConflict = true;
      await expect(
        service.assign(ORG_ID, 'entry-1', assignDto, admin, context),
      ).rejects.toBeInstanceOf(ConflictException);
      const entry = await repo.findById(ORG_ID, 'entry-1');
      expect(entry?.status).toBe(WaitlistStatus.PENDIENTE);
    });

    it('compensa (borra el paciente creado) si falla la creación del horario', async () => {
      repo.entries.push(makeEntry());
      therapySlotsService.shouldConflict = true;
      await expect(
        service.assign(ORG_ID, 'entry-1', assignDto, admin, context),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.deletedPatientIds).toEqual(['patient-1']);
      const entry = await repo.findById(ORG_ID, 'entry-1');
      expect(entry?.status).toBe(WaitlistStatus.PENDIENTE);
      expect(entry?.assignedPatientId).toBeNull();
    });

    it('rechaza asignar una entrada que ya no está PENDIENTE', async () => {
      repo.entries.push(makeEntry({ status: WaitlistStatus.DESCARTADA }));
      await expect(
        service.assign(ORG_ID, 'entry-1', assignDto, admin, context),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lanza 404 sobre una entrada de otra organización', async () => {
      repo.entries.push(makeEntry({ organizationId: 'org-2' }));
      await expect(
        service.assign(ORG_ID, 'entry-1', assignDto, admin, context),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('discard', () => {
    it('marca DESCARTADA con el motivo indicado', async () => {
      repo.entries.push(makeEntry());
      const dto = await service.discard(ORG_ID, 'entry-1', { reason: 'No respondió' }, admin, context);
      expect(dto.status).toBe(WaitlistStatus.DESCARTADA);
      expect(dto.discardReason).toBe('No respondió');
      expect(dto.resolvedAt).not.toBeNull();
    });

    it('rechaza descartar una entrada ya resuelta', async () => {
      repo.entries.push(makeEntry({ status: WaitlistStatus.ASIGNADA }));
      await expect(
        service.discard(ORG_ID, 'entry-1', { reason: 'x' }, admin, context),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('edita una entrada mientras sigue PENDIENTE', async () => {
      repo.entries.push(makeEntry());
      const dto = await service.update(ORG_ID, 'entry-1', { guardianPhone: '+56922222222' }, admin, context);
      expect(dto.guardianPhone).toBe('+56922222222');
    });

    it('rechaza editar una entrada ya resuelta', async () => {
      repo.entries.push(makeEntry({ status: WaitlistStatus.ASIGNADA }));
      await expect(
        service.update(ORG_ID, 'entry-1', { guardianPhone: '+56922222222' }, admin, context),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });
});
