import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AppointmentStatus, UserRole } from '@centro/shared';
import { AgendaAccessService } from '../../agenda/application/agenda-access.service';
import { AppointmentRecord } from '../../agenda/domain/appointment.repository';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  WHATSAPP_CONVERSATION_REPOSITORY,
  WhatsAppConversationRepository,
  WhatsAppConversationStep,
} from '../domain/whatsapp-conversation.repository';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WHATSAPP_TEMPLATE_KEYS, WhatsAppTemplates } from './whatsapp-templates';

/** Una conversación vencida se trata como IDLE (modulo-06-whatsapp.md §1). */
const CONVERSATION_TTL_MS = 24 * 60 * 60 * 1000;

interface IncomingMessage {
  organizationId: string;
  fromPhoneNumberId: string;
  phone: string;
  text: string;
}

interface PatientLookup {
  id: string;
  firstName: string;
  lastName: string;
}

/**
 * Motor conversacional determinista (spec: "NO utilizar IA. NO utilizar ChatGPT. NO utilizar
 * Gemini."). Toda respuesta se elige por un árbol de decisión fijo sobre el dígito recibido y
 * el `currentStep` de la conversación — nunca se interpreta lenguaje libre.
 */
@Injectable()
export class WhatsAppConversationService {
  constructor(
    @Inject(WHATSAPP_CONVERSATION_REPOSITORY)
    private readonly conversationRepository: WhatsAppConversationRepository,
    private readonly agendaAccessService: AgendaAccessService,
    private readonly messagingService: WhatsAppMessagingService,
    private readonly prisma: PrismaService,
  ) {}

  async handleIncomingMessage(message: IncomingMessage): Promise<void> {
    await this.messagingService.recordInbound(message.organizationId, message.phone, message.text);

    const conversation = await this.conversationRepository.findByPhone(
      message.organizationId,
      message.phone,
    );
    const isExpired = !conversation || conversation.expiresAt.getTime() <= Date.now();
    const step = isExpired ? WhatsAppConversationStep.IDLE : conversation.currentStep;
    const digit = message.text.trim().charAt(0);

    switch (step) {
      case WhatsAppConversationStep.AWAITING_MENU_CHOICE:
        await this.handleMenuChoice(message, digit);
        return;
      case WhatsAppConversationStep.AWAITING_ATTENDANCE_CONFIRMATION:
        await this.handleAttendanceResponse(
          message,
          digit,
          conversation!.context as { appointmentId: string },
        );
        return;
      case WhatsAppConversationStep.IDLE:
      default:
        await this.sendMenu(message);
    }
  }

  /** Punto de entrada del recordatorio automático (WhatsAppReminderService, CU-02). */
  async startAttendanceConfirmation(
    organizationId: string,
    fromPhoneNumberId: string,
    phone: string,
    appointment: AppointmentRecord,
    dateLabel: string,
    timeLabel: string,
  ): Promise<void> {
    await this.messagingService.send({
      organizationId,
      fromPhoneNumberId,
      to: phone,
      body: WhatsAppTemplates.attendanceReminder(dateLabel, timeLabel),
      templateKey: WHATSAPP_TEMPLATE_KEYS.ATTENDANCE_REMINDER,
      appointmentId: appointment.id,
    });
    await this.setStep(
      organizationId,
      phone,
      WhatsAppConversationStep.AWAITING_ATTENDANCE_CONFIRMATION,
      {
        appointmentId: appointment.id,
      },
    );
  }

  private async sendMenu(message: IncomingMessage): Promise<void> {
    await this.send(message, WhatsAppTemplates.mainMenu(), WHATSAPP_TEMPLATE_KEYS.MAIN_MENU);
    await this.setStep(
      message.organizationId,
      message.phone,
      WhatsAppConversationStep.AWAITING_MENU_CHOICE,
      null,
    );
  }

