import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { DocumentDto, Paginated, UserRole } from '@centro/shared';
import { UploadedMulterFile } from '../domain/uploaded-file';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ReqContext } from '../../../common/decorators/request-context.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { DocumentsService } from '../application/documents.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { QueryDocumentsDto } from './dto/query-documents.dto';

@ApiTags('documents')
@ApiBearerAuth()
@Controller('patients/:patientId/documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar documentos de un paciente (ADMIN: todos; PROFESSIONAL: asignados)',
  })
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Query() query: QueryDocumentsDto,
  ): Promise<Paginated<DocumentDto>> {
    return this.documentsService.findMany(user.organizationId, user, patientId, query);
  }

  @Get(':id/download')
  @ApiOperation({
    summary: 'Descargar el binario de un documento (proxeado, nunca una URL directa del proveedor)',
  })
  async download(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { content, mimeType, name } = await this.documentsService.download(
      user.organizationId,
      user,
      patientId,
      id,
    );
    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"`,
    });
    return new StreamableFile(content);
  }

  @Post()
  @Roles(UserRole.PROFESSIONAL)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        category: { type: 'string' },
        evolutionId: { type: 'string' },
      },
    },
  })
  @ApiOperation({ summary: 'Subir un documento clínico/administrativo (append-only)' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('patientId') patientId: string,
    @UploadedFile() file: UploadedMulterFile | undefined,
    @Body() dto: CreateDocumentDto,
    @ReqContext() context: RequestContext,
  ): Promise<DocumentDto> {
    if (!file) {
      throw new BadRequestException('Debe adjuntar un archivo en el campo "file"');
    }
    return this.documentsService.upload(
      user.organizationId,
      user,
      patientId,
      {
        category: dto.category,
        evolutionId: dto.evolutionId,
        fileName: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        content: file.buffer,
      },
      context,
    );
  }
}
