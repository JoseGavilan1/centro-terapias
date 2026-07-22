export interface SendTextParams {
  /** `phone_number_id` de WhatsApp Business de la organización remitente (Módulo 6 §1). */
  fromPhoneNumberId: string;
  to: string;
  body: string;
}

/**
 * Puerto de envío de mensajes (ADR-11). Dos adaptadores en `infrastructure`:
 * `WhatsAppCloudApiAdapter` (real, producción) y `ConsoleMessagingAdapter` (doble de
 * desarrollo/test), seleccionables por `MESSAGING_DRIVER` — mismo criterio que
 * `DocumentStoragePort` en el Módulo 5.
 */
export interface MessagingPort {
  sendText(params: SendTextParams): Promise<{ providerMessageId: string }>;
}

export const MESSAGING_PORT = Symbol('MESSAGING_PORT');