  private async handleMenuChoice(message: IncomingMessage, digit: string): Promise<void> {
    switch (digit) {
      case '1':
        await this.confirmNextAppointment(message);
        break;
      case '2':
        await this.cancelNextAppointment(message);
        break;
      case '3':
        await this.send(
          message,
          WhatsAppTemplates.rescheduleInfo(),
          WHATSAPP_TEMPLATE_KEYS.RESCHEDULE_INFO,
        );
        break;
      case '4':
        await this.sendNewPatientInfo(message);
        break;
      default:
        // Opción inválida: se reenvía el menú y la conversación sigue esperando (no se reinicia a IDLE).
        await this.send(
          message,
          WhatsAppTemplates.invalidOption(),
          WHATSAPP_TEMPLATE_KEYS.INVALID_OPTION,
        );
        return;
    }
    await this.resetToIdle(message.organizationId, message.phone);
  }

  private async confirmNextAppointment(message: IncomingMessage): Promise<void> {
    const appointment = await this.findNextAppointmentForPhone(
      message.organizationId,
      message.phone,
    );
    if (!appointment) {
      await this.send(
        message,
        WhatsAppTemplates.noUpcomingAppointment(),
        WHATSAPP_TEMPLATE_KEYS.NO_UPCOMING_APPOINTMENT,
      );
      return;
    }
    if (appointment.status === AppointmentStatus.CONFIRMADA) {
      await this.send(
        message,
        WhatsAppTemplates.alreadyConfirmed(),
        WHATSAPP_TEMPLATE_KEYS.ALREADY_CONFIRMED,
        appointment.id,
      );
      return;
    }
    await this.respond(message, appointment.id, 'CONFIRM');
  }

  private async cancelNextAppointment(message: IncomingMessage): Promise<void> {
    const appointment = await this.findNextAppointmentForPhone(
      message.organizationId,
      message.phone,
    );
    if (!appointment) {
      await this.send(
        message,
        WhatsAppTemplates.noUpcomingAppointment(),
        WHATSAPP_TEMPLATE_KEYS.NO_UPCOMING_APPOINTMENT,
      );
      return;
    }
    // A diferencia de la respuesta al recordatorio automático, cancelar desde el menú NO
    // notifica a los administradores (spec: "Notificar administrador" solo aparece bajo el
    // flujo de recordatorio, ver modulo-06-whatsapp.md §1).
    await this.respond(message, appointment.id, 'CANCEL', { notifyAdmins: false });
  }

  private async sendNewPatientInfo(message: IncomingMessage): Promise<void> {
    const organization = await this.prisma.organization.findUnique({
      where: { id: message.organizationId },
      select: { googleFormsUrl: true },
    });
    const formUrl = organization?.googleFormsUrl;
    if (!formUrl) {
      await this.send(
        message,
        WhatsAppTemplates.rescheduleInfo(),
        WHATSAPP_TEMPLATE_KEYS.RESCHEDULE_INFO,
      );
      return;
    }
    await this.send(
      message,
      WhatsAppTemplates.newPatientInfo(formUrl),
      WHATSAPP_TEMPLATE_KEYS.NEW_PATIENT_INFO,
    );
  }

  private async handleAttendanceResponse(
    message: IncomingMessage,
    digit: string,
    context: { appointmentId: string },
  ): Promise<void> {
    if (digit !== '1' && digit !== '2') {
      await this.send(
        message,
        WhatsAppTemplates.invalidAttendanceResponse(),
        WHATSAPP_TEMPLATE_KEYS.INVALID_ATTENDANCE_RESPONSE,
        context.appointmentId,
      );
      return;
    }
    const response = digit === '1' ? 'CONFIRM' : 'CANCEL';
    await this.respond(message, context.appointmentId, response, {
      notifyAdmins: response === 'CANCEL',
    });
  }

