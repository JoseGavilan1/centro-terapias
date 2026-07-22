import { ConflictException, NotFoundException } from '@nestjs/common';
import { UserRole } from '@centro/shared';
import { AgendaAccessService } from '../../agenda/application/agenda-access.service';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import {
  CreatePatientData,
  PatientRecord,
  PatientRepository,
  UpdatePatientData,
} from '../domain/patient.repository';
import { PatientsService } from './patients.service';

const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';

function makePatient(overrides: Partial<PatientRecord> = {}): PatientRecord {
  return {
    id: 'patient-1',
    organizationId: ORG_ID,
    firstName: 'Sofía',
    lastName: 'Gómez',
    rut: '12345678-5',
    birthDate: new Date('2018-03-20T00:00:00Z'),
    diagnosis: null,
    phone: '+56911111111',
    email: null,
    address: null,
    observations: null,
    isActive: true,
    driveFolderId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

class FakePatientRepository implements PatientRepository {
  patients: PatientRecord[] = [];
  private seq = 0;

  findById(organizationId: string, id: string): Promise<PatientRecord | null> {
    return Promise.resolve(
      this.patients.find((p) => p.id === id && p.organizationId === organizationId) ?? null,
    );
  }

  findByRut(
    organizationId: string,
    rut: string,
    excludeId?: string,
  ): Promise<PatientRecord | null> {
    return Promise.resolve(
      this.patients.find(
        (p) => p.organizationId === organizationId && p.rut === rut && p.id !== excludeId,
      ) ?? null,
    );
  }

  findMany(
    organizationId: string,
    filters: { patientIds?: string[] } = {},
  ): Promise<{ data: PatientRecord[]; total: number }> {
    const data = this.patients.filter(
      (p) =>
        p.organizationId === organizationId &&
        (!filters.patientIds || filters.patientIds.includes(p.id)),
    );
    return Promise.resolve({ data, total: data.length });
  }

  create(data: CreatePatientData): Promise<PatientRecord> {
    this.seq += 1;
    const patient = makePatient({ ...data, id: `patient-${this.seq}` });
    this.patients.push(patient);
    return Promise.resolve(patient);
  }

  update(organizationId: string, id: string, data: UpdatePatientData): Promise<PatientRecord> {
    const idx = this.patients.findIndex((p) => p.id === id && p.organizationId === organizationId);
    if (idx === -1) {
      throw new NotFoundException('Paciente no encontrado');
    }
    // Prisma ignora las claves `undefined` de `data` (no las incluye en el
    // SET); el spread de JS no lo hace por sí solo, así que se filtran aquí
    // para que el fake reproduzca el mismo comportamiento.
    const definedChanges = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );
    this.patients[idx] = { ...this.patients[idx], ...definedChanges, updatedAt: new Date() };
    return Promise.resolve(this.patients[idx]);
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
  assignedPatientIds: string[] = [];
  getAssignedPatientIds(): Promise<string[]> {
    return Promise.resolve(this.assignedPatientIds);
  }
}

describe('PatientsService', () => {
  let repo: FakePatientRepository;
  let audit: FakeAuditService;
  let agendaAccess: FakeAgendaAccessService;
  let service: PatientsService;
  let admin: AuthenticatedUser;
  let professional: AuthenticatedUser;
  const context = { ip: '127.0.0.1', userAgent: 'jest' };

  beforeEach(() => {
    repo = new FakePatientRepository();
    audit = new FakeAuditService();
    agendaAccess = new FakeAgendaAccessService();
    service = new PatientsService(
      repo,
      agendaAccess as unknown as AgendaAccessService,
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
      userId: 'prof-1',
      organizationId: ORG_ID,
      email: 'prof@demo.cl',
      role: UserRole.PROFESSIONAL,
      specialty: null,
    };
  });

  describe('create', () => {
    it('crea un paciente y audita CREATE', async () => {
      const dto = await service.create(
        ORG_ID,
        {
          firstName: 'Sofía',
          lastName: 'Gómez',
          rut: '12345678-5',
          birthDate: '2018-03-20',
          phone: '+56911111111',
        },
        admin,
        context,
      );
      expect(dto.rut).toBe('12345678-5');
      expect(dto.isActive).toBe(true);
      expect(audit.entries).toHaveLength(1);
    });

    it('rechaza un RUT ya usado por otro paciente de la misma organización', async () => {
      repo.patients.push(makePatient());
      await expect(
        service.create(
          ORG_ID,
          {
            firstName: 'Otro',
            lastName: 'Paciente',
            rut: '12345678-5',
            birthDate: '2019-01-01',
            phone: '+56922222222',
          },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('permite el mismo RUT en una organización distinta', async () => {
      repo.patients.push(makePatient({ organizationId: OTHER_ORG_ID }));
      const dto = await service.create(
        ORG_ID,
        {
          firstName: 'Sofía',
          lastName: 'Gómez',
          rut: '12345678-5',
          birthDate: '2018-03-20',
          phone: '+56911111111',
        },
        admin,
        context,
      );
      expect(dto.rut).toBe('12345678-5');
    });

    it('rechaza el RUT de un paciente inactivo (la unicidad no distingue estado)', async () => {
      repo.patients.push(makePatient({ isActive: false }));
      await expect(
        service.create(
          ORG_ID,
          {
            firstName: 'Otro',
            lastName: 'Paciente',
            rut: '12345678-5',
            birthDate: '2019-01-01',
            phone: '+56922222222',
          },
          admin,
          context,
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('update', () => {
    it('permite conservar el propio RUT sin chocar contra sí mismo', async () => {
      const patient = makePatient();
      repo.patients.push(patient);
      const dto = await service.update(
        ORG_ID,
        patient.id,
        { rut: patient.rut, firstName: 'Sofía Actualizada' },
        admin,
        context,
      );
      expect(dto.firstName).toBe('Sofía Actualizada');
    });

    it('rechaza cambiar el RUT a uno usado por otro paciente de la organización', async () => {
      const patient = makePatient();
      const other = makePatient({ id: 'patient-2', rut: '7654321-6' });
      repo.patients.push(patient, other);
      await expect(
        service.update(ORG_ID, patient.id, { rut: other.rut }, admin, context),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('lanza 404 si el paciente no existe en la organización', async () => {
      await expect(
        service.update(ORG_ID, 'inexistente', { firstName: 'X' }, admin, context),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('permite reactivar un paciente vía PATCH isActive', async () => {
      const patient = makePatient({ isActive: false });
      repo.patients.push(patient);
      const dto = await service.update(ORG_ID, patient.id, { isActive: true }, admin, context);
      expect(dto.isActive).toBe(true);
    });
  });

  describe('deactivate', () => {
    it('desactiva y audita DELETE', async () => {
      const patient = makePatient();
      repo.patients.push(patient);
      await service.deactivate(ORG_ID, patient.id, admin, context);
      const updated = await repo.findById(ORG_ID, patient.id);
      expect(updated?.isActive).toBe(false);
      expect(audit.entries).toHaveLength(1);
    });

    it('es idempotente sobre un paciente ya inactivo (no audita de nuevo)', async () => {
      const patient = makePatient({ isActive: false });
      repo.patients.push(patient);
      await service.deactivate(ORG_ID, patient.id, admin, context);
      expect(audit.entries).toHaveLength(0);
    });

    it('lanza 404 sobre un paciente de otra organización', async () => {
      const patient = makePatient({ organizationId: OTHER_ORG_ID });
      repo.patients.push(patient);
      await expect(service.deactivate(ORG_ID, patient.id, admin, context)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('alcance de PROFESSIONAL (Módulo 3 §1.2)', () => {
    it('ADMIN ve todos los pacientes de la organización en findMany', async () => {
      repo.patients.push(makePatient({ id: 'patient-1' }), makePatient({ id: 'patient-2' }));
      const result = await service.findMany(ORG_ID, admin, {});
      expect(result.data).toHaveLength(2);
    });

    it('PROFESSIONAL solo ve los pacientes con slot activo asignado en findMany', async () => {
      repo.patients.push(makePatient({ id: 'patient-1' }), makePatient({ id: 'patient-2' }));
      agendaAccess.assignedPatientIds = ['patient-1'];
      const result = await service.findMany(ORG_ID, professional, {});
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('patient-1');
    });

    it('PROFESSIONAL sin pacientes asignados ve una lista vacía', async () => {
      repo.patients.push(makePatient({ id: 'patient-1' }));
      agendaAccess.assignedPatientIds = [];
      const result = await service.findMany(ORG_ID, professional, {});
      expect(result.data).toHaveLength(0);
    });

    it('PROFESSIONAL obtiene 404 en findOne de un paciente no asignado', async () => {
      const patient = makePatient({ id: 'patient-1' });
      repo.patients.push(patient);
      agendaAccess.assignedPatientIds = [];
      await expect(service.findOne(ORG_ID, professional, patient.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('PROFESSIONAL obtiene el paciente en findOne cuando sí está asignado', async () => {
      const patient = makePatient({ id: 'patient-1' });
      repo.patients.push(patient);
      agendaAccess.assignedPatientIds = ['patient-1'];
      const dto = await service.findOne(ORG_ID, professional, patient.id);
      expect(dto.id).toBe('patient-1');
    });
  });
});
