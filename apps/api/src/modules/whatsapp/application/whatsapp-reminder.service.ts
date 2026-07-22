import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { minutesToTimeString, ReminderRunResult } from '@centro/shared';
import { AgendaAccessService } from '../../agenda/application/agenda-access.service';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { WhatsAppConversationService } from './whatsapp-conversation.service';
import { WhatsAppMessagingService } from './whatsapp-messaging.service';
import { WHATSAPP_TEMPLATE_KEYS } from './whatsapp-templates';

/**
 * Recordatorio "24 horas antes" implementado como barrido diario del día siguiente (no una
 * ventana de precisión al minuto) — decisión de diseño justificada en
 * modulo-06-whatsapp.md §1.1. Cruza organizaciones a propósito (§1.2): es un job de sistema,
 * no una request de un tenant.
 */
@Injectable()
export class WhatsAppReminderService {
  constructor(
    private readonly agendaAccessService: AgendaAccessService,
    private readonly messagingService: WhatsAppMessagingService,
    private readonly conversationService: WhatsAppConversationService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron('0 9 * * *')
  async runDailyReminder(): Promise<void> {
    await this.sendDueReminders();
  }

  /** Idempotente: repetir el barrido sobre el mismo día no duplica envíos (CU-02). */
  async sendDueReminders(): Promise<ReminderRunResult> {
    const tomorrow = this.tomorrow();
    const appointments = await this.agendaAccessService.findAppointmentsDueForReminder(
      tomorrow,
      tomorrow,
    );

    let sent = 0;
    let skipped = 0;

    for (const appointment of appointments) {
      const alreadySent = await this.messagingService.hasBeenSentForAppointment(
        appointment.id,
        WHATSAPP_TEMPLATE_KEYS.ATTENDANCE_REMINDER,
      );
      if (alreadySent) {
        skipped += 1;
        continue;
      }

      const [organization, patient] = await Promise.all([
        this.prisma.organization.findUnique({
          where: { id: appointment.organizationId },
          select: { whatsappPhoneNumberId: true },
        }),
        this.prisma.patient.findFirst({
          where: { id: appointment.patientId, organizationId: appointment.organizationId },
          select: { phone: true },
        }),
      ]);

      // Sin número de WhatsApp de la organización o sin teléfono del paciente no hay a quién o
      // desde dónde enviar: se omite esta cita y se continúa con las demás (§1: "se omite... sin
      // lanzar error").
      if (!organization?.whatsappPhoneNumberId || !patient?.phone) {
        skipped += 1;
        continue;
      }

      await this.conversationService.startAttendanceConfirmation(
        appointment.organizationId,
        organization.whatsappPhoneNumberId,
        patient.phone,
        appointment,
        appointment.date.toISOString().slice(0, 10),
        minutesToTimeString(appointment.startMinute),
      );
      sent += 1;
    }

    return { sent, skipped };
  }

  /** "Mañana" en medianoche UTC, comparable con `Appointment.date` (@db.Date). */
  private tomorrow(): Date {
    const today = new Date(new Date().toISOString().slice(0, 10));
    today.setUTCDate(today.getUTCDate() + 1);
    return today;
  }
}
