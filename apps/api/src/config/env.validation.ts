import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

/**
 * Validación fail-fast del entorno: si falta o es inválida una variable,
 * la aplicación no arranca (evita fallos silenciosos en producción).
 */
class EnvironmentVariables {
  @IsOptional()
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres' })
  JWT_ACCESS_SECRET!: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(60)
  JWT_ACCESS_TTL?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  REFRESH_TOKEN_TTL_DAYS?: number;

  @IsOptional()
  @Transform(({ value }) => String(value) === 'true')
  @IsBoolean()
  COOKIE_SECURE?: boolean;

  @IsOptional()
  @IsString()
  ALLOWED_ORIGINS?: string;

  @IsOptional()
  @IsIn(['local-disk', 'google-drive'])
  DOCUMENT_STORAGE_DRIVER?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(String(value), 10))
  @IsInt()
  @Min(1)
  DOCUMENTS_MAX_UPLOAD_BYTES?: number;

  @IsOptional()
  @IsString()
  DOCUMENT_STORAGE_LOCAL_DIR?: string;

  // Obligatorias únicamente si DOCUMENT_STORAGE_DRIVER=google-drive (ADR "secretos fail-fast");
  // con el driver local-disk (default de desarrollo) no se evalúan.
  @ValidateIf((env: EnvironmentVariables) => env.DOCUMENT_STORAGE_DRIVER === 'google-drive')
  @IsString()
  @MinLength(1, {
    message:
      'GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL es obligatoria con DOCUMENT_STORAGE_DRIVER=google-drive',
  })
  GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL?: string;

  @ValidateIf((env: EnvironmentVariables) => env.DOCUMENT_STORAGE_DRIVER === 'google-drive')
  @IsString()
  @MinLength(1, {
    message: 'GOOGLE_DRIVE_PRIVATE_KEY es obligatoria con DOCUMENT_STORAGE_DRIVER=google-drive',
  })
  GOOGLE_DRIVE_PRIVATE_KEY?: string;

  @ValidateIf((env: EnvironmentVariables) => env.DOCUMENT_STORAGE_DRIVER === 'google-drive')
  @IsString()
  @MinLength(1, {
    message: 'GOOGLE_DRIVE_ROOT_FOLDER_ID es obligatoria con DOCUMENT_STORAGE_DRIVER=google-drive',
  })
  GOOGLE_DRIVE_ROOT_FOLDER_ID?: string;

  @IsOptional()
  @IsIn(['console', 'whatsapp-cloud-api'])
  MESSAGING_DRIVER?: string;

  // Obligatorias únicamente si MESSAGING_DRIVER=whatsapp-cloud-api (ADR "secretos fail-fast");
  // con el driver console (default de desarrollo) no se evalúan.
  @ValidateIf((env: EnvironmentVariables) => env.MESSAGING_DRIVER === 'whatsapp-cloud-api')
  @IsString()
  @MinLength(1, {
    message: 'WHATSAPP_ACCESS_TOKEN es obligatoria con MESSAGING_DRIVER=whatsapp-cloud-api',
  })
  WHATSAPP_ACCESS_TOKEN?: string;

  @ValidateIf((env: EnvironmentVariables) => env.MESSAGING_DRIVER === 'whatsapp-cloud-api')
  @IsString()
  @MinLength(1, {
    message: 'WHATSAPP_APP_SECRET es obligatoria con MESSAGING_DRIVER=whatsapp-cloud-api',
  })
  WHATSAPP_APP_SECRET?: string;

  @ValidateIf((env: EnvironmentVariables) => env.MESSAGING_DRIVER === 'whatsapp-cloud-api')
  @IsString()
  @MinLength(1, {
    message: 'WHATSAPP_VERIFY_TOKEN es obligatoria con MESSAGING_DRIVER=whatsapp-cloud-api',
  })
  WHATSAPP_VERIFY_TOKEN?: string;

  @IsOptional()
  @IsString()
  CRON_SECRET?: string;
}

export function validateEnv(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: false,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors.map((e) => Object.values(e.constraints ?? {}).join('; ')).join('\n  - ');
    throw new Error(`Configuración de entorno inválida:\n  - ${detail}`);
  }
  return validated;
}
