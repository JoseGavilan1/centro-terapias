import { WhatsAppMessageDirection, WhatsAppMessageStatus } from '@centro/shared';

export interface WhatsAppMessageRecord {
  id: string;
  organizationId: string;
  direction: WhatsAppMessageDirection;
  phone: string;
  templateKey: string | null;
  body: string;
  appointmentId: string | null;
  status: WhatsAppMessageStatus;
  providerMessageId: string | null;
  createdAt: Date;
}

export interface CreateWhatsAppMessageData {
  organizationId: string;
  direction: WhatsAppMessageDirection;
  phone: string;
  templateKey: string | null;
  body: string;
  appointmentId: string | null;
  status: WhatsAppMessageStatus;
  providerMessageId: string | null;
}

export interface WhatsAppMessageFilters {
  page: number;
  pageSize: number;
}

export interface WhatsAppMessageRepository {
  findMany(
    organizationId: string,
    filters: WhatsAppMessageFilters,
  ): Promise<{ data: WhatsAppMessageRecord[]; total: number }>;
  /** Idempotencia del recordatorio (CU-02): ¿ya existe un mensaje de esta plantilla para esta cita? */
  existsForAppointment(appointmentId: string, templateKey: string): Promise<boolean>;
  create(data: CreateWhatsAppMessageData): Promise<WhatsAppMessageRecord>;
}

export const WHATSAPP_MESSAGE_REPOSITORY = Symbol('WHATSAPP_MESSAGE_REPOSITORY');
