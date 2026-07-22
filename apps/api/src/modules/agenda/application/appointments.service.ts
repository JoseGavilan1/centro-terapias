import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AppointmentDto,
  AppointmentsQuery,
  AppointmentStatus,
  AuditAction,
  ConfirmedVia,
  CreateAppointmentRequest,
  DEFAULT_PAGE_SIZE,
  GenerateAppointmentsRequest,
  GenerateAppointmentsResult,
  MarkAttendanceRequest,
  minutesToTimeString,
  Paginated,
  paginate,
  TERMINAL_APPOINTMENT_STATUSES,
  timeStringToMinutes,
  UpdateAppointmentStatusRequest,
  UserRole,
} from '@centro/shared';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import {
  AppointmentRecord,
  AppointmentRepository,
  APPOINTMENT_REPOSITORY,
  CreateAppointmentData,
} from '../domain/appointment.repository';
import { THERAPY_SLOT_REPOSITORY, TherapySlotRepository } from '../domain/therapy-slot.repository';
import { AgendaValidationService } from './agenda-validation.service';
import { enumerateWeekdayDates } from './weekday.util';

const MAX_GENERATE_RANGE_DAYS = 60;

/** Transiciones administrativas permitidas por CU-05 (confirmar/cancelar); ver §1.1. */
const ADMIN_STATUS_TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
  [AppointmentStatus.PENDIENTE]: [AppointmentStatus.CONFIRMADA, AppointmentStatus.CANCELADA],
  [AppointmentStatus.SOBRECUPO]: [AppointmentStatus.CONFIRMADA, AppointmentStatus.CANCELADA],
  [AppointmentStatus.CONFIRMADA]: [AppointmentStatus.CANCELADA],
  [AppointmentStatus.CANCELADA]: [],
  [AppointmentStatus.ATENDIDA]: [],
  [AppointmentStatus.NO_ASISTIO]: [],
};

@Injectable()
export class AppointmentsService {
  constructor(
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointmentRepository: AppointmentRepository,
    @Inject(THERAPY_SLOT_REPOSITORY) private readonly therapySlotRepository: TherapySlotRepository,
    private readonly agendaValidation: AgendaValidationService,
    private readonly auditService: AuditService,
  ) {}

  async findMany(
    organizationId: string,
    actor: AuthenticatedUser,
    query: AppointmentsQuery,
  ): Promise<Paginated<AppointmentDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    // El profesional solo ve sus propias citas, sin importar el query recibido (HU-07).
    const professionalId =
      actor.role === UserRole.PROFESSIONAL ? actor.userId : query.professionalId;

