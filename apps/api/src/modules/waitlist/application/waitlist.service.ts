import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AssignWaitlistEntryRequest,
  AuditAction,
  CreateWaitlistEntryRequest,
  DEFAULT_PAGE_SIZE,
  DiscardWaitlistEntryRequest,
  Paginated,
  paginate,
  UpdateWaitlistEntryRequest,
  WaitlistEntryDto,
  WaitlistQuery,
  WaitlistStatus,
} from '@centro/shared';
import { PatientsService } from '../../patients/application/patients.service';
import { TherapySlotsService } from '../../agenda/application/therapy-slots.service';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  WAITLIST_ENTRY_REPOSITORY,
  WaitlistEntryRecord,
  WaitlistEntryRepository,
} from '../domain/waitlist-entry.repository';

@Injectable()
export class WaitlistService {
  constructor(
    @Inject(WAITLIST_ENTRY_REPOSITORY) private readonly waitlistRepository: WaitlistEntryRepository,
    private readonly patientsService: PatientsService,
    private readonly therapySlotsService: TherapySlotsService,
    private readonly auditService: AuditService,
    private readonly prisma: PrismaService,
  ) {}

  async findMany(organizationId: string, query: WaitlistQuery): Promise<Paginated<WaitlistEntryDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { data, total } = await this.waitlistRepository.findMany(organizationId, {
      status: query.status,
      requestedSpecialty: query.requestedSpecialty,
      page,
      pageSize,
    });
    return paginate(
      data.map((entry) => this.toDto(entry)),
      total,
      { page, pageSize },
    );
  }

  /** CU-01 (webhook, sin actor autenticado) y CU-02 (ingreso manual). Mismo cuerpo, sin auditoría en el CU-01: no hay actor humano al que atribuírsela. */
  async intake(
    organizationId: string,
    dto: CreateWaitlistEntryRequest,
  ): Promise<WaitlistEntryDto> {
    const created = await this.waitlistRepository.create({
      organizationId,
      childFirstName: dto.childFirstName,
      childLastName: dto.childLastName,
      childRut: dto.childRut ?? null,
      childBirthDate: dto.childBirthDate ? new Date(dto.childBirthDate) : null,
      guardianName: dto.guardianName,
      guardianPhone: dto.guardianPhone,
      guardianEmail: dto.guardianEmail ?? null,
      requestedSpecialty: dto.requestedSpecialty ?? null,
      reason: dto.reason ?? null,
    });
    return this.toDto(created);
  }

  async create(
    organizationId: string,
    dto: CreateWaitlistEntryRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<WaitlistEntryDto> {
    const created = await this.waitlistRepository.create({
      organizationId,
      childFirstName: dto.childFirstName,
      childLastName: dto.childLastName,
      childRut: dto.childRut ?? null,
      childBirthDate: dto.childBirthDate ? new Date(dto.childBirthDate) : null,
      guardianName: dto.guardianName,
      guardianPhone: dto.guardianPhone,
      guardianEmail: dto.guardianEmail ?? null,
      requestedSpecialty: dto.requestedSpecialty ?? null,
      reason: dto.reason ?? null,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.CREATE,
      entity: 'WaitlistEntry',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(created);
  }

  /** CU-06: solo mientras la entrada sigue PENDIENTE (§1.1 — no tiene sentido corregir una ya resuelta). */
  async update(
    organizationId: string,
    id: string,
    dto: UpdateWaitlistEntryRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<WaitlistEntryDto> {
    const existing = await this.getPendingOrThrow(organizationId, id);

    const updated = await this.waitlistRepository.update(organizationId, id, {
      childFirstName: dto.childFirstName,
      childLastName: dto.childLastName,
      childRut: dto.childRut,
      childBirthDate: dto.childBirthDate !== undefined ? new Date(dto.childBirthDate) : undefined,
      guardianName: dto.guardianName,
      guardianPhone: dto.guardianPhone,
      guardianEmail: dto.guardianEmail,
      requestedSpecialty: dto.requestedSpecialty,
      reason: dto.reason,
      sede: dto.sede,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.UPDATE,
      entity: 'WaitlistEntry',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(updated);
  }

  /** CU-04: crea Patient + TherapySlot y marca ASIGNADA (§1.6: compensa si falla el horario). */
  async assign(
    organizationId: string,
    id: string,
    dto: AssignWaitlistEntryRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<WaitlistEntryDto> {
    const existing = await this.getPendingOrThrow(organizationId, id);

    const rut = dto.rut ?? existing.childRut;
    if (!rut) {
      throw new BadRequestException('Debe indicar el RUT del paciente');
    }
    const birthDateIso = dto.birthDate ?? this.toIsoDateOrUndefined(existing.childBirthDate);
    if (!birthDateIso) {
      throw new BadRequestException('Debe indicar la fecha de nacimiento del paciente');
    }

    const patient = await this.patientsService.create(
      organizationId,
      {
        firstName: existing.childFirstName,
        lastName: existing.childLastName,
        rut,
        birthDate: birthDateIso,
        diagnosis: existing.reason ?? undefined,
        phone: existing.guardianPhone,
        email: existing.guardianEmail ?? undefined,
      },
      actor,
      context,
    );

    let slotId: string;
    try {
      const slot = await this.therapySlotsService.create(
        organizationId,
        {
          patientId: patient.id,
          professionalId: dto.professionalId,
          weekday: dto.weekday,
          startTime: dto.startTime,
          durationMinutes: dto.durationMinutes,
          validFrom: dto.validFrom,
        },
        actor,
        context,
      );
      slotId = slot.id;
    } catch (error) {
      // Compensación (§1.6): sin esto quedaría un Patient activo sin ningún horario, resultado
      // de una asignación que en los hechos falló. Borrado físico real (no deactivate): el
      // paciente no tiene ninguna fila dependiente todavía (fue creado hace instantes).
      await this.prisma.patient.delete({ where: { id: patient.id } });
      throw error;
    }

    const updated = await this.waitlistRepository.update(organizationId, id, {
      status: WaitlistStatus.ASIGNADA,
      assignedPatientId: patient.id,
      assignedTherapySlotId: slotId,
      sede: dto.sede ?? existing.sede,
      resolvedAt: new Date(),
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.UPDATE,
      entity: 'WaitlistEntry',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(updated);
  }

  /** CU-05: terminal, requiere motivo. */
  async discard(
    organizationId: string,
    id: string,
    dto: DiscardWaitlistEntryRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<WaitlistEntryDto> {
    const existing = await this.getPendingOrThrow(organizationId, id);

    const updated = await this.waitlistRepository.update(organizationId, id, {
      status: WaitlistStatus.DESCARTADA,
      discardReason: dto.reason,
      resolvedAt: new Date(),
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.UPDATE,
      entity: 'WaitlistEntry',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(updated);
  }

  private async getPendingOrThrow(
    organizationId: string,
    id: string,
  ): Promise<WaitlistEntryRecord> {
    const existing = await this.waitlistRepository.findById(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Entrada de lista de espera no encontrada');
    }
    if (existing.status !== WaitlistStatus.PENDIENTE) {
      throw new ConflictException('La entrada ya fue resuelta (asignada o descartada)');
    }
    return existing;
  }

  private toIsoDateOrUndefined(date: Date | null): string | undefined {
    return date ? date.toISOString().slice(0, 10) : undefined;
  }

  private toAuditSnapshot(entry: WaitlistEntryRecord): Record<string, unknown> {
    return { ...entry };
  }

  private toDto(entry: WaitlistEntryRecord): WaitlistEntryDto {
    return {
      id: entry.id,
      childFirstName: entry.childFirstName,
      childLastName: entry.childLastName,
      childRut: entry.childRut,
      childBirthDate: entry.childBirthDate ? entry.childBirthDate.toISOString().slice(0, 10) : null,
      guardianName: entry.guardianName,
      guardianPhone: entry.guardianPhone,
      guardianEmail: entry.guardianEmail,
      requestedSpecialty: entry.requestedSpecialty,
      reason: entry.reason,
      sede: entry.sede,
      status: entry.status,
      assignedPatientId: entry.assignedPatientId,
      assignedTherapySlotId: entry.assignedTherapySlotId,
      discardReason: entry.discardReason,
      resolvedAt: entry.resolvedAt ? entry.resolvedAt.toISOString() : null,
      createdAt: entry.createdAt.toISOString(),
      updatedAt: entry.updatedAt.toISOString(),
    };
  }
}
