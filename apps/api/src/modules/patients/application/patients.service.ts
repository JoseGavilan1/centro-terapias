import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  CreatePatientRequest,
  DEFAULT_PAGE_SIZE,
  Paginated,
  paginate,
  PatientDto,
  PatientsQuery,
  UpdatePatientRequest,
  UserRole,
} from '@centro/shared';
import { AgendaAccessService } from '../../agenda/application/agenda-access.service';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { PATIENT_REPOSITORY, PatientRecord, PatientRepository } from '../domain/patient.repository';

@Injectable()
export class PatientsService {
  constructor(
    @Inject(PATIENT_REPOSITORY) private readonly patientRepository: PatientRepository,
    private readonly agendaAccessService: AgendaAccessService,
    private readonly auditService: AuditService,
  ) {}

  async findMany(
    organizationId: string,
    actor: AuthenticatedUser,
    query: PatientsQuery,
  ): Promise<Paginated<PatientDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { data, total } = await this.patientRepository.findMany(organizationId, {
      search: query.search,
      isActive: query.isActive === undefined ? undefined : query.isActive === 'true',
      patientIds: await this.scopeForActor(organizationId, actor),
      page,
      pageSize,
    });
    return paginate(
      data.map((patient) => this.toDto(patient)),
      total,
      { page, pageSize },
    );
  }

  async findOne(organizationId: string, actor: AuthenticatedUser, id: string): Promise<PatientDto> {
    const patient = await this.patientRepository.findById(organizationId, id);
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    const scope = await this.scopeForActor(organizationId, actor);
    // Fuera del alcance del profesional => inexistente (§1.2), mismo criterio que el aislamiento de tenant.
    if (scope && !scope.includes(id)) {
      throw new NotFoundException('Paciente no encontrado');
    }
    return this.toDto(patient);
  }

  /** `undefined` = sin restricción (ADMIN); array (posiblemente vacío) = ids asignados (PROFESSIONAL). */
  private async scopeForActor(
    organizationId: string,
    actor: AuthenticatedUser,
  ): Promise<string[] | undefined> {
    if (actor.role !== UserRole.PROFESSIONAL) {
      return undefined;
    }
    return this.agendaAccessService.getAssignedPatientIds(organizationId, actor.userId);
  }

  async create(
    organizationId: string,
    dto: CreatePatientRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<PatientDto> {
    await this.assertRutAvailable(organizationId, dto.rut);

    const created = await this.patientRepository.create({
      organizationId,
      firstName: dto.firstName,
      lastName: dto.lastName,
      rut: dto.rut,
      birthDate: new Date(dto.birthDate),
      diagnosis: dto.diagnosis ?? null,
      phone: dto.phone,
      email: dto.email ?? null,
      address: dto.address ?? null,
      observations: dto.observations ?? null,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.CREATE,
      entity: 'Patient',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(created);
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdatePatientRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<PatientDto> {
    const existing = await this.patientRepository.findById(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Paciente no encontrado');
    }

    if (dto.rut !== undefined && dto.rut !== existing.rut) {
      await this.assertRutAvailable(organizationId, dto.rut, id);
    }

    const updated = await this.patientRepository.update(organizationId, id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      rut: dto.rut,
      birthDate: dto.birthDate !== undefined ? new Date(dto.birthDate) : undefined,
      diagnosis: dto.diagnosis,
      phone: dto.phone,
      email: dto.email,
      address: dto.address,
      observations: dto.observations,
      isActive: dto.isActive,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.UPDATE,
      entity: 'Patient',
      entityId: updated.id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(updated);
  }

  /** No hay borrado físico de pacientes: "eliminar" = desactivar. Idempotente. */
  async deactivate(
    organizationId: string,
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    const existing = await this.patientRepository.findById(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Paciente no encontrado');
    }
    if (!existing.isActive) {
      return;
    }

    const updated = await this.patientRepository.update(organizationId, id, { isActive: false });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.DELETE,
      entity: 'Patient',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  /**
   * El RUT es único por organización considerando pacientes activos e
   * inactivos (nunca se borran filas, así que un RUT "liberado" por
   * desactivación seguiría colisionando).
   */
  private async assertRutAvailable(
    organizationId: string,
    rut: string,
    excludePatientId?: string,
  ): Promise<void> {
    const existing = await this.patientRepository.findByRut(organizationId, rut, excludePatientId);
    if (existing) {
      throw new ConflictException('Ya existe un paciente con ese RUT en esta organización');
    }
  }

  private toAuditSnapshot(patient: PatientRecord): Record<string, unknown> {
    return { ...patient };
  }

  private toDto(patient: PatientRecord): PatientDto {
    return {
      id: patient.id,
      firstName: patient.firstName,
      lastName: patient.lastName,
      rut: patient.rut,
      birthDate: patient.birthDate.toISOString().slice(0, 10),
      diagnosis: patient.diagnosis,
      phone: patient.phone,
      email: patient.email,
      address: patient.address,
      observations: patient.observations,
      isActive: patient.isActive,
      createdAt: patient.createdAt.toISOString(),
      updatedAt: patient.updatedAt.toISOString(),
    };
  }
}
