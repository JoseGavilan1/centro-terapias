import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_POLICY_REGEX,
  ResetPasswordRequest,
} from '@centro/shared';

export class ResetPasswordDto implements ResetPasswordRequest {
  @ApiProperty({ description: 'Mínimo 8 caracteres, 1 mayúscula, 1 minúscula y 1 dígito' })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  temporaryPassword!: string;
}
