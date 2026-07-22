import type { PageQuery } from './pagination';

export enum WhatsAppMessageDirection {
  INBOUND = 'INBOUND',
  OUTBOUND = 'OUTBOUND',
}

export enum WhatsAppMessageStatus {
  QUEUED = 'QUEUED',
  SENT = 'SENT',
  DELIVERED = 'DELIVERED',
  FAILED = 'FAILED',
}

export interface WhatsAppMessageDto {
  id: string;
  direction: WhatsAppMessageDirection;
  phone: string;
  templateKey: string | null;
  body: string;
  appointmentId: string | null;
  status: WhatsAppMessageStatus;
  providerMessageId: string | null;
  createdAt: string;
}

export type WhatsAppMessagesQuery = PageQuery;

export interface ReminderRunResult {
  sent: number;
  skipped: number;
}
