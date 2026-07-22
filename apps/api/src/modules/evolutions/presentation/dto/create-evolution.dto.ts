import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CreateEvolutionRequest } from '@centro/shared';
import { IsNotFutureDate } from '../../../../common/decorators/is-not-future-date.decorator';

export class CreateEvolutionDto implements CreateEvolutionRequest {
  @ApiProperty({ description: 'Fecha ISO 8601 (YYYY-MM-DD), no puede ser futura' })
  @IsNotFutureDate()
  date!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  observation!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  workPlan!: string;

  @ApiPropertyOptional({ description: 'Cita ATENDIDA propia sin evolución asociada (Módulo 3)' })
  @IsOptional()
  @IsUUID()
  appointmentId?: string;

  @ApiPropertyOptional({ description: 'Evolución que esta corrige, del mismo paciente' })
  @IsOptional()
  @IsUUID()
  amendsId?: string;
}
