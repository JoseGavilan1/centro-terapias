import { Injectable } from '@nestjs/common';
import { WhatsAppMessage as PrismaWhatsAppMessage } from '@prisma/client';
import { WhatsAppMessageDirection, WhatsAppMessageStatus } from '@centro/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateWhatsAppMessageData,
  WhatsAppMessageFilters,
  WhatsAppMessageRecord,
  WhatsAppMessageRepository,
} from '../domain/whatsapp-message.repository';

@Injectable()
export class PrismaWhatsAppMessageRepository implements WhatsAppMessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findMany(
    organizationId: string,
    filters: WhatsAppMessageFilters,
  ): Promise<{ data: WhatsAppMessageRecord[]; total: number }> {
    const where = { organizationId };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.whatsAppMessage.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.whatsAppMessage.count({ where }),
    ]);

    return { data: rows.map((row) => this.toRecord(row)), total };
  }

  async existsForAppointment(appointmentId: string, templateKey: string): Promise<boolean> {
    const count = await this.prisma.whatsAppMessage.count({
      where: { appointmentId, templateKey },
    });
    return count > 0;
  }

  async create(data: CreateWhatsAppMessageData): Promise<WhatsAppMessageRecord> {
    const created = await this.prisma.whatsAppMessage.create({ data });
    return this.toRecord(created);
  }

  private toRecord(message: PrismaWhatsAppMessage): WhatsAppMessageRecord {
    return {
      id: message.id,
      organizationId: message.organizationId,
      direction: message.direction as WhatsAppMessageDirection,
      phone: message.phone,
      templateKey: message.templateKey,
      body: message.body,
      appointmentId: message.appointmentId,
      status: message.status as WhatsAppMessageStatus,
      providerMessageId: message.providerMessageId,
      createdAt: message.createdAt,
    };
  }
}
