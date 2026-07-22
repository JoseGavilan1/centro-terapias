import { DocumentCategory } from '@centro/shared';

export interface EnsurePatientFolderParams {
  organizationId: string;
  patientId: string;
  patientDisplayName: string;
}

export interface UploadFileParams {
  rootFolderId: string;
  category: DocumentCategory;
  fileName: string;
  mimeType: string;
  content: Buffer;
}

/**
 * Puerto de almacenamiento de documentos (ADR-11). El binario nunca pasa por la base de
 * datos: solo se persiste el id opaco que devuelve `uploadFile` (`Document.driveFileId`).
 * Dos adaptadores en `infrastructure`: `GoogleDriveStorageAdapter` (real, producción) y
 * `LocalDiskStorageAdapter` (doble de desarrollo/test, mismo contrato).
 */
export interface DocumentStoragePort {
  /** Idempotente: crea la carpeta raíz del paciente y sus subcarpetas por categoría si no existen. */
  ensurePatientFolder(params: EnsurePatientFolderParams): Promise<string>;
  uploadFile(params: UploadFileParams): Promise<{ fileId: string }>;
  /** `fileId` es el id opaco devuelto por `uploadFile`; el `mimeType` se conoce por la base de datos, no aquí. */
  downloadFile(fileId: string): Promise<Buffer>;
}

export const DOCUMENT_STORAGE_PORT = Symbol('DOCUMENT_STORAGE_PORT');