  /** Aplica la transición y responde; `notifyAdmins` solo aplica a CANCEL (default true, ver handleAttendanceResponse/cancelNextAppointment). */
  private async respond(
    message: IncomingMessage,
    appointmentId: string,
    response: 'CONFIRM' | 'CANCEL',
    options: { notifyAdmins?: boolean } = {},
  ): Promise<void> {
    try {
      const appointment = await this.agendaAccessService.respondToAppointmentViaWhatsApp(
        message.organizationId,
        appointmentId,
        response,
      );
      if (response === 'CONFIRM') {
        await this.send(
          message,
          WhatsAppTemplates.confirmationAck(),
          WHATSAPP_TEMPLATE_KEYS.CONFIRMATION_ACK,
          appointment.id,
        );
      } else {
        await this.send(
          message,
          WhatsAppTemplates.cancellationAck(),
          WHATSAPP_TEMPLATE_KEYS.CANCELLATION_ACK,
          appointment.id,
        );
        if (options.notifyAdmins !== false) {
          await this.notifyAdmins(message.organizationId, message.fromPhoneNumberId, appointment);
        }
      }
    } catch (error) {
      if (error instanceof ConflictException || error instanceof NotFoundException) {
        await this.send(
          message,
          WhatsAppTemplates.invalidTransition(),
          WHATSAPP_TEMPLATE_KEYS.INVALID_TRANSITION,
          appointmentId,
        );
        return;
      }
      throw error;
    } finally {
      await this.resetToIdle(message.organizationId, message.phone);
    }
  }

  private async notifyAdmins(
    organizationId: string,
    fromPhoneNumberId: string,
    appointment: AppointmentRecord,
  ): Promise<void> {
    const [patient, admins] = await Promise.all([
      this.prisma.patient.findFirst({
        where: { id: appointment.patientId, organizationId },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.user.findMany({
        where: { organizationId, role: UserRole.ADMIN, isActive: true, phone: { not: null } },
        select: { phone: true },
      }),
    ]);

    const patientName = patient ? `${patient.firstName} ${patient.lastName}` : 'un paciente';
    const dateLabel = appointment.date.toISOString().slice(0, 10);

    await Promise.all(
      admins
        .filter((admin): admin is { phone: string } => admin.phone !== null)
        .map((admin) =>
          this.messagingService.send({
            organizationId,
            fromPhoneNumberId,
            to: admin.phone,
            body: WhatsAppTemplates.adminCancellationNotice(patientName, dateLabel),
            templateKey: WHATSAPP_TEMPLATE_KEYS.ADMIN_CANCELLATION_NOTICE,
            appointmentId: appointment.id,
          }),
        ),
    );
  }

  /**
   * Un mismo teléfono puede tener varios pacientes (p. ej. varios hijos con el mismo apoderado):
   * se actúa sobre la cita más próxima entre todos ellos, no solo la del primer paciente encontrado.
   */
  private async findNextAppointmentForPhone(
    organizationId: string,
    phone: string,
  ): Promise<AppointmentRecord | null> {
    const patients = await this.findPatientsByPhone(organizationId, phone);
    const candidates = await Promise.all(
      patients.map((patient) =>
        this.agendaAccessService.findNextUpcomingAppointment(organizationId, patient.id),
      ),
    );
    const found = candidates.filter(
      (appointment): appointment is AppointmentRecord => appointment !== null,
    );
    if (found.length === 0) {
      return null;
    }
    return found.reduce((earliest, current) =>
      current.date.getTime() < earliest.date.getTime() ? current : earliest,
    );
  }

  private findPatientsByPhone(organizationId: string, phone: string): Promise<PatientLookup[]> {
    return this.prisma.patient.findMany({
      where: { organizationId, phone, isActive: true },
      select: { id: true, firstName: true, lastName: true },
    });
  }

  private send(
    message: IncomingMessage,
    body: string,
    templateKey: string,
    appointmentId?: string,
  ): Promise<unknown> {
    return this.messagingService.send({
      organizationId: message.organizationId,
      fromPhoneNumberId: message.fromPhoneNumberId,
      to: message.phone,
      body,
      templateKey,
      appointmentId,
    });
  }

  private resetToIdle(organizationId: string, phone: string): Promise<void> {
    return this.setStep(organizationId, phone, WhatsAppConversationStep.IDLE, null);
  }

  private async setStep(
    organizationId: string,
    phone: string,
    currentStep: WhatsAppConversationStep,
    context: Record<string, unknown> | null,
  ): Promise<void> {
    await this.conversationRepository.upsert({
      organizationId,
      phone,
      currentStep,
      context,
      expiresAt: new Date(Date.now() + CONVERSATION_TTL_MS),
    });
  }
}
