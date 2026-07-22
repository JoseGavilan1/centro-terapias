import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';
import { DiscardWaitlistEntryRequest } from '@centro/shared';

export class DiscardWaitlistEntryDto implements DiscardWaitlistEntryRequest {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
