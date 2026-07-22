import { Injectable } from '@nestjs/common';
import { Prisma, WhatsAppConversation as PrismaWhatsAppConversation } from '@prisma/client';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  UpsertWhatsAppConversationData,
  WhatsAppConversationRecord,
  WhatsAppConversationRepository,
  WhatsAppConversationStep,
} from '../domain/whatsapp-conversation.repository';

@Injectable()
export class PrismaWhatsAppConversationRepository implements WhatsAppConversationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByPhone(
    organizationId: string,
    phone: string,
  ): Promise<WhatsAppConversationRecord | null> {
    const conversation = await this.prisma.whatsAppConversation.findUnique({
      where: { organizationId_phone: { organizationId, phone } },
    });
    return conversation ? this.toRecord(conversation) : null;
  }

  async upsert(data: UpsertWhatsAppConversationData): Promise<WhatsAppConversationRecord> {
    const conversation = await this.prisma.whatsAppConversation.upsert({
      where: { organizationId_phone: { organizationId: data.organizationId, phone: data.phone } },
      create: {
        organizationId: data.organizationId,
        phone: data.phone,
        currentStep: data.currentStep,
        context: (data.context ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        expiresAt: data.expiresAt,
      },
      update: {
        currentStep: data.currentStep,
        context: (data.context ?? Prisma.JsonNull) as Prisma.InputJsonValue,
        expiresAt: data.expiresAt,
      },
    });
    return this.toRecord(conversation);
  }

  private toRecord(conversation: PrismaWhatsAppConversation): WhatsAppConversationRecord {
    return {
      id: conversation.id,
      organizationId: conversation.organizationId,
      phone: conversation.phone,
      currentStep: conversation.currentStep as WhatsAppConversationStep,
      context: conversation.context as Record<string, unknown> | null,
      expiresAt: conversation.expiresAt,
    };
  }
}
