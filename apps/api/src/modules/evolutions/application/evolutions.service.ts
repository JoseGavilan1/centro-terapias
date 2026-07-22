import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CreateEvolutionRequest,
  DEFAULT_PAGE_SIZE,
  ClinicalConfidentiality,
  EvolutionDto,
  EvolutionsQuery,
  Paginated,
  paginate,
  Specialty,
  UserRole,
} from '@centro/shared';
import { AgendaAccessService } from '../../agenda/application/agenda-access.service';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  EVOLUTION_REPOSITORY,
  EvolutionRecord,
  EvolutionRepository,
} from '../domain/evolution.repository';

@Injectable()
export class EvolutionsService {
  constructor(
    @Inject(EVOLUTION_REPOSITORY) private readonly evolutionRepository: EvolutionRepository,
    private readonly prisma: PrismaService,
    private readonly agendaAccessService: AgendaAccessService,
    private readonly auditService: AuditService,
  ) {}

  async findMany(
    organizationId: string,
    actor: AuthenticatedUser,
    patientId: string,
    query: EvolutionsQuery,
  ): Promise<Paginated<EvolutionDto>> {
    await this.assertPatientInScope(organizationId, actor, patientId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { data, total } = await this.evolutionRepository.findMany(organizationId, {
      patientId,
      page,
      pageSize,
    });
    return paginate(
      data.map((evolution) => this.toDto(evolution, actor)),
      total,
      { page, pageSize },
    );
  }

  async findOne(
    organizationId: string,
    actor: AuthenticatedUser,
    patientId: string,
    id: string,
  ): Promise<EvolutionDto> {
    await this.assertPatientInScope(organizationId, actor, patientId);

    const evolution = await this.evolutionRepository.findById(organizationId, id);
    if (!evolution || evolution.patientId !== patientId) {
      throw new NotFoundException('Evolución no encontrada');
    }
    return this.toDto(evolution, actor);
  }

  async create(
    organizationId: string,
    actor: AuthenticatedUser,
    patientId: string,
    dto: CreateEvolutionRequest,
    context: RequestContext,
  ): Promise<EvolutionDto> {
    await this.assertPatientInScope(organizationId, actor, patientId);

    if (dto.appointmentId) {
      await this.assertAppointmentLinkable(organizationId, actor, patientId, dto.appointmentId);
    }
    if (dto.amendsId) {
      await this.assertAmendedEvolutionExists(organizationId, patientId, dto.amendsId);
    }

    // Nunca se acepta del cliente: se deriva de la especialidad del autor en el
    // momento de crear y queda fijo (ADR-04; ver modulo-04-fichas-clinicas.md §1).
    const confidentiality =
      actor.specialty === Specialty.PSICOLOGIA
        ? ClinicalConfidentiality.PSYCHOLOGICAL
        : ClinicalConfidentiality.STANDARD;

    const created = await this.evolutionRepository.create({
      organizationId,
      patientId,
      authorId: actor.userId,
      appointmentId: dto.appointmentId ?? null,
      amendsId: dto.amendsId ?? null,
      date: new Date(dto.date),
      observation: dto.observation,
      workPlan: dto.workPlan,
      confidentiality,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.CREATE,
      entity: 'Evolution',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    // El autor de una evolución PSYCHOLOGICAL tiene, por construcción,
    // specialty=PSICOLOGIA: siempre puede leer lo que acaba de crear.
    return this.toDto(created, actor);
  }

  private async assertAppointmentLinkable(
    organizationId: string,
    actor: AuthenticatedUser,
    patientId: string,
    appointmentId: string,
  ): Promise<void> {
    const appointment = await this.agendaAccessService.getAttendedAppointmentContext(
      organizationId,
      appointmentId,
    );
    if (
      !appointment ||
      appointment.professionalId !== actor.userId ||
      appointment.patientId !== patientId
    ) {
      throw new BadRequestException(
        'La cita indicada no es una atención propia en estado ATENDIDA de este paciente',
      );
    }
    const existing = await this.evolutionRepository.findByAppointmentId(
      organizationId,
      appointmentId,
    );
    if (existing) {
      throw new ConflictException('Esta cita ya tiene una evolución asociada');
    }
  }

  private async assertAmendedEvolutionExists(
    organizationId: string,
    patientId: string,
    amendsId: string,
  ): Promise<void> {
    const amended = await this.evolutionRepository.findById(organizationId, amendsId);
    if (!amended || amended.patientId !== patientId) {
      throw new BadRequestException('La evolución a corregir no existe para este paciente');
    }
  }

  /** ADMIN siempre; PROFESSIONAL solo si tiene un TherapySlot activo con el paciente (Módulo 3 §1.2). */
  private async assertPatientInScope(
    organizationId: string,
    actor: AuthenticatedUser,
    patientId: string,
  ): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    if (actor.role === UserRole.PROFESSIONAL) {
      const assignedIds = await this.agendaAccessService.getAssignedPatientIds(
        organizationId,
        actor.userId,
      );
      if (!assignedIds.includes(patientId)) {
        throw new NotFoundException('Paciente no encontrado');
      }
    }
  }

  private canReadPsychological(actor: AuthenticatedUser): boolean {
    return actor.specialty === Specialty.PSICOLOGIA;
  }

  /** Omite observation/workPlan del registro auditado si el contenido es PSYCHOLOGICAL (§1: ni la auditoría es una puerta trasera). */
  private toAuditSnapshot(evolution: EvolutionRecord): Record<string, unknown> {
    if (evolution.confidentiality === ClinicalConfidentiality.PSYCHOLOGICAL) {
      const { observation, workPlan, ...rest } = evolution;
      void observation;
      void workPlan;
      return rest;
    }
    return { ...evolution };
  }

  private toDto(evolution: EvolutionRecord, actor: AuthenticatedUser): EvolutionDto {
    const isPsychological = evolution.confidentiality === ClinicalConfidentiality.PSYCHOLOGICAL;
    const canRead = !isPsychological || this.canReadPsychological(actor);
    return {
      id: evolution.id,
      patientId: evolution.patientId,
      authorId: evolution.authorId,
      appointmentId: evolution.appointmentId,
      amendsId: canRead ? evolution.amendsId : null,
      date: evolution.date.toISOString().slice(0, 10),
      confidentiality: evolution.confidentiality,
      redacted: !canRead,
      observation: canRead ? evolution.observation : null,
      workPlan: canRead ? evolution.workPlan : null,
      createdAt: evolution.createdAt.toISOString(),
    };
  }
}
