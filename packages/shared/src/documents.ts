import type { ClinicalConfidentiality } from './clinical-records';
import type { PageQuery } from './pagination';

export enum DocumentCategory {
  INFORME = 'INFORME',
  EVOLUCION = 'EVOLUCION',
  EXAMEN = 'EXAMEN',
  RECETA = 'RECETA',
  OTRO = 'OTRO',
}

/** Nombre de la subcarpeta en el proveedor de almacenamiento (spec, árbol textual). */
export const DOCUMENT_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  [DocumentCategory.INFORME]: 'Informes',
  [DocumentCategory.EVOLUCION]: 'Evoluciones',
  [DocumentCategory.EXAMEN]: 'Exámenes',
  [DocumentCategory.RECETA]: 'Recetas',
  [DocumentCategory.OTRO]: 'Otros',
};

export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const DEFAULT_MAX_DOCUMENT_UPLOAD_BYTES = 15 * 1024 * 1024;

/**
 * `driveFileId` nunca se expone (es un id interno del adaptador de almacenamiento activo);
 * la descarga siempre pasa por `GET .../documents/:id/download`, nunca por una URL directa del
 * proveedor. `observation`/`workPlan` no aplican aquí: el binario en sí es lo que se redacta
 * ocultando por completo la posibilidad de descarga (§1 de modulo-05-documentos.md).
 */
export interface DocumentDto {
  id: string;
  patientId: string;
  evolutionId: string | null;
  uploadedById: string;
  category: DocumentCategory;
  /** `null` cuando `redacted=true`: el nombre de archivo puede ser sensible por sí mismo. */
  name: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  confidentiality: ClinicalConfidentiality;
  redacted: boolean;
  createdAt: string;
}

/** Metadatos que acompañan al archivo en el `multipart/form-data`; el archivo va en el campo `file`. */
export interface CreateDocumentMetadata {
  category: DocumentCategory;
  evolutionId?: string;
}

export type DocumentsQuery = PageQuery;
