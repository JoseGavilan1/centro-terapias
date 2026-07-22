import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  CreateTherapySlotRequest,
  DEFAULT_PAGE_SIZE,
  Paginated,
  paginate,
  TherapySlotDto,
  TherapySlotsQuery,
  UpdateTherapySlotRequest,
  UserRole,
  Weekday,
  minutesToTimeString,
  timeStringToMinutes,
} from '@centro/shared';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import {
  THERAPY_SLOT_REPOSITORY,
  TherapySlotRecord,
  TherapySlotRepository,
} from '../domain/therapy-slot.repository';
import { AgendaValidationService } from './agenda-validation.service';
import { dateRangesOverlap } from './weekday.util';

interface ScheduleParams {
  patientId: string;
  professionalId: string;
  weekday: Weekday;
  startMinute: number;
  durationMinutes: number;
  validFrom: Date;
  validTo: Date | null;
}

function overlapsMinutes(
  aStart: number,
  aDuration: number,
  bStart: number,
  bDuration: number,
): boolean {
  return aStart < bStart + bDuration && bStart < aStart + aDuration;
}

@Injectable()
export class TherapySlotsService {
  constructor(
    @Inject(THERAPY_SLOT_REPOSITORY) private readonly therapySlotRepository: TherapySlotRepository,
    private readonly agendaValidation: AgendaValidationService,
    private readonly auditService: AuditService,
  ) {}

  async findMany(
    organizationId: string,
    actor: AuthenticatedUser,
    query: TherapySlotsQuery,
  ): Promise<Paginated<TherapySlotDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    // El profesional solo ve sus propios slots, sin importar el query recibido (§1.2/HU-07).
    const professionalId =
      actor.role === UserRole.PROFESSIONAL ? actor.userId : query.professionalId;

