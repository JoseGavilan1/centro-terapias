import { randomUUID } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import * as path from 'path';
import { DOCUMENT_CATEGORY_LABELS, DocumentCategory } from '@centro/shared';
import {
  DocumentStoragePort,
  EnsurePatientFolderParams,
  UploadFileParams,
} from '../domain/document-storage.port';

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[/\\]/g, '_');
}

/**
 * Doble de desarrollo/test de `DocumentStoragePort` (ADR-11: "permite dobles de prueba y
 * desarrollo sin credenciales reales"). Mismo contrato exacto que `GoogleDriveStorageAdapter`:
 * el "id" de carpeta/archivo es simplemente su ruta absoluta en disco.
 */
export class LocalDiskStorageAdapter implements DocumentStoragePort {
  constructor(private readonly rootDir: string) {}

  async ensurePatientFolder({
    organizationId,
    patientId,
  }: EnsurePatientFolderParams): Promise<string> {
    const patientDir = path.join(this.rootDir, organizationId, patientId);
    await mkdir(patientDir, { recursive: true });
    await Promise.all(
      Object.values(DocumentCategory).map((category) =>
        mkdir(path.join(patientDir, DOCUMENT_CATEGORY_LABELS[category]), { recursive: true }),
      ),
    );
    return patientDir;
  }

  async uploadFile({
    rootFolderId,
    category,
    fileName,
    content,
  }: UploadFileParams): Promise<{ fileId: string }> {
    const categoryDir = path.join(rootFolderId, DOCUMENT_CATEGORY_LABELS[category]);
    await mkdir(categoryDir, { recursive: true });
    const filePath = path.join(categoryDir, `${randomUUID()}__${sanitizeFileName(fileName)}`);
    await writeFile(filePath, content);
    return { fileId: filePath };
  }

  downloadFile(fileId: string): Promise<Buffer> {
    return readFile(fileId);
  }
}
