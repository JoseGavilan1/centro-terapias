import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole, Weekday } from '@centro/shared';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  CreateTherapySlotData,
  TherapySlotRecord,
  TherapySlotRepository,
  UpdateTherapySlotData,
} from '../domain/therapy-slot.repository';
import { AgendaValidationService } from './agenda-validation.service';
import { TherapySlotsService } from './therapy-slots.service';

const ORG_ID = 'org-1';
const PATIENT_ID = 'patient-1';
const PROFESSIONAL_ID = 'professional-1';

function makeSlot(overrides: Partial<TherapySlotRecord> = {}): TherapySlotRecord {
  return {
    id: 'slot-1',
    organizationId: ORG_ID,
    patientId: PATIENT_ID,
    professionalId: PROFESSIONAL_ID,
    weekday: Weekday.MONDAY,
    startMinute: 9 * 60,
    durationMinutes: 45,
    validFrom: new Date('2026-01-01'),
    validTo: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

class FakeTherapySlotRepository implements TherapySlotRepository {
  slots: TherapySlotRecord[] = [];
  private seq = 0;

  findById(organizationId: string, id: string): Promise<TherapySlotRecord | null> {
    return Promise.resolve(
      this.slots.find((s) => s.id === id && s.organizationId === organizationId) ?? null,
    );
  }

  findMany(
    organizationId: string,
    filters: { professionalId?: string; patientId?: string },
  ): Promise<{ data: TherapySlotRecord[]; total: number }> {
    const data = this.slots.filter(
      (s) =>
        s.organizationId === organizationId &&
        (!filters.professionalId || s.professionalId === filters.professionalId) &&
        (!filters.patientId || s.patientId === filters.patientId),
    );
    return Promise.resolve({ data, total: data.length });
  }

  findActiveByProfessionalAndWeekday(
    organizationId: string,
    professionalId: string,
    weekday: Weekday,
    excludeId?: string,
  ): Promise<TherapySlotRecord[]> {
    return Promise.resolve(
      this.slots.filter(
        (s) =>
          s.organizationId === organizationId &&
          s.professionalId === professionalId &&
          s.weekday === weekday &&
          s.isActive &&
          s.id !== excludeId,
      ),
    );
  }

  findActiveByPatientAndWeekday(
    organizationId: string,
    patientId: string,
    weekday: Weekday,
    excludeId?: string,
  ): Promise<TherapySlotRecord[]> {
    return Promise.resolve(
      this.slots.filter(
        (s) =>
          s.organizationId === organizationId &&
          s.patientId === patientId &&
          s.weekday === weekday &&
          s.isActive &&
          s.id !== excludeId,
      ),
    );
  }

  findAllActive(organizationId: string): Promise<TherapySlotRecord[]> {
    return Promise.resolve(
      this.slots.filter((s) => s.organizationId === organizationId && s.isActive),
    );
  }

  findAssignedPatientIds(organizationId: string, professionalId: string): Promise<string[]> {
    const ids = this.slots
      .filter(
        (s) =>
          s.organizationId === organizationId && s.professionalId === professionalId && s.isActive,
      )
      .map((s) => s.patientId);
    return Promise.resolve([...new Set(ids)]);
  }

  create(data: CreateTherapySlotData): Promise<TherapySlotRecord> {
    this.seq += 1;
    const slot = makeSlot({ ...data, id: `slot-${this.seq}` });
    this.slots.push(slot);
    return Promise.resolve(slot);
  }

  update(
    organizationId: string,
    id: string,
    data: UpdateTherapySlotData,
  ): Promise<TherapySlotRecord> {
    const idx = this.slots.findIndex((s) => s.id === id && s.organizationId === organizationId);
    if (idx === -1) {
      throw new NotFoundException('Plantilla no encontrada');
    }
    const definedChanges = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    this.slots[idx] = { ...this.slots[idx], ...definedChanges, updatedAt: new Date() };
    return Promise.resolve(this.slots[idx]);
  }
}

class FakeAgendaValidationService {
  invalidPatientIds = new Set<string>();
  invalidProfessionalIds = new Set<string>();
  nonProfessionalIds = new Set<string>();

  assertPatientExists(_organizationId: string, patientId: string): Promise<void> {
    if (this.invalidPatientIds.has(patientId)) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return Promise.resolve();
  }

  assertProfessionalValid(_organizationId: string, professionalId: string): Promise<void> {
    if (this.invalidProfessionalIds.has(professionalId)) {
      throw new NotFoundException('Profesional no encontrado');
    }
    if (this.nonProfessionalIds.has(professionalId)) {
      throw new BadRequestException(
        'Solo un usuario con rol PROFESSIONAL puede tener slots o citas',
      );
    }
    return Promise.resolve();
  }
}

class FakeAuditService {
  entries: unknown[] = [];
  log(entry: unknown): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

describe('TherapySlotsService', () => {
  let repo: FakeTherapySlotRepository;
  let validation: FakeAgendaValidationService;
  let audit: FakeAuditService;
  let service: TherapySlotsService;
  let admin: AuthenticatedUser;
  let professional: AuthenticatedUser;
  const context = { ip: '127.0.0.1', userAgent: 'jest' };

  const validDto = {
    patientId: PATIENT_ID,
    professionalId: PROFESSIONAL_ID,
    weekday: Weekday.MONDAY,
    startTime: '09:00',
    durationMinutes: 45,
    validFrom: '2026-01-01',
  };

  beforeEach(() => {
    repo = new FakeTherapySlotRepository();
    validation = new FakeAgendaValidationService();
    audit = new FakeAuditService();
    service = new TherapySlotsService(
      repo,
      validation as unknown as AgendaValidationService,
      audit as unknown as AuditService,
    );
    admin = {
      userId: 'admin-1',
      organizationId: ORG_ID,
      email: 'admin@demo.cl',
      role: UserRole.ADMIN,
      specialty: null,
    };
    professional = {
      userId: PROFESSIONAL_ID,
      organizationId: ORG_ID,
      email: 'prof@demo.cl',
      role: UserRole.PROFESSIONAL,
      specialty: null,
    };
  });

  describe('create', () => {
    it('crea un slot válido y audita CREATE', async () => {
      const dto = await service.create(ORG_ID, validDto, admin, context);
      expect(dto.startTime).toBe('09:00');
      expect(dto.isActive).toBe(true);
      expect(audit.entries).toHaveLength(1);
    });

    it('rechaza solapamiento con un slot activo del mismo profesional en el mismo weekday', async () => {
      repo.slots.push(makeSlot());
      await expect(
        service.create(ORG_ID, { ...validDto, patientId: 'other-patient' }, admin, context),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rechaza solapamiento con un slot activo del mismo paciente en el mismo weekday', async () => {
      repo.slots.push(makeSlot());
      await expect(
        service.create(
          ORG_ID,
          { ...validDto, professionalId: 'other-professional' },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('permite horarios distintos sin solapamiento en el mismo weekday', async () => {
      repo.slots.push(makeSlot({ startMinute: 9 * 60, durationMinutes: 45 }));
      const dto = await service.create(
        ORG_ID,
        {
          ...validDto,
          patientId: 'other-patient',
          professionalId: 'other-professional',
          startTime: '11:00',
        },
        admin,
        context,
      );
      expect(dto.startTime).toBe('11:00');
    });

    it('permite el mismo weekday si las vigencias no se cruzan', async () => {
      repo.slots.push(
        makeSlot({ validFrom: new Date('2025-01-01'), validTo: new Date('2025-06-01') }),
      );
      const dto = await service.create(
        ORG_ID,
        { ...validDto, patientId: 'other-patient', validFrom: '2025-07-01' },
        admin,
        context,
      );
      expect(dto.validFrom).toBe('2025-07-01');
    });

    it('rechaza un profesional inexistente en la organización', async () => {
      validation.invalidProfessionalIds.add(PROFESSIONAL_ID);
      await expect(service.create(ORG_ID, validDto, admin, context)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('rechaza un professionalId que no tiene rol PROFESSIONAL', async () => {
      validation.nonProfessionalIds.add(PROFESSIONAL_ID);
      await expect(service.create(ORG_ID, validDto, admin, context)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rechaza validTo anterior a validFrom', async () => {
      await expect(
        service.create(
          ORG_ID,
          { ...validDto, validFrom: '2026-03-01', validTo: '2026-01-01' },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('update', () => {
    it('revalida solapamiento cuando cambia el horario', async () => {
      const slot =
        repo.slots[0] ?? (await service.create(ORG_ID, validDto, admin, context), repo.slots[0]);
      repo.slots.push(makeSlot({ id: 'slot-2', patientId: 'other-patient', startMinute: 10 * 60 }));
      await expect(
        service.update(ORG_ID, slot.id, { startTime: '10:15' }, admin, context),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('no revalida solapamiento contra sí mismo', async () => {
      await service.create(ORG_ID, validDto, admin, context);
      const slot = repo.slots[0];
      const dto = await service.update(ORG_ID, slot.id, { durationMinutes: 60 }, admin, context);
      expect(dto.durationMinutes).toBe(60);
    });

    it('permite reactivar/desactivar vía isActive sin revalidar solapamiento', async () => {
      await service.create(ORG_ID, validDto, admin, context);
      const slot = repo.slots[0];
      const dto = await service.update(ORG_ID, slot.id, { isActive: false }, admin, context);
      expect(dto.isActive).toBe(false);
    });

    it('lanza 404 sobre un slot de otra organización', async () => {
      repo.slots.push(makeSlot({ organizationId: 'org-2' }));
      await expect(
        service.update(ORG_ID, 'slot-1', { durationMinutes: 30 }, admin, context),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('deactivate', () => {
    it('desactiva, audita DELETE y no borra el registro', async () => {
      await service.create(ORG_ID, validDto, admin, context);
      const slot = repo.slots[0];
      await service.deactivate(ORG_ID, slot.id, admin, context);
      expect((await repo.findById(ORG_ID, slot.id))?.isActive).toBe(false);
      expect(audit.entries).toHaveLength(2); // CREATE + DELETE
    });

    it('es idempotente sobre un slot ya inactivo', async () => {
      repo.slots.push(makeSlot({ isActive: false }));
      await service.deactivate(ORG_ID, 'slot-1', admin, context);
      expect(audit.entries).toHaveLength(0);
    });
  });

  describe('findMany', () => {
    it('ADMIN ve todos los slots de la organización', async () => {
      repo.slots.push(
        makeSlot({ id: 'slot-1' }),
        makeSlot({ id: 'slot-2', professionalId: 'other-professional' }),
      );
      const result = await service.findMany(ORG_ID, admin, {});
      expect(result.data).toHaveLength(2);
    });

    it('PROFESSIONAL solo ve sus propios slots aunque envíe otro professionalId por query', async () => {
      repo.slots.push(
        makeSlot({ id: 'slot-1', professionalId: PROFESSIONAL_ID }),
        makeSlot({ id: 'slot-2', professionalId: 'other-professional' }),
      );
      const result = await service.findMany(ORG_ID, professional, {
        professionalId: 'other-professional',
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].professionalId).toBe(PROFESSIONAL_ID);
    });
  });
});
