/**
 * Todas las respuestas del módulo son texto fijo (spec: "NO utilizar IA. NO utilizar
 * ChatGPT. NO utilizar Gemini."). `templateKey` identifica cada plantilla en
 * `whatsapp_messages` y en la comprobación de idempotencia del recordatorio (CU-02).
 */
export const WHATSAPP_TEMPLATE_KEYS = {
  MAIN_MENU: 'MAIN_MENU',
  INVALID_OPTION: 'INVALID_OPTION',
  NEW_PATIENT_INFO: 'NEW_PATIENT_INFO',
  NO_UPCOMING_APPOINTMENT: 'NO_UPCOMING_APPOINTMENT',
  ALREADY_CONFIRMED: 'ALREADY_CONFIRMED',
  CONFIRMATION_ACK: 'CONFIRMATION_ACK',
  CANCELLATION_ACK: 'CANCELLATION_ACK',
  RESCHEDULE_INFO: 'RESCHEDULE_INFO',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  ATTENDANCE_REMINDER: 'ATTENDANCE_REMINDER',
  INVALID_ATTENDANCE_RESPONSE: 'INVALID_ATTENDANCE_RESPONSE',
  ADMIN_CANCELLATION_NOTICE: 'ADMIN_CANCELLATION_NOTICE',
} as const;

export type WhatsAppTemplateKey =
  (typeof WHATSAPP_TEMPLATE_KEYS)[keyof typeof WHATSAPP_TEMPLATE_KEYS];

const MAIN_MENU_TEXT =
  'Hola.\nSeleccione una opción.\n1 Confirmar cita\n2 Cancelar cita\n3 Reagendar\n4 Paciente nuevo';

export const WhatsAppTemplates = {
  mainMenu(): string {
    return MAIN_MENU_TEXT;
  },
  invalidOption(): string {
    return `Opción no válida.\n\n${MAIN_MENU_TEXT}`;
  },
  newPatientInfo(formUrl: string): string {
    return `Muchas gracias.\nComplete el siguiente formulario.\n${formUrl}\nUna vez recibido será contactado por nuestro equipo.`;
  },
  noUpcomingAppointment(): string {
    return 'No tiene citas próximas registradas.';
  },
  alreadyConfirmed(): string {
    return 'Su cita ya se encuentra confirmada.';
  },
  confirmationAck(): string {
    return 'Su cita ha sido confirmada. ¡Gracias!';
  },
  cancellationAck(): string {
    return 'Su cita ha sido cancelada.';
  },
  rescheduleInfo(): string {
    return 'Para reagendar, por favor contáctenos directamente; nuestro equipo coordinará un nuevo horario con usted.';
  },
  invalidTransition(): string {
    return 'No fue posible procesar su solicitud: la cita ya no está en un estado que permita esa acción.';
  },
  attendanceReminder(dateLabel: string, timeLabel: string): string {
    return `Hola.\nLe recordamos su sesión para ${dateLabel} a las ${timeLabel}.\n¿Confirma asistencia?\n1 Sí\n2 No`;
  },
  invalidAttendanceResponse(): string {
    return 'Respuesta no válida.\n¿Confirma asistencia?\n1 Sí\n2 No';
  },
  adminCancellationNotice(patientName: string, dateLabel: string): string {
    return `El paciente ${patientName} canceló su cita del ${dateLabel} vía WhatsApp.`;
  },
};
