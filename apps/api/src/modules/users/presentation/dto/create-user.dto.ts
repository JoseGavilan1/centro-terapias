import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import {
  CreateUserRequest,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_POLICY_REGEX,
  Specialty,
  UserRole,
} from '@centro/shared';

export class CreateUserDto implements CreateUserRequest {
  @ApiProperty()
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  firstName!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  lastName!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;

  @ApiPropertyOptional({ enum: Specialty, description: 'Obligatoria si role=PROFESSIONAL' })
  @ValidateIf((dto: CreateUserDto) => dto.role === UserRole.PROFESSIONAL)
  @IsEnum(Specialty)
  specialty?: Specialty;

  @ApiPropertyOptional()
  @Transform(({ value }: { value: string | undefined }) => (value === '' ? undefined : value))
  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @ApiProperty({ description: 'Mínimo 8 caracteres, 1 mayúscula, 1 minúscula y 1 dígito' })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  @Matches(PASSWORD_POLICY_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  temporaryPassword!: string;
}