    const { data, total } = await this.appointmentRepository.findMany(organizationId, {
      dateFrom: query.dateFrom ? new Date(query.dateFrom) : undefined,
      dateTo: query.dateTo ? new Date(query.dateTo) : undefined,
      professionalId,
      patientId: query.patientId,
      status: query.status,
      page,
      pageSize,
    });
    return paginate(
      data.map((appointment) => this.toDto(appointment)),
      total,
      { page, pageSize },
    );
  }

  /** CU-04: sobrecupo (cita ad-hoc sin plantilla). */
  async create(
    organizationId: string,
    dto: CreateAppointmentRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<AppointmentDto> {
    await this.agendaValidation.assertPatientExists(organizationId, dto.patientId);
    await this.agendaValidation.assertProfessionalValid(organizationId, dto.professionalId);

    const date = new Date(dto.date);
    const startMinute = timeStringToMinutes(dto.startTime);
    await this.assertNoOverlap(organizationId, {
      professionalId: dto.professionalId,
      patientId: dto.patientId,
      date,
      startMinute,
      durationMinutes: dto.durationMinutes,
    });

    const created = await this.appointmentRepository.create({
      organizationId,
      therapySlotId: null,
      patientId: dto.patientId,
      professionalId: dto.professionalId,
      date,
      startMinute,
      durationMinutes: dto.durationMinutes,
      status: AppointmentStatus.SOBRECUPO,
      notes: dto.notes ?? null,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.CREATE,
      entity: 'Appointment',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(created);
  }

  /** CU-03: genera instancias PENDIENTE a partir de los slots activos vigentes en el rango. Idempotente. */
  async generateAppointments(
    organizationId: string,
    dto: GenerateAppointmentsRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<GenerateAppointmentsResult> {
    const from = new Date(dto.from);
    const to = new Date(dto.to);
    if (to.getTime() < from.getTime()) {
      throw new BadRequestException('"to" no puede ser anterior a "from"');
    }
    const rangeDays = (to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000);
    if (rangeDays > MAX_GENERATE_RANGE_DAYS) {
      throw new BadRequestException(`El rango no puede superar ${MAX_GENERATE_RANGE_DAYS} días`);
    }

    const slots = await this.therapySlotRepository.findAllActive(organizationId);
    const rows: CreateAppointmentData[] = slots.flatMap((slot) =>
      enumerateWeekdayDates(from, to, slot.weekday, slot.validFrom, slot.validTo).map((date) => ({
        organizationId,
        therapySlotId: slot.id,
        patientId: slot.patientId,
        professionalId: slot.professionalId,
        date,
        startMinute: slot.startMinute,
        durationMinutes: slot.durationMinutes,
        status: AppointmentStatus.PENDIENTE,
      })),
    );

    const created = await this.appointmentRepository.createMany(rows);
    const skipped = rows.length - created;

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.CREATE,
      entity: 'Appointment',
      entityId: null,
      newValue: { from: dto.from, to: dto.to, created, skipped },
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return { created, skipped };
  }

  /** CU-05: confirmar/cancelar (solo ADMIN, ver controller). */
  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdateAppointmentStatusRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<AppointmentDto> {
    const existing = await this.appointmentRepository.findById(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Cita no encontrada');
    }

    const allowedTargets = ADMIN_STATUS_TRANSITIONS[existing.status];
    if (!allowedTargets.includes(dto.status)) {
      throw new ConflictException('Transición de estado inválida para el estado actual de la cita');
    }

    const updated = await this.appointmentRepository.update(organizationId, id, {
      status: dto.status,
      confirmedVia: dto.status === AppointmentStatus.CONFIRMADA ? ConfirmedVia.MANUAL : undefined,
      notes: dto.notes !== undefined ? dto.notes : undefined,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.UPDATE,
      entity: 'Appointment',
      entityId: updated.id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(updated);
  }

  /** CU-06: marcar asistencia (PROFESSIONAL sobre sus propias citas hoy/pasado, o ADMIN sin restricción). */
  async markAttendance(
    organizationId: string,
    id: string,
    dto: MarkAttendanceRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<AppointmentDto> {
    const existing = await this.appointmentRepository.findById(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Cita no encontrada');
    }

    if (actor.role === UserRole.PROFESSIONAL) {
      // Cita de otro profesional: se comporta como inexistente (mismo criterio que el aislamiento de tenant).
      if (existing.professionalId !== actor.userId) {
        throw new NotFoundException('Cita no encontrada');
      }
      if (existing.date.getTime() > this.today().getTime()) {
        throw new BadRequestException('No puede marcar asistencia de una cita futura');
      }
    }

    if (TERMINAL_APPOINTMENT_STATUSES.has(existing.status)) {
      throw new ConflictException('La cita ya está en un estado terminal');
    }

    const updated = await this.appointmentRepository.update(organizationId, id, {
      status: dto.status,
      notes: dto.notes !== undefined ? dto.notes : undefined,
      attendanceMarkedById: actor.userId,
      attendanceMarkedAt: new Date(),
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.UPDATE,
      entity: 'Appointment',
      entityId: updated.id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(updated);
  }

  /**
   * Próxima cita no terminal de un paciente (Módulo 6, menú de WhatsApp "Confirmar"/"Cancelar
   * cita"): la de fecha más próxima entre `PENDIENTE`, `CONFIRMADA` y `SOBRECUPO`. `null` si no
   * tiene ninguna.
   */
  async findNextUpcomingForPatient(
    organizationId: string,
    patientId: string,
  ): Promise<AppointmentRecord | null> {
    const { data } = await this.appointmentRepository.findMany(organizationId, {
      patientId,
      dateFrom: this.today(),
      page: 1,
      pageSize: 50,
    });
    return (
      data.find((appointment) => !TERMINAL_APPOINTMENT_STATUSES.has(appointment.status)) ?? null
    );
  }

  /**
   * Confirmar/cancelar iniciado por el paciente vía WhatsApp (Módulo 6, CU-03): misma máquina
   * de estados que `updateStatus`, pero `confirmedVia=WHATSAPP` (nunca `MANUAL`) y auditado con
   * un actor de sistema (`userId=null`, sin `RequestContext` de un request HTTP real).
   */
  async applyWhatsAppResponse(
    organizationId: string,
    appointmentId: string,
    response: 'CONFIRM' | 'CANCEL',
  ): Promise<AppointmentRecord> {
    const existing = await this.appointmentRepository.findById(organizationId, appointmentId);
    if (!existing) {
      throw new NotFoundException('Cita no encontrada');
    }

    const targetStatus =
      response === 'CONFIRM' ? AppointmentStatus.CONFIRMADA : AppointmentStatus.CANCELADA;
    const allowedTargets = ADMIN_STATUS_TRANSITIONS[existing.status];
    if (!allowedTargets.includes(targetStatus)) {
      throw new ConflictException('Transición de estado inválida para el estado actual de la cita');
    }

    const updated = await this.appointmentRepository.update(organizationId, appointmentId, {
      status: targetStatus,
      confirmedVia:
        targetStatus === AppointmentStatus.CONFIRMADA ? ConfirmedVia.WHATSAPP : undefined,
    });

    await this.auditService.log({
      organizationId,
      userId: null,
      userEmail: 'sistema@whatsapp',
      action: AuditAction.UPDATE,
      entity: 'Appointment',
      entityId: updated.id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: null,
      userAgent: null,
    });

    return updated;
  }

  /** Solapamiento con otra cita no cancelada del mismo profesional o del mismo paciente (CU-04). */
  private async assertNoOverlap(
    organizationId: string,
    params: {
      professionalId: string;
      patientId: string;
      date: Date;
      startMinute: number;
      durationMinutes: number;
    },
  ): Promise<void> {
    const candidates = await this.appointmentRepository.findOverlapping(organizationId, params);
    if (candidates.length > 0) {
      throw new ConflictException(
        'El horario se solapa con otra cita no cancelada del profesional o del paciente',
      );
    }
  }

  /** "Hoy" en medianoche UTC, comparable directamente con `Appointment.date` (@db.Date). */
  private today(): Date {
    return new Date(new Date().toISOString().slice(0, 10));
  }

  private toAuditSnapshot(appointment: AppointmentRecord): Record<string, unknown> {
    return { ...appointment };
  }

  private toDto(appointment: AppointmentRecord): AppointmentDto {
    return {
      id: appointment.id,
      therapySlotId: appointment.therapySlotId,
      patientId: appointment.patientId,
      professionalId: appointment.professionalId,
      date: appointment.date.toISOString().slice(0, 10),
      startTime: minutesToTimeString(appointment.startMinute),
      durationMinutes: appointment.durationMinutes,
      status: appointment.status,
      confirmedVia: appointment.confirmedVia,
      notes: appointment.notes,
      attendanceMarkedById: appointment.attendanceMarkedById,
      attendanceMarkedAt: appointment.attendanceMarkedAt
        ? appointment.attendanceMarkedAt.toISOString()
        : null,
      createdAt: appointment.createdAt.toISOString(),
      updatedAt: appointment.updatedAt.toISOString(),
    };
  }
}
