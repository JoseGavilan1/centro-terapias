import { randomUUID } from 'crypto';
import { MessagingPort, SendTextParams } from '../domain/messaging.port';

/**
 * Doble de desarrollo/test de `MessagingPort` (ADR-11): no llama a ningún proveedor real,
 * solo registra el envío en consola. El registro persistente vive en `WhatsAppMessage`
 * (responsabilidad de `WhatsAppMessagingService`, no de este adaptador).
 */
export class ConsoleMessagingAdapter implements MessagingPort {
  sendText(params: SendTextParams): Promise<{ providerMessageId: string }> {
    console.log(`[WhatsApp:console] ${params.fromPhoneNumberId} -> ${params.to}: ${params.body}`);
    return Promise.resolve({ providerMessageId: `console-${randomUUID()}` });
  }
}
