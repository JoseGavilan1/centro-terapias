import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, ConfirmedVia, UserRole, Weekday } from '@centro/shared';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  AppointmentRecord,
  AppointmentRepository,
  CreateAppointmentData,
  OverlapCheckParams,
  UpdateAppointmentData,
} from '../domain/appointment.repository';
import { TherapySlotRecord, TherapySlotRepository } from '../domain/therapy-slot.repository';
import { AgendaValidationService } from './agenda-validation.service';
import { AppointmentsService } from './appointments.service';

const ORG_ID = 'org-1';
const PATIENT_ID = 'patient-1';
const PROFESSIONAL_ID = 'professional-1';

function makeAppointment(overrides: Partial<AppointmentRecord> = {}): AppointmentRecord {
  return {
    id: 'appt-1',
    organizationId: ORG_ID,
    therapySlotId: null,
    patientId: PATIENT_ID,
    professionalId: PROFESSIONAL_ID,
    date: new Date('2026-07-13'), // lunes
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

function overlapsRange(
  aStart: number,
  aDuration: number,
  bStart: number,
  bDuration: number,
): boolean {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

class FakeAppointmentRepository implements AppointmentRepository {
  appointments: AppointmentRecord[] = [];
  private seq = 0;

  findById(organizationId: string, id: string): Promise<AppointmentRecord | null> {
    return Promise.resolve(
      this.appointments.find((a) => a.id === id && a.organizationId === organizationId) ?? null,
    );
  }

  findMany(
    organizationId: string,
    filters: { professionalId?: string; patientId?: string; status?: AppointmentStatus },
  ): Promise<{ data: AppointmentRecord[]; total: number }> {
    const data = this.appointments.filter(
      (a) =>
        a.organizationId === organizationId &&
        (!filters.professionalId || a.professionalId === filters.professionalId) &&
        (!filters.patientId || a.patientId === filters.patientId) &&
        (!filters.status || a.status === filters.status),
    );
    return Promise.resolve({ data, total: data.length });
  }

  findOverlapping(
    organizationId: string,
    params: OverlapCheckParams,
  ): Promise<AppointmentRecord[]> {
    return Promise.resolve(
      this.appointments.filter(
        (a) =>
          a.organizationId === organizationId &&
          a.date.getTime() === params.date.getTime() &&
          a.status !== AppointmentStatus.CANCELADA &&
          (a.professionalId === params.professionalId || a.patientId === params.patientId) &&
          a.id !== params.excludeId &&
          overlapsRange(
            params.startMinute,
            params.durationMinutes,
            a.startMinute,
            a.durationMinutes,
          ),
      ),
    );
  }

  create(data: CreateAppointmentData): Promise<AppointmentRecord> {
    this.seq += 1;
    const appointment = makeAppointment({
      ...data,
      notes: data.notes ?? null,
      id: `appt-${this.seq}`,
    });
    this.appointments.push(appointment);
    return Promise.resolve(appointment);
  }

  createMany(data: CreateAppointmentData[]): Promise<number> {
    let created = 0;
    for (const row of data) {
      const exists = this.appointments.some(
        (a) => a.therapySlotId === row.therapySlotId && a.date.getTime() === row.date.getTime(),
      );
      if (!exists) {
        this.seq += 1;
        this.appointments.push(
          makeAppointment({ ...row, notes: row.notes ?? null, id: `appt-${this.seq}` }),
        );
        created += 1;
      }
    }
    return Promise.resolve(created);
  }

  findDueForReminder(from: Date, to: Date): Promise<AppointmentRecord[]> {
    return Promise.resolve(
      this.appointments.filter(
        (a) =>
          a.status === AppointmentStatus.PENDIENTE &&
          a.date.getTime() >= from.getTime() &&
          a.date.getTime() <= to.getTime(),
      ),
    );
  }

  update(
    organizationId: string,
    id: string,
    data: UpdateAppointmentData,
  ): Promise<AppointmentRecord> {
    const idx = this.appointments.findIndex(
      (a) => a.id === id && a.organizationId === organizationId,
    );
    if (idx === -1) {
      throw new NotFoundException('Cita no encontrada');
    }
    const definedChanges = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    this.appointments[idx] = {
      ...this.appointments[idx],
      ...definedChanges,
      updatedAt: new Date(),
    };
    return Promise.resolve(this.appointments[idx]);
  }
}

class FakeTherapySlotRepositoryStub implements TherapySlotRepository {
  slots: TherapySlotRecord[] = [];

  findAllActive(organizationId: string): Promise<TherapySlotRecord[]> {
    return Promise.resolve(
      this.slots.filter((s) => s.organizationId === organizationId && s.isActive),
    );
  }

  findById(): Promise<TherapySlotRecord | null> {
    throw new Error('not used in AppointmentsService tests');
  }
  findMany(): Promise<{ data: TherapySlotRecord[]; total: number }> {
    throw new Error('not used in AppointmentsService tests');
  }
  findActiveByProfessionalAndWeekday(): Promise<TherapySlotRecord[]> {
    throw new Error('not used in AppointmentsService tests');
  }
  findActiveByPatientAndWeekday(): Promise<TherapySlotRecord[]> {
    throw new Error('not used in AppointmentsService tests');
  }
  findAssignedPatientIds(): Promise<string[]> {
    throw new Error('not used in AppointmentsService tests');
  }
  create(): Promise<TherapySlotRecord> {
    throw new Error('not used in AppointmentsService tests');
  }
  update(): Promise<TherapySlotRecord> {
    throw new Error('not used in AppointmentsService tests');
  }
}

class FakeAgendaValidationService {
  assertPatientExists(): Promise<void> {
    return Promise.resolve();
  }
  assertProfessionalValid(): Promise<void> {
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

describe('AppointmentsService', () => {
  let appointmentRepo: FakeAppointmentRepository;
  let slotRepo: FakeTherapySlotRepositoryStub;
  let validation: FakeAgendaValidationService;
  let audit: FakeAuditService;
  let service: AppointmentsService;
  let admin: AuthenticatedUser;
  let professional: AuthenticatedUser;
  const context = { ip: '127.0.0.1', userAgent: 'jest' };

  beforeEach(() => {
    appointmentRepo = new FakeAppointmentRepository();
    slotRepo = new FakeTherapySlotRepositoryStub();
    validation = new FakeAgendaValidationService();
    audit = new FakeAuditService();
    service = new AppointmentsService(
      appointmentRepo,
      slotRepo,
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

  describe('create (sobrecupo)', () => {
    const dto = {
      patientId: PATIENT_ID,
      professionalId: PROFESSIONAL_ID,
      date: '2026-07-13',
      startTime: '15:00',
      durationMinutes: 30,
    };

    it('crea la cita en estado SOBRECUPO sin therapySlotId', async () => {
      const created = await service.create(ORG_ID, dto, admin, context);
      expect(created.status).toBe(AppointmentStatus.SOBRECUPO);
      expect(created.therapySlotId).toBeNull();
      expect(audit.entries).toHaveLength(1);
    });

    it('rechaza solapamiento con otra cita no cancelada del mismo profesional', async () => {
      appointmentRepo.appointments.push(
        makeAppointment({
          date: new Date('2026-07-13'),
          startMinute: 15 * 60,
          durationMinutes: 30,
        }),
      );
      await expect(service.create(ORG_ID, dto, admin, context)).rejects.toBeInstanceOf(
        ConflictException,
      );
    });

    it('permite el mismo horario si la cita existente está CANCELADA', async () => {
      appointmentRepo.appointments.push(
        makeAppointment({
          date: new Date('2026-07-13'),
          startMinute: 15 * 60,
          durationMinutes: 30,
          status: AppointmentStatus.CANCELADA,
        }),
      );
      const created = await service.create(ORG_ID, dto, admin, context);
      expect(created.status).toBe(AppointmentStatus.SOBRECUPO);
    });
  });

  describe('generateAppointments', () => {
    it('genera una instancia PENDIENTE por cada fecha del weekday dentro del rango y la vigencia', async () => {
      slotRepo.slots.push(makeSlot({ validFrom: new Date('2026-07-01'), validTo: null }));
      const result = await service.generateAppointments(
        ORG_ID,
        { from: '2026-07-01', to: '2026-07-31' },
        admin,
        context,
      );
      // Lunes de julio 2026: 6, 13, 20, 27
      expect(result.created).toBe(4);
      expect(result.skipped).toBe(0);
    });

    it('es idempotente: repetir el mismo rango no duplica instancias', async () => {
      slotRepo.slots.push(makeSlot({ validFrom: new Date('2026-07-01'), validTo: null }));
      await service.generateAppointments(
        ORG_ID,
        { from: '2026-07-01', to: '2026-07-31' },
        admin,
        context,
      );
      const second = await service.generateAppointments(
        ORG_ID,
        { from: '2026-07-01', to: '2026-07-31' },
        admin,
        context,
      );
      expect(second.created).toBe(0);
      expect(second.skipped).toBe(4);
    });

    it('respeta la vigencia (validTo) del slot', async () => {
      slotRepo.slots.push(
        makeSlot({ validFrom: new Date('2026-07-01'), validTo: new Date('2026-07-10') }),
      );
      const result = await service.generateAppointments(
        ORG_ID,
        { from: '2026-07-01', to: '2026-07-31' },
        admin,
        context,
      );
      expect(result.created).toBe(1); // solo el lunes 6 de julio cae dentro de la vigencia
    });

    it('rechaza un rango mayor a 60 días', async () => {
      await expect(
        service.generateAppointments(
          ORG_ID,
          { from: '2026-01-01', to: '2026-12-31' },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza "to" anterior a "from"', async () => {
      await expect(
        service.generateAppointments(
          ORG_ID,
          { from: '2026-07-31', to: '2026-07-01' },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('updateStatus', () => {
    it('confirma una cita PENDIENTE con confirmedVia=MANUAL', async () => {
      appointmentRepo.appointments.push(makeAppointment());
      const updated = await service.updateStatus(
        ORG_ID,
        'appt-1',
        { status: AppointmentStatus.CONFIRMADA },
        admin,
        context,
      );
      expect(updated.status).toBe(AppointmentStatus.CONFIRMADA);
      expect(updated.confirmedVia).toBe(ConfirmedVia.MANUAL);
    });

    it('cancela una cita CONFIRMADA', async () => {
      appointmentRepo.appointments.push(
        makeAppointment({
          status: AppointmentStatus.CONFIRMADA,
          confirmedVia: ConfirmedVia.MANUAL,
        }),
      );
      const updated = await service.updateStatus(
        ORG_ID,
        'appt-1',
        { status: AppointmentStatus.CANCELADA },
        admin,
        context,
      );
      expect(updated.status).toBe(AppointmentStatus.CANCELADA);
    });

    it.each([
      AppointmentStatus.CANCELADA,
      AppointmentStatus.ATENDIDA,
      AppointmentStatus.NO_ASISTIO,
    ])('rechaza cualquier transición desde un estado terminal (%s)', async (terminalStatus) => {
      appointmentRepo.appointments.push(makeAppointment({ status: terminalStatus }));
      await expect(
        service.updateStatus(
          ORG_ID,
          'appt-1',
          { status: AppointmentStatus.CONFIRMADA },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lanza 404 sobre una cita de otra organización', async () => {
      appointmentRepo.appointments.push(makeAppointment({ organizationId: 'org-2' }));
      await expect(
        service.updateStatus(
          ORG_ID,
          'appt-1',
          { status: AppointmentStatus.CONFIRMADA },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('markAttendance', () => {
    it('ADMIN marca asistencia sin restricción de fecha', async () => {
      appointmentRepo.appointments.push(makeAppointment({ date: new Date('2099-01-01') }));
      const updated = await service.markAttendance(
        ORG_ID,
        'appt-1',
        { status: AppointmentStatus.ATENDIDA },
        admin,
        context,
      );
      expect(updated.status).toBe(AppointmentStatus.ATENDIDA);
      expect(updated.attendanceMarkedById).toBe(admin.userId);
    });

    it('PROFESSIONAL puede marcar su propia cita de fecha pasada/hoy', async () => {
      appointmentRepo.appointments.push(
        makeAppointment({ date: new Date('2020-01-01'), professionalId: PROFESSIONAL_ID }),
      );
      const updated = await service.markAttendance(
        ORG_ID,
        'appt-1',
        { status: AppointmentStatus.NO_ASISTIO },
        professional,
        context,
      );
      expect(updated.status).toBe(AppointmentStatus.NO_ASISTIO);
    });

    it('PROFESSIONAL recibe 404 sobre una cita de otro profesional', async () => {
      appointmentRepo.appointments.push(
        makeAppointment({ professionalId: 'other-professional', date: new Date('2020-01-01') }),
      );
      await expect(
        service.markAttendance(
          ORG_ID,
          'appt-1',
          { status: AppointmentStatus.ATENDIDA },
          professional,
          context,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('PROFESSIONAL recibe 400 al marcar asistencia de una cita futura', async () => {
      appointmentRepo.appointments.push(
        makeAppointment({ date: new Date('2099-01-01'), professionalId: PROFESSIONAL_ID }),
      );
      await expect(
        service.markAttendance(
          ORG_ID,
          'appt-1',
          { status: AppointmentStatus.ATENDIDA },
          professional,
          context,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza marcar asistencia sobre una cita ya en estado terminal', async () => {
      appointmentRepo.appointments.push(
        makeAppointment({ status: AppointmentStatus.ATENDIDA, date: new Date('2020-01-01') }),
      );
      await expect(
        service.markAttendance(
          ORG_ID,
          'appt-1',
          { status: AppointmentStatus.NO_ASISTIO },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('findMany', () => {
    it('PROFESSIONAL solo ve sus propias citas aunque envíe otro professionalId por query', async () => {
      appointmentRepo.appointments.push(
        makeAppointment({ id: 'appt-1', professionalId: PROFESSIONAL_ID }),
        makeAppointment({ id: 'appt-2', professionalId: 'other-professional' }),
      );
      const result = await service.findMany(ORG_ID, professional, {
        professionalId: 'other-professional',
      });
      expect(result.data).toHaveLength(1);
      expect(result.data[0].professionalId).toBe(PROFESSIONAL_ID);
    });
  });
});
