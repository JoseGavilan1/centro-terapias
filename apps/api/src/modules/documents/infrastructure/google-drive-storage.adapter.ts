import jwt from 'jsonwebtoken';
import { DOCUMENT_CATEGORY_LABELS, DocumentCategory } from '@centro/shared';
import {
  DocumentStoragePort,
  EnsurePatientFolderParams,
  UploadFileParams,
} from '../domain/document-storage.port';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

/**
 * Adaptador real de `DocumentStoragePort` contra la API REST de Google Drive v3 (ADR-11).
 * Usa `fetch` nativo + `jsonwebtoken` (ya presente como dependencia transitiva de
 * `@nestjs/jwt`) en vez del SDK `googleapis` completo: evita sumar un paquete pesado para
 * un puerto de tres operaciones (autenticación de cuenta de servicio vía JWT Bearer Grant,
 * ver https://developers.google.com/identity/protocols/oauth2/service-account).
 */
export class GoogleDriveStorageAdapter implements DocumentStoragePort {
  private cachedToken: CachedToken | null = null;

  constructor(
    private readonly serviceAccountEmail: string,
    private readonly privateKey: string,
    private readonly rootFolderId: string,
  ) {}

  async ensurePatientFolder({
    patientId,
    patientDisplayName,
  }: EnsurePatientFolderParams): Promise<string> {
    const token = await this.getAccessToken();
    const patientFolderId = await this.getOrCreateFolder(
      `${patientDisplayName} (${patientId})`,
      this.rootFolderId,
      token,
    );
    for (const category of Object.values(DocumentCategory)) {
      await this.getOrCreateFolder(DOCUMENT_CATEGORY_LABELS[category], patientFolderId, token);
    }
    return patientFolderId;
  }

  async uploadFile({
    rootFolderId,
    category,
    fileName,
    mimeType,
    content,
  }: UploadFileParams): Promise<{ fileId: string }> {
    const token = await this.getAccessToken();
    const categoryFolderId = await this.getOrCreateFolder(
      DOCUMENT_CATEGORY_LABELS[category],
      rootFolderId,
      token,
    );

    const boundary = `centro-terapias-${Date.now()}`;
    const metadata = JSON.stringify({ name: fileName, parents: [categoryFolderId] });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
      ),
      Buffer.from(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
      content,
      Buffer.from(`\r\n--${boundary}--`),
    ]);

    const res = await fetch(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Google Drive rechazó la subida del archivo (${res.status})`);
    }
    const data = (await res.json()) as { id: string };
    return { fileId: data.id };
  }

  async downloadFile(fileId: string): Promise<Buffer> {
    const token = await this.getAccessToken();
    const res = await fetch(`${DRIVE_API_BASE}/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Google Drive rechazó la descarga del archivo (${res.status})`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  private async findFolder(name: string, parentId: string, token: string): Promise<string | null> {
    const escapedName = name.replace(/'/g, "\\'");
    const query = `name='${escapedName}' and '${parentId}' in parents and mimeType='${DRIVE_FOLDER_MIME_TYPE}' and trashed=false`;
    const res = await fetch(
      `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=files(id)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!res.ok) {
      throw new Error(`Google Drive rechazó la búsqueda de carpeta (${res.status})`);
    }
    const data = (await res.json()) as { files: Array<{ id: string }> };
    return data.files[0]?.id ?? null;
  }

  private async createFolder(name: string, parentId: string, token: string): Promise<string> {
    const res = await fetch(`${DRIVE_API_BASE}/files?fields=id`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: DRIVE_FOLDER_MIME_TYPE, parents: [parentId] }),
    });
    if (!res.ok) {
      throw new Error(`Google Drive rechazó la creación de carpeta (${res.status})`);
    }
    const data = (await res.json()) as { id: string };
    return data.id;
  }

  private async getOrCreateFolder(name: string, parentId: string, token: string): Promise<string> {
    const existing = await this.findFolder(name, parentId, token);
    return existing ?? this.createFolder(name, parentId, token);
  }

  /** JWT Bearer Grant de cuenta de servicio; el token se cachea en memoria hasta 60s antes de expirar. */
  private async getAccessToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.accessToken;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      {
        iss: this.serviceAccountEmail,
        scope: 'https://www.googleapis.com/auth/drive',
        aud: 'https://oauth2.googleapis.com/token',
        iat: nowSeconds,
        exp: nowSeconds + 3600,
      },
      this.privateKey,
      { algorithm: 'RS256' },
    );

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }),
    });
    if (!res.ok) {
      throw new Error(
        'No se pudo autenticar con Google Drive (cuenta de servicio inválida o sin permisos)',
      );
    }
    const data = (await res.json()) as { access_token: string; expires_in: number };
    this.cachedToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
    };
    return data.access_token;
  }
}
