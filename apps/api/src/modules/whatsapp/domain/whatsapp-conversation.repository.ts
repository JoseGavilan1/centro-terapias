export enum WhatsAppConversationStep {
  IDLE = 'IDLE',
  AWAITING_MENU_CHOICE = 'AWAITING_MENU_CHOICE',
  AWAITING_ATTENDANCE_CONFIRMATION = 'AWAITING_ATTENDANCE_CONFIRMATION',
}

export interface WhatsAppConversationRecord {
  id: string;
  organizationId: string;
  phone: string;
  currentStep: WhatsAppConversationStep;
  /** p. ej. `{ appointmentId: string }` en `AWAITING_ATTENDANCE_CONFIRMATION`. */
  context: Record<string, unknown> | null;
  expiresAt: Date;
}

export interface UpsertWhatsAppConversationData {
  organizationId: string;
  phone: string;
  currentStep: WhatsAppConversationStep;
  context: Record<string, unknown> | null;
  expiresAt: Date;
}

export interface WhatsAppConversationRepository {
  findByPhone(organizationId: string, phone: string): Promise<WhatsAppConversationRecord | null>;
  upsert(data: UpsertWhatsAppConversationData): Promise<WhatsAppConversationRecord>;
}

export const WHATSAPP_CONVERSATION_REPOSITORY = Symbol('WHATSAPP_CONVERSATION_REPOSITORY');
