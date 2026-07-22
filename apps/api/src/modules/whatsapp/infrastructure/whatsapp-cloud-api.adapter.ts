import { MessagingPort, SendTextParams } from '../domain/messaging.port';

const CLOUD_API_BASE = 'https://graph.facebook.com/v20.0';

/**
 * Adaptador real de `MessagingPort` contra la API de Meta (WhatsApp Business Cloud API),
 * vía `fetch` nativo (sin SDK). Un único `accessToken` de cuenta de sistema puede enviar en
 * nombre de varios `phone_number_id` (uno por organización) — ver modulo-06-whatsapp.md §1.
 */
export class WhatsAppCloudApiAdapter implements MessagingPort {
  constructor(private readonly accessToken: string) {}

  async sendText({
    fromPhoneNumberId,
    to,
    body,
  }: SendTextParams): Promise<{ providerMessageId: string }> {
    const res = await fetch(`${CLOUD_API_BASE}/${fromPhoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body },
      }),
    });
    if (!res.ok) {
      throw new Error(`WhatsApp Cloud API rechazó el envío (${res.status})`);
    }
    const data = (await res.json()) as { messages: Array<{ id: string }> };
    return { providerMessageId: data.messages[0].id };
  }
}
