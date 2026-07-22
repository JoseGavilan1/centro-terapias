import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { ClinicalConfidentiality, Specialty, UserRole } from '@centro/shared';
import {
  AgendaAccessService,
  AttendedAppointmentContext,
} from '../../agenda/application/agenda-access.service';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateEvolutionData,
  EvolutionFilters,
  EvolutionRecord,
  EvolutionRepository,
} from '../domain/evolution.repository';
import { EvolutionsService } from './evolutions.service';

const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';
const PATIENT_ID = 'patient-1';

function makeEvolution(overrides: Partial<EvolutionRecord> = {}): EvolutionRecord {
  return {
    id: 'evo-1',
    organizationId: ORG_ID,
    patientId: PATIENT_ID,
    authorId: 'prof-1',
    appointmentId: null,
    amendsId: null,
    date: new Date('2026-07-01'),
    observation: 'Buena evolución',
    workPlan: 'Continuar ejercicios',
    confidentiality: ClinicalConfidentiality.STANDARD,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

class FakeEvolutionRepository implements EvolutionRepository {
  evolutions: EvolutionRecord[] = [];
  private seq = 0;

  findById(organizationId: string, id: string): Promise<EvolutionRecord | null> {
    return Promise.resolve(
      this.evolutions.find((e) => e.id === id && e.organizationId === organizationId) ?? null,
    );
  }

  findMany(
    organizationId: string,
    filters: EvolutionFilters,
  ): Promise<{ data: EvolutionRecord[]; total: number }> {
    const data = this.evolutions.filter(
      (e) => e.organizationId === organizationId && e.patientId === filters.patientId,
    );
    return Promise.resolve({ data, total: data.length });
  }

  findByAppointmentId(
    organizationId: string,
    appointmentId: string,
  ): Promise<EvolutionRecord | null> {
    return Promise.resolve(
      this.evolutions.find(
        (e) => e.organizationId === organizationId && e.appointmentId === appointmentId,
      ) ?? null,
    );
  }

  create(data: CreateEvolutionData): Promise<EvolutionRecord> {
    this.seq += 1;
    const evolution = makeEvolution({ ...data, id: `evo-${this.seq}` });
    this.evolutions.push(evolution);
    return Promise.resolve(evolution);
  }
}

class FakePrismaService {
  patients: { id: string; organizationId: string }[] = [];
  patient = {
    findFirst: ({ where }: { where: { id: string; organizationId: string } }) => {
      const found = this.patients.find(
        (p) => p.id === where.id && p.organizationId === where.organizationId,
      );
      return Promise.resolve(found ? { id: found.id } : null);
    },
  };
}

class FakeAgendaAccessService {
  assignedPatientIds: string[] = [];
  attendedAppointments: Record<string, AttendedAppointmentContext> = {};

  getAssignedPatientIds(): Promise<string[]> {
    return Promise.resolve(this.assignedPatientIds);
  }

  getAttendedAppointmentContext(
    _organizationId: string,
    appointmentId: string,
  ): Promise<AttendedAppointmentContext | null> {
    return Promise.resolve(this.attendedAppointments[appointmentId] ?? null);
  }
}

class FakeAuditService {
  entries: Array<{ newValue?: unknown }> = [];
  log(entry: { newValue?: unknown }): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

describe('EvolutionsService', () => {
  let repo: FakeEvolutionRepository;
  let prisma: FakePrismaService;
  let agendaAccess: FakeAgendaAccessService;
  let audit: FakeAuditService;
  let service: EvolutionsService;
  let admin: AuthenticatedUser;
  let professional: AuthenticatedUser;
  let psychologist: AuthenticatedUser;
  const context = { ip: '127.0.0.1', userAgent: 'jest' };
  const validDto = {
    date: '2026-07-01',
    observation: 'Buena evolución',
    workPlan: 'Continuar ejercicios',
  };

  beforeEach(() => {
    repo = new FakeEvolutionRepository();
    prisma = new FakePrismaService();
    agendaAccess = new FakeAgendaAccessService();
    audit = new FakeAuditService();
    service = new EvolutionsService(
      repo,
      prisma as unknown as PrismaService,
      agendaAccess as unknown as AgendaAccessService,
      audit as unknown as AuditService,
    );

    prisma.patients = [{ id: PATIENT_ID, organizationId: ORG_ID }];
    agendaAccess.assignedPatientIds = [PATIENT_ID];

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
      specialty: Specialty.KINESIOLOGIA,
    };
    psychologist = {
      userId: 'psych-1',
      organizationId: ORG_ID,
      email: 'psych@demo.cl',
      role: UserRole.PROFESSIONAL,
      specialty: Specialty.PSICOLOGIA,
    };
  });

  describe('create', () => {
    it('crea una evolución STANDARD para un profesional no-psicólogo', async () => {
      const dto = await service.create(ORG_ID, professional, PATIENT_ID, validDto, context);
      expect(dto.confidentiality).toBe(ClinicalConfidentiality.STANDARD);
      expect(dto.redacted).toBe(false);
      expect(dto.observation).toBe('Buena evolución');
      expect(audit.entries).toHaveLength(1);
    });

    it('crea una evolución PSYCHOLOGICAL para un psicólogo y la devuelve completa a su propio autor', async () => {
      const dto = await service.create(ORG_ID, psychologist, PATIENT_ID, validDto, context);
      expect(dto.confidentiality).toBe(ClinicalConfidentiality.PSYCHOLOGICAL);
      expect(dto.redacted).toBe(false);
      expect(dto.workPlan).toBe('Continuar ejercicios');
    });

    it('rechaza con 404 a un profesional fuera del alcance de agenda del paciente', async () => {
      agendaAccess.assignedPatientIds = [];
      await expect(
        service.create(ORG_ID, professional, PATIENT_ID, validDto, context),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ADMIN no tiene restricción de alcance por agenda', async () => {
      agendaAccess.assignedPatientIds = [];
      const dto = await service.create(ORG_ID, admin, PATIENT_ID, validDto, context);
      expect(dto.id).toBeDefined();
    });

    it('rechaza con 404 un paciente inexistente en la organización', async () => {
      prisma.patients = [];
      await expect(
        service.create(ORG_ID, admin, PATIENT_ID, validDto, context),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    describe('vínculo con appointmentId', () => {
      it('vincula una evolución a una cita propia ATENDIDA', async () => {
        agendaAccess.attendedAppointments['appt-1'] = {
          patientId: PATIENT_ID,
          professionalId: professional.userId,
        };
        const dto = await service.create(
          ORG_ID,
          professional,
          PATIENT_ID,
          { ...validDto, appointmentId: 'appt-1' },
          context,
        );
        expect(dto.appointmentId).toBe('appt-1');
      });

      it('rechaza una segunda evolución para la misma cita (409)', async () => {
        agendaAccess.attendedAppointments['appt-1'] = {
          patientId: PATIENT_ID,
          professionalId: professional.userId,
        };
        await service.create(
          ORG_ID,
          professional,
          PATIENT_ID,
          { ...validDto, appointmentId: 'appt-1' },
          context,
        );
        await expect(
          service.create(
            ORG_ID,
            professional,
            PATIENT_ID,
            { ...validDto, appointmentId: 'appt-1' },
            context,
          ),
        ).rejects.toBeInstanceOf(ConflictException);
      });

      it('rechaza una cita de otro profesional', async () => {
        agendaAccess.attendedAppointments['appt-2'] = {
          patientId: PATIENT_ID,
          professionalId: 'other-prof',
        };
        await expect(
          service.create(
            ORG_ID,
            professional,
            PATIENT_ID,
            { ...validDto, appointmentId: 'appt-2' },
            context,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('rechaza una cita que no está en estado ATENDIDA', async () => {
        await expect(
          service.create(
            ORG_ID,
            professional,
            PATIENT_ID,
            { ...validDto, appointmentId: 'appt-inexistente' },
            context,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('rechaza una cita ATENDIDA de otro paciente', async () => {
        agendaAccess.attendedAppointments['appt-3'] = {
          patientId: 'other-patient',
          professionalId: professional.userId,
        };
        await expect(
          service.create(
            ORG_ID,
            professional,
            PATIENT_ID,
            { ...validDto, appointmentId: 'appt-3' },
            context,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    describe('corrección vía amendsId', () => {
      it('permite crear una evolución que corrige una anterior del mismo paciente', async () => {
        repo.evolutions.push(makeEvolution({ id: 'evo-old' }));
        const dto = await service.create(
          ORG_ID,
          professional,
          PATIENT_ID,
          { ...validDto, amendsId: 'evo-old' },
          context,
        );
        expect(dto.amendsId).toBe('evo-old');
      });

      it('rechaza un amendsId de otro paciente', async () => {
        repo.evolutions.push(makeEvolution({ id: 'evo-other', patientId: 'other-patient' }));
        await expect(
          service.create(
            ORG_ID,
            professional,
            PATIENT_ID,
            { ...validDto, amendsId: 'evo-other' },
            context,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      });

      it('rechaza un amendsId inexistente', async () => {
        await expect(
          service.create(
            ORG_ID,
            professional,
            PATIENT_ID,
            { ...validDto, amendsId: 'inexistente' },
            context,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      });
    });

    describe('auditoría', () => {
      it('omite observation/workPlan del newValue auditado cuando la evolución es PSYCHOLOGICAL', async () => {
        await service.create(ORG_ID, psychologist, PATIENT_ID, validDto, context);
        const newValue = audit.entries[0].newValue as Record<string, unknown>;
        expect(newValue.observation).toBeUndefined();
        expect(newValue.workPlan).toBeUndefined();
      });

      it('incluye observation/workPlan del newValue auditado cuando la evolución es STANDARD', async () => {
        await service.create(ORG_ID, professional, PATIENT_ID, validDto, context);
        const newValue = audit.entries[0].newValue as Record<string, unknown>;
        expect(newValue.observation).toBe('Buena evolución');
      });
    });
  });

  describe('findMany / findOne — redacción por confidencialidad', () => {
    beforeEach(() => {
      repo.evolutions.push(
        makeEvolution({
          id: 'evo-std',
          confidentiality: ClinicalConfidentiality.STANDARD,
          authorId: professional.userId,
        }),
        makeEvolution({
          id: 'evo-psy',
          confidentiality: ClinicalConfidentiality.PSYCHOLOGICAL,
          authorId: psychologist.userId,
        }),
      );
    });

    it('ADMIN ve el contenido STANDARD completo y el PSYCHOLOGICAL redactado', async () => {
      const result = await service.findMany(ORG_ID, admin, PATIENT_ID, {});
      const std = result.data.find((e) => e.id === 'evo-std')!;
      const psy = result.data.find((e) => e.id === 'evo-psy')!;
      expect(std.redacted).toBe(false);
      expect(std.observation).not.toBeNull();
      expect(psy.redacted).toBe(true);
      expect(psy.observation).toBeNull();
      expect(psy.workPlan).toBeNull();
      expect(psy.amendsId).toBeNull();
    });

    it('un profesional no-psicólogo ve el PSYCHOLOGICAL redactado aunque el paciente esté en su alcance', async () => {
      const result = await service.findMany(ORG_ID, professional, PATIENT_ID, {});
      const psy = result.data.find((e) => e.id === 'evo-psy')!;
      expect(psy.redacted).toBe(true);
    });

    it('un profesional psicólogo ve el PSYCHOLOGICAL completo', async () => {
      const result = await service.findMany(ORG_ID, psychologist, PATIENT_ID, {});
      const psy = result.data.find((e) => e.id === 'evo-psy')!;
      expect(psy.redacted).toBe(false);
      expect(psy.observation).toBe('Buena evolución');
    });

    it('findOne redacta igual que findMany para un actor sin acceso psicológico', async () => {
      const dto = await service.findOne(ORG_ID, admin, PATIENT_ID, 'evo-psy');
      expect(dto.redacted).toBe(true);
    });

    it('findOne lanza 404 si la evolución no pertenece al paciente indicado', async () => {
      repo.evolutions.push(makeEvolution({ id: 'evo-otro-paciente', patientId: 'other-patient' }));
      await expect(
        service.findOne(ORG_ID, admin, PATIENT_ID, 'evo-otro-paciente'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('un profesional fuera del alcance del paciente recibe 404 en findMany', async () => {
      agendaAccess.assignedPatientIds = [];
      await expect(service.findMany(ORG_ID, professional, PATIENT_ID, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('una evolución de otra organización se comporta como inexistente', async () => {
      repo.evolutions.push(makeEvolution({ id: 'evo-otra-org', organizationId: OTHER_ORG_ID }));
      await expect(
        service.findOne(ORG_ID, admin, PATIENT_ID, 'evo-otra-org'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
