import { Inject, Injectable } from '@nestjs/common';
import {
  DEFAULT_PAGE_SIZE,
  Paginated,
  paginate,
  WhatsAppMessageDirection,
  WhatsAppMessageDto,
  WhatsAppMessagesQuery,
  WhatsAppMessageStatus,
} from '@centro/shared';
import { MESSAGING_PORT, MessagingPort } from '../domain/messaging.port';
import {
  WHATSAPP_MESSAGE_REPOSITORY,
  WhatsAppMessageRecord,
  WhatsAppMessageRepository,
} from '../domain/whatsapp-message.repository';

export interface SendParams {
  organizationId: string;
  fromPhoneNumberId: string;
  to: string;
  body: string;
  templateKey: string;
  appointmentId?: string;
}

/**
 * Envía (vía `MessagingPort`) y registra (en `WhatsAppMessage`) cada mensaje saliente; también
 * registra los entrantes y resuelve la consulta de idempotencia del recordatorio (CU-02). Un
 * fallo del proveedor no lanza: se registra `FAILED` y se sigue (el motor conversacional y el
 * job de recordatorios no deben caerse por un envío fallido individual).
 */
@Injectable()
export class WhatsAppMessagingService {
  constructor(
    @Inject(MESSAGING_PORT) private readonly messaging: MessagingPort,
    @Inject(WHATSAPP_MESSAGE_REPOSITORY) private readonly repository: WhatsAppMessageRepository,
  ) {}

  async send(params: SendParams): Promise<WhatsAppMessageRecord> {
    try {
      const { providerMessageId } = await this.messaging.sendText({
        fromPhoneNumberId: params.fromPhoneNumberId,
        to: params.to,
        body: params.body,
      });
      return this.repository.create({
        organizationId: params.organizationId,
        direction: WhatsAppMessageDirection.OUTBOUND,
        phone: params.to,
        templateKey: params.templateKey,
        body: params.body,
        appointmentId: params.appointmentId ?? null,
        status: WhatsAppMessageStatus.SENT,
        providerMessageId,
      });
    } catch {
      return this.repository.create({
        organizationId: params.organizationId,
        direction: WhatsAppMessageDirection.OUTBOUND,
        phone: params.to,
        templateKey: params.templateKey,
        body: params.body,
        appointmentId: params.appointmentId ?? null,
        status: WhatsAppMessageStatus.FAILED,
        providerMessageId: null,
      });
    }
  }

  recordInbound(
    organizationId: string,
    from: string,
    body: string,
  ): Promise<WhatsAppMessageRecord> {
    return this.repository.create({
      organizationId,
      direction: WhatsAppMessageDirection.INBOUND,
      phone: from,
      templateKey: null,
      body,
      appointmentId: null,
      // Un mensaje entrante no tiene un envío que pueda fallar: ya llegó.
      status: WhatsAppMessageStatus.DELIVERED,
      providerMessageId: null,
    });
  }

  /** Idempotencia del recordatorio (CU-02): ¿ya se le envió esta plantilla a esta cita? */
  hasBeenSentForAppointment(appointmentId: string, templateKey: string): Promise<boolean> {
    return this.repository.existsForAppointment(appointmentId, templateKey);
  }

  async findMany(
    organizationId: string,
    query: WhatsAppMessagesQuery,
  ): Promise<Paginated<WhatsAppMessageDto>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { data, total } = await this.repository.findMany(organizationId, { page, pageSize });
    return paginate(
      data.map((message) => this.toDto(message)),
      total,
      { page, pageSize },
    );
  }

  private toDto(message: WhatsAppMessageRecord): WhatsAppMessageDto {
    return {
      id: message.id,
      direction: message.direction,
      phone: message.phone,
      templateKey: message.templateKey,
      body: message.body,
      appointmentId: message.appointmentId,
      status: message.status,
      providerMessageId: message.providerMessageId,
      createdAt: message.createdAt.toISOString(),
    };
  }
}
