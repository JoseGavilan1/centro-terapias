export type DocumentStorageDriver = 'local-disk' | 'google-drive';
export type MessagingDriver = 'console' | 'whatsapp-cloud-api';

export interface AppConfig {
  port: number;
  allowedOrigins: string[];
  auth: {
    accessSecret: string;
    /** Segundos de vida del access token. */
    accessTtl: number;
    /** Días de vida del refresh token. */
    refreshTtlDays: number;
    cookieSecure: boolean;
  };
  documents: {
    storageDriver: DocumentStorageDriver;
    maxUploadBytes: number;
    /** Solo usado por LocalDiskStorageAdapter (driver=local-disk). */
    localDiskRoot: string;
    /** Solo requeridos/usados por GoogleDriveStorageAdapter (driver=google-drive). */
    googleDrive: {
      serviceAccountEmail: string;
      privateKey: string;
      rootFolderId: string;
    };
  };
  whatsapp: {
    messagingDriver: MessagingDriver;
    /** Cuenta de sistema de Meta; un solo token envía por varios `phone_number_id` (uno por organización). */
    accessToken: string;
    /** Verifica `X-Hub-Signature-256`; si está vacío, el webhook no verifica firma (dev/test). */
    appSecret: string;
    /** Responde el handshake `GET /webhooks/whatsapp` de Meta. */
    verifyToken: string;
  };
  /** Secreto compartido para el trigger externo del barrido de recordatorios (Vercel Cron u otro scheduler). Vacío: el endpoint rechaza toda solicitud. */
  cronSecret: string;
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT ?? '3001', 10),
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0),
  auth: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
    accessTtl: parseInt(process.env.JWT_ACCESS_TTL ?? '900', 10),
    refreshTtlDays: parseInt(process.env.REFRESH_TOKEN_TTL_DAYS ?? '7', 10),
    cookieSecure: process.env.COOKIE_SECURE === 'true',
  },
  documents: {
    storageDriver:
      (process.env.DOCUMENT_STORAGE_DRIVER as DocumentStorageDriver | undefined) ?? 'local-disk',
    maxUploadBytes: parseInt(
      process.env.DOCUMENTS_MAX_UPLOAD_BYTES ?? String(15 * 1024 * 1024),
      10,
    ),
    localDiskRoot: process.env.DOCUMENT_STORAGE_LOCAL_DIR ?? 'storage',
    googleDrive: {
      serviceAccountEmail: process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL ?? '',
      // Los saltos de línea de una clave PEM llegan escapados ("\\n") en la mayoría de los
      // entornos de variables de entorno (Docker, Azure App Settings); se restauran aquí.
      privateKey: (process.env.GOOGLE_DRIVE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
      rootFolderId: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID ?? '',
    },
  },
  whatsapp: {
    messagingDriver: (process.env.MESSAGING_DRIVER as MessagingDriver | undefined) ?? 'console',
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
    appSecret: process.env.WHATSAPP_APP_SECRET ?? '',
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? '',
  },
  cronSecret: process.env.CRON_SECRET ?? '',
});
