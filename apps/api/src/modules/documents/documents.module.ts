import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgendaModule } from '../agenda/agenda.module';
import { AuditModule } from '../audit/audit.module';
import { DocumentsService } from './application/documents.service';
import { DOCUMENT_STORAGE_PORT, DocumentStoragePort } from './domain/document-storage.port';
import { DOCUMENT_REPOSITORY } from './domain/document.repository';
import { GoogleDriveStorageAdapter } from './infrastructure/google-drive-storage.adapter';
import { LocalDiskStorageAdapter } from './infrastructure/local-disk-storage.adapter';
import { PrismaDocumentRepository } from './infrastructure/prisma-document.repository';
import { DocumentsController } from './presentation/documents.controller';

/**
 * No importa `PatientsModule` ni `EvolutionsModule` (mismo criterio anti-ciclo que
 * `AgendaModule`/`EvolutionsModule`): valida paciente y evolución vía Prisma directamente en
 * `DocumentsService` — ver modulo-05-documentos.md §1.
 */
@Module({
  imports: [AuditModule, AgendaModule],
  controllers: [DocumentsController],
  providers: [
    DocumentsService,
    { provide: DOCUMENT_REPOSITORY, useClass: PrismaDocumentRepository },
    {
      provide: DOCUMENT_STORAGE_PORT,
      useFactory: (configService: ConfigService): DocumentStoragePort => {
        const driver = configService.getOrThrow<string>('documents.storageDriver');
        if (driver === 'google-drive') {
          return new GoogleDriveStorageAdapter(
            configService.getOrThrow<string>('documents.googleDrive.serviceAccountEmail'),
            configService.getOrThrow<string>('documents.googleDrive.privateKey'),
            configService.getOrThrow<string>('documents.googleDrive.rootFolderId'),
          );
        }
        return new LocalDiskStorageAdapter(
          configService.getOrThrow<string>('documents.localDiskRoot'),
        );
      },
      inject: [ConfigService],
    },
  ],
})
export class DocumentsModule {}
