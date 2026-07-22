import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import {
  AuditAction,
  CreateIncidentRequest,
  DEFAULT_PAGE_SIZE,
  IncidentDto,
  INCIDENT_TYPE_LABELS,
  IncidentsQuery,
  IncidentStatus,
  Paginated,
  paginate,
  UpdateIncidentStatusRequest,
  UserRole,
} from '@centro/shared';
import { AgendaAccessService } from '../../agenda/application/agenda-access.service';
import { AuditService } from '../../audit/application/audit.service';
import { WhatsAppMessagingService } from '../../whatsapp/application/whatsapp-messaging.service';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  INCIDENT_REPOSITORY,
  IncidentRecord,
  IncidentRepository,
} from '../domain/incident.repository';

/** Plantilla propia del módulo (no reutiliza `WHATSAPP_TEMPLATE_KEYS` del Módulo 6: ese enum es interno de `whatsapp`). */
const ADMIN_INCIDENT_NOTICE_TEMPLATE_KEY = 'ADMIN_INCIDENT_NOTICE';

@Injectable()
export class IncidentsService {
  constructor(
    @Inject(INCIDENT_REPOSITORY) private readonly incidentRepository: IncidentRepository,
    private readonly agendaAccessService: AgendaAccessService,
    private readonly auditService: AuditService,
    private readonly messagingService: WhatsAppMessagingService,
    private readonly prisma: PrismaService,
  ) {}

  async findMany(
    organizationId: string,
    actor: AuthenticatedUser,
    query: IncidentsQuery,
  ): Promise<Paginated<IncidentDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { data, total } = await this.incidentRepository.findMany(organizationId, {
      status: query.status,
      type: query.type,
      patientId: query.patientId,
      // PROFESSIONAL solo ve lo que reportó (§1.2 modulo-08-incidencias.md); ADMIN sin restricción.
      reportedById: actor.role === UserRole.PROFESSIONAL ? actor.userId : undefined,
      page,
      pageSize,
    });
    return paginate(
      data.map((incident) => this.toDto(incident)),
      total,
      { page, pageSize },
    );
  }

  async findOne(
    organizationId: string,
    actor: AuthenticatedUser,
    id: string,
  ): Promise<IncidentDto> {
    const incident = await this.incidentRepository.findById(organizationId, id);
    if (
      !incident ||
      (actor.role === UserRole.PROFESSIONAL && incident.reportedById !== actor.userId)
    ) {
      throw new NotFoundException('Incidencia no encontrada');
    }
    return this.toDto(incident);
  }

  async create(
    organizationId: string,
    dto: CreateIncidentRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<IncidentDto> {
    if (dto.patientId) {
      await this.assertPatientAccessible(organizationId, actor, dto.patientId);
    }

    const created = await this.incidentRepository.create({
      organizationId,
      patientId: dto.patientId ?? null,
      reportedById: actor.userId,
      type: dto.type,
      description: dto.description,
      occurredAt: new Date(dto.occurredAt),
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.CREATE,
      entity: 'Incident',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    await this.notifyAdmins(organizationId, created);

    return this.toDto(created);
  }

  /** Solo ADMIN (`@Roles`, presentation). `CERRADA` es terminal (§1.3): no admite más transiciones. */
  async updateStatus(
    organizationId: string,
    id: string,
    dto: UpdateIncidentStatusRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<IncidentDto> {
    const existing = await this.incidentRepository.findById(organizationId, id);
    if (!existing) {
      throw new NotFoundException('Incidencia no encontrada');
    }
    if (existing.status === IncidentStatus.CERRADA) {
      throw new ConflictException('La incidencia ya fue cerrada');
    }

    const updated = await this.incidentRepository.updateStatus(organizationId, id, dto.status);

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.UPDATE,
      entity: 'Incident',
      entityId: id,
      oldValue: this.toAuditSnapshot(existing),
      newValue: this.toAuditSnapshot(updated),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(updated);
  }

  /**
   * PROFESSIONAL solo puede reportar sobre un paciente asignado (mismo criterio de acceso que
   * Módulo 2 §1.2, vía `AgendaAccessService` — sin importar `PatientsModule`, mismo criterio
   * anti-ciclo que Agenda/Evolutions/Documents/WhatsApp/Waitlist). ADMIN: cualquiera de su
   * organización.
   */
  private async assertPatientAccessible(
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

  /**
   * Prioridad alta ⇒ notificación inmediata al administrador (spec). Reutiliza el canal
   * WhatsApp del Módulo 6 (`WhatsAppMessagingService`, exportado por `WhatsappModule`) en vez de
   * una integración nueva. Best-effort: si la organización no tiene WhatsApp configurado, o no
   * hay administradores con teléfono, se omite en silencio — nunca falla la creación del
   * incidente por esto (mismo criterio de resiliencia que el resto del Módulo 6).
   */
  private async notifyAdmins(organizationId: string, incident: IncidentRecord): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { whatsappPhoneNumberId: true },
    });
    if (!organization?.whatsappPhoneNumberId) {
      return;
    }

    const [patient, admins] = await Promise.all([
      incident.patientId
        ? this.prisma.patient.findFirst({
            where: { id: incident.patientId, organizationId },
            select: { firstName: true, lastName: true },
          })
        : Promise.resolve(null),
      this.prisma.user.findMany({
        where: { organizationId, role: UserRole.ADMIN, isActive: true, phone: { not: null } },
        select: { phone: true },
      }),
    ]);

    const patientLabel = patient ? ` (${patient.firstName} ${patient.lastName})` : '';
    const body = `Incidencia reportada: ${INCIDENT_TYPE_LABELS[incident.type]}${patientLabel}. Revisar en la plataforma.`;
    const fromPhoneNumberId = organization.whatsappPhoneNumberId;

    await Promise.all(
      admins
        .filter((admin): admin is { phone: string } => admin.phone !== null)
        .map((admin) =>
          this.messagingService.send({
            organizationId,
            fromPhoneNumberId,
            to: admin.phone,
            body,
            templateKey: ADMIN_INCIDENT_NOTICE_TEMPLATE_KEY,
          }),
        ),
    );
  }

  private toAuditSnapshot(incident: IncidentRecord): Record<string, unknown> {
    return { ...incident };
  }

  private toDto(incident: IncidentRecord): IncidentDto {
    return {
      id: incident.id,
      patientId: incident.patientId,
      reportedById: incident.reportedById,
      type: incident.type,
      description: incident.description,
      occurredAt: incident.occurredAt.toISOString(),
      status: incident.status,
      createdAt: incident.createdAt.toISOString(),
      updatedAt: incident.updatedAt.toISOString(),
    };
  }
}
