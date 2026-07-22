import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  ChangePasswordRequest,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_POLICY_REGEX,
} from '@centro/shared';

export class ChangePasswordDto implements ChangePasswordRequest {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @ApiProperty({ description: 'Mínimo 8 caracteres, 1 mayúscula, 1 minúscula y 1 dígito' })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  newPassword!: string;

  /**
   * La sesión actual a preservar normalmente se identifica por la cookie
   * ct_refresh; este campo es un fallback para clientes no-navegador
   * (Bearer), igual que RefreshDto.refreshToken. Sin él, esta llamada
   * revocaría también la sesión que la hizo.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;
}
