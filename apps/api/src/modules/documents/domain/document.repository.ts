import { ClinicalConfidentiality, DocumentCategory } from '@centro/shared';

export interface DocumentRecord {
  id: string;
  organizationId: string;
  patientId: string;
  evolutionId: string | null;
  uploadedById: string;
  category: DocumentCategory;
  name: string;
  mimeType: string;
  sizeBytes: number;
  driveFileId: string;
  confidentiality: ClinicalConfidentiality;
  createdAt: Date;
}

export interface CreateDocumentData {
  organizationId: string;
  patientId: string;
  evolutionId: string | null;
  uploadedById: string;
  category: DocumentCategory;
  name: string;
  mimeType: string;
  sizeBytes: number;
  driveFileId: string;
  confidentiality: ClinicalConfidentiality;
}

export interface DocumentFilters {
  patientId: string;
  page: number;
  pageSize: number;
}

/** Repositorio append-only (mismo criterio que EvolutionRepository/AuditLogRepository): sin update ni delete. */
export interface DocumentRepository {
  findById(organizationId: string, id: string): Promise<DocumentRecord | null>;
  findMany(
    organizationId: string,
    filters: DocumentFilters,
  ): Promise<{ data: DocumentRecord[]; total: number }>;
  create(data: CreateDocumentData): Promise<DocumentRecord>;
}

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');