    const { data, total } = await this.therapySlotRepository.findMany(organizationId, {
      professionalId,
      patientId: query.patientId,
      page,
      pageSize,
    });
    return paginate(
      data.map((slot) => this.toDto(slot)),
      total,
      { page, pageSize },
    );
  }

  async create(
    organizationId: string,
    dto: CreateTherapySlotRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<TherapySlotDto> {
    await this.agendaValidation.assertPatientExists(organizationId, dto.patientId);
    await this.agendaValidation.assertProfessionalValid(organizationId, dto.professionalId);

    const validFrom = new Date(dto.validFrom);
    const validTo = dto.validTo ? new Date(dto.validTo) : null;
    this.assertValidRange(validFrom, validTo);
    const startMinute = timeStringToMinutes(dto.startTime);

    await this.assertNoOverlap(organizationId, {
      patientId: dto.patientId,
      professionalId: dto.professionalId,
      weekday: dto.weekday,
      startMinute,
      durationMinutes: dto.durationMinutes,
      validFrom,
      validTo,
    });

    const created = await this.therapySlotRepository.create({
      organizationId,
      patientId: dto.patientId,
      professionalId: dto.professionalId,
      weekday: dto.weekday,
      startMinute,
      durationMinutes: dto.durationMinutes,
      validFrom,
      validTo,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.CREATE,
      entity: 'TherapySlot',
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
    dto: UpdateTherapySlotRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<TherapySlotDto> {
    const existing = await this.therapySlotRepository.findById(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Plantilla de horario no encontrada');
    }

    if (dto.patientId !== undefined && dto.patientId !== existing.patientId) {
      await this.agendaValidation.assertPatientExists(organizationId, dto.patientId);
    }
    if (dto.professionalId !== undefined && dto.professionalId !== existing.professionalId) {
      await this.agendaValidation.assertProfessionalValid(organizationId, dto.professionalId);
    }

    const nextValidFrom =
      dto.validFrom !== undefined ? new Date(dto.validFrom) : existing.validFrom;
    const nextValidTo =
      dto.validTo !== undefined ? (dto.validTo ? new Date(dto.validTo) : null) : existing.validTo;
    this.assertValidRange(nextValidFrom, nextValidTo);

    const scheduleChanged =
      dto.patientId !== undefined ||
      dto.professionalId !== undefined ||
      dto.weekday !== undefined ||
      dto.startTime !== undefined ||
      dto.durationMinutes !== undefined ||
      dto.validFrom !== undefined ||
      dto.validTo !== undefined;

    const nextStartMinute =
      dto.startTime !== undefined ? timeStringToMinutes(dto.startTime) : existing.startMinute;

    if (scheduleChanged) {
      await this.assertNoOverlap(
        organizationId,
        {
          patientId: dto.patientId ?? existing.patientId,
          professionalId: dto.professionalId ?? existing.professionalId,
          weekday: dto.weekday ?? existing.weekday,
          startMinute: nextStartMinute,
          durationMinutes: dto.durationMinutes ?? existing.durationMinutes,
          validFrom: nextValidFrom,
          validTo: nextValidTo,
        },
        id,
      );
    }

    const updated = await this.therapySlotRepository.update(organizationId, id, {
      patientId: dto.patientId,
      professionalId: dto.professionalId,
      weekday: dto.weekday,
      startMinute: dto.startTime !== undefined ? nextStartMinute : undefined,
      durationMinutes: dto.durationMinutes,
      validFrom: dto.validFrom !== undefined ? nextValidFrom : undefined,
      validTo: dto.validTo !== undefined ? nextValidTo : undefined,
      isActive: dto.isActive,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.UPDATE,
      entity: 'TherapySlot',
      entityId: updated.id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(updated);
  }

  /** No hay borrado físico de slots: "eliminar" = desactivar. No afecta Appointment ya generados. Idempotente. */
  async deactivate(
    organizationId: string,
    id: string,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<void> {
    const existing = await this.therapySlotRepository.findById(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Plantilla de horario no encontrada');
    }
    if (!existing.isActive) {
      return;
    }

    const updated = await this.therapySlotRepository.update(organizationId, id, {
      isActive: false,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.DELETE,
      entity: 'TherapySlot',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });
  }

  private assertValidRange(validFrom: Date, validTo: Date | null): void {
    if (validTo && validTo.getTime() < validFrom.getTime()) {
      throw new BadRequestException('validTo no puede ser anterior a validFrom');
    }
  }

  /** Valida solapamiento (§1) contra slots activos del mismo profesional o del mismo paciente. */
  private async assertNoOverlap(
    organizationId: string,
    params: ScheduleParams,
    excludeId?: string,
  ): Promise<void> {
    const [byProfessional, byPatient] = await Promise.all([
      this.therapySlotRepository.findActiveByProfessionalAndWeekday(
        organizationId,
        params.professionalId,
        params.weekday,
        excludeId,
      ),
      this.therapySlotRepository.findActiveByPatientAndWeekday(
        organizationId,
        params.patientId,
        params.weekday,
        excludeId,
      ),
    ]);

    const candidates = [...byProfessional, ...byPatient];
    const collides = candidates.some(
      (slot) =>
        overlapsMinutes(
          params.startMinute,
          params.durationMinutes,
          slot.startMinute,
          slot.durationMinutes,
        ) && dateRangesOverlap(params.validFrom, params.validTo, slot.validFrom, slot.validTo),
    );
    if (collides) {
      throw new ConflictException(
        'El horario se solapa con otra plantilla activa del mismo profesional o paciente',
      );
    }
  }

  private toAuditSnapshot(slot: TherapySlotRecord): Record<string, unknown> {
    return { ...slot };
  }

  private toDto(slot: TherapySlotRecord): TherapySlotDto {
    return {
      id: slot.id,
      patientId: slot.patientId,
      professionalId: slot.professionalId,
      weekday: slot.weekday,
      startTime: minutesToTimeString(slot.startMinute),
      durationMinutes: slot.durationMinutes,
      validFrom: slot.validFrom.toISOString().slice(0, 10),
      validTo: slot.validTo ? slot.validTo.toISOString().slice(0, 10) : null,
      isActive: slot.isActive,
      createdAt: slot.createdAt.toISOString(),
      updatedAt: slot.updatedAt.toISOString(),
    };
  }
}
