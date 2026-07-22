import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID } from 'class-validator';
import { CreateDocumentMetadata, DocumentCategory } from '@centro/shared';

export class CreateDocumentDto implements CreateDocumentMetadata {
  @ApiProperty({ enum: DocumentCategory })
  @IsEnum(DocumentCategory)
  category!: DocumentCategory;

  @ApiPropertyOptional({
    description: 'Evolución del mismo paciente a la que adjuntar el documento',
  })
  @IsOptional()
  @IsUUID()
  evolutionId?: string;
}
