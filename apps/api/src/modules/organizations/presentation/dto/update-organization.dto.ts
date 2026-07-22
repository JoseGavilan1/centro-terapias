import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  IsTimeZone,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UpdateOrganizationRequest } from '@centro/shared';

export class UpdateOrganizationDto implements UpdateOrganizationRequest {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  legalId?: string | null;

  @ApiPropertyOptional({ description: 'IANA timezone, p. ej. America/Santiago' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  address?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsEmail()
  email?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'phone_number_id de WhatsApp Business (Módulo 6)',
  })
  @Transform(({ value }: { value: string | null | undefined }) => (value === '' ? null : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  whatsappPhoneNumberId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Enlace del Google Form de admisión (Módulo 6)',
  })
  @Transform(({ value }: { value: string | null | undefined }) => (value === '' ? null : value))
  @IsOptional()
  @IsUrl()
  googleFormsUrl?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Token que autentica el webhook de ingreso a la lista de espera (Módulo 7). Se genera en el frontend (crypto.randomUUID()); enviar null para deshabilitar el ingreso automático.',
  })
  @Transform(({ value }: { value: string | null | undefined }) => (value === '' ? null : value))
  @IsOptional()
  @IsString()
  @MaxLength(100)
  waitlistIntakeToken?: string | null;
}
