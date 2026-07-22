import { Injectable } from '@nestjs/common';
import { Document as PrismaDocument } from '@prisma/client';
import { ClinicalConfidentiality, DocumentCategory } from '@centro/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  CreateDocumentData,
  DocumentFilters,
  DocumentRecord,
  DocumentRepository,
} from '../domain/document.repository';

@Injectable()
export class PrismaDocumentRepository implements DocumentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(organizationId: string, id: string): Promise<DocumentRecord | null> {
    const document = await this.prisma.document.findFirst({ where: { id, organizationId } });
    return document ? this.toRecord(document) : null;
  }

  async findMany(
    organizationId: string,
    filters: DocumentFilters,
  ): Promise<{ data: DocumentRecord[]; total: number }> {
    const where = { organizationId, patientId: filters.patientId };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.document.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
      this.prisma.document.count({ where }),
    ]);

    return { data: rows.map((row) => this.toRecord(row)), total };
  }

  async create(data: CreateDocumentData): Promise<DocumentRecord> {
    const created = await this.prisma.document.create({ data });
    return this.toRecord(created);
  }

  private toRecord(document: PrismaDocument): DocumentRecord {
    return {
      id: document.id,
      organizationId: document.organizationId,
      patientId: document.patientId,
      evolutionId: document.evolutionId,
      uploadedById: document.uploadedById,
      category: document.category as DocumentCategory,
      name: document.name,
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      driveFileId: document.driveFileId,
      confidentiality: document.confidentiality as ClinicalConfidentiality,
      createdAt: document.createdAt,
    };
  }
}
