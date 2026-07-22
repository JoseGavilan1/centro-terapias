import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  AuditAction,
  ClinicalConfidentiality,
  DEFAULT_PAGE_SIZE,
  DocumentCategory,
  DocumentDto,
  DocumentsQuery,
  Paginated,
  paginate,
  Specialty,
  UserRole,
} from '@centro/shared';
import { AgendaAccessService } from '../../agenda/application/agenda-access.service';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { DOCUMENT_STORAGE_PORT, DocumentStoragePort } from '../domain/document-storage.port';
import {
  DOCUMENT_REPOSITORY,
  DocumentRecord,
  DocumentRepository,
} from '../domain/document.repository';

export interface UploadDocumentInput {
  category: DocumentCategory;
  evolutionId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  content: Buffer;
}

interface PatientScope {
  id: string;
  firstName: string;
  lastName: string;
  driveFolderId: string | null;
}

@Injectable()
export class DocumentsService {
  constructor(
    @Inject(DOCUMENT_REPOSITORY) private readonly documentRepository: DocumentRepository,
    @Inject(DOCUMENT_STORAGE_PORT) private readonly storage: DocumentStoragePort,
    private readonly prisma: PrismaService,
    private readonly agendaAccessService: AgendaAccessService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  async findMany(
    organizationId: string,
    actor: AuthenticatedUser,
    patientId: string,
    query: DocumentsQuery,
  ): Promise<Paginated<DocumentDto>> {
    await this.assertPatientInScope(organizationId, actor, patientId);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
    const { data, total } = await this.documentRepository.findMany(organizationId, {
      patientId,
      page,
      pageSize,
    });
    return paginate(
      data.map((document) => this.toDto(document, actor)),
      total,
      { page, pageSize },
    );
  }

  async upload(
    organizationId: string,
    actor: AuthenticatedUser,
    patientId: string,
    input: UploadDocumentInput,
    context: RequestContext,
  ): Promise<DocumentDto> {
    const patient = await this.assertPatientInScope(organizationId, actor, patientId);
    this.assertValidFile(input.mimeType, input.sizeBytes);

    if (input.evolutionId) {
      await this.assertEvolutionBelongsToPatient(organizationId, patientId, input.evolutionId);
    }

    const rootFolderId =
      patient.driveFolderId ?? (await this.provisionPatientFolder(organizationId, patient));

    const { fileId } = await this.storage.uploadFile({
      rootFolderId,
      category: input.category,
      fileName: input.fileName,
      mimeType: input.mimeType,
      content: input.content,
    });

    // Nunca se acepta del cliente: se deriva de la especialidad del autor, igual que
    // Evolution.confidentiality (ADR-04; ver modulo-04-fichas-clinicas.md §1 y
    // modulo-05-documentos.md §1).
    const confidentiality =
      actor.specialty === Specialty.PSICOLOGIA
        ? ClinicalConfidentiality.PSYCHOLOGICAL
        : ClinicalConfidentiality.STANDARD;

    const created = await this.documentRepository.create({
      organizationId,
      patientId,
      evolutionId: input.evolutionId ?? null,
      uploadedById: actor.userId,
      category: input.category,
      name: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      driveFileId: fileId,
      confidentiality,
    });

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.CREATE,
      entity: 'Document',
      entityId: created.id,
      newValue: this.toAuditSnapshot(created),
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(created, actor);
  }

  async download(
    organizationId: string,
    actor: AuthenticatedUser,
    patientId: string,
    id: string,
  ): Promise<{ content: Buffer; mimeType: string; name: string }> {
    await this.assertPatientInScope(organizationId, actor, patientId);

    const document = await this.documentRepository.findById(organizationId, id);
    if (!document || document.patientId !== patientId) {
      throw new NotFoundException('Documento no encontrado');
    }
    // A diferencia de una evolución (campos de texto que se pueden redactar), un binario no
    // tiene "versión parcial": sin acceso a contenido psicológico, la descarga se niega por
    // completo (§1 de modulo-05-documentos.md).
    if (
      document.confidentiality === ClinicalConfidentiality.PSYCHOLOGICAL &&
      !this.canReadPsychological(actor)
    ) {
      throw new ForbiddenException('No tiene acceso a contenido psicológico');
    }

    const content = await this.storage.downloadFile(document.driveFileId);
    return { content, mimeType: document.mimeType, name: document.name };
  }

  private async provisionPatientFolder(
    organizationId: string,
    patient: PatientScope,
  ): Promise<string> {
    const rootFolderId = await this.storage.ensurePatientFolder({
      organizationId,
      patientId: patient.id,
      patientDisplayName: `${patient.firstName} ${patient.lastName}`,
    });
    await this.prisma.patient.update({
      where: { id: patient.id },
      data: { driveFolderId: rootFolderId },
    });
    return rootFolderId;
  }

  private assertValidFile(mimeType: string, sizeBytes: number): void {
    if (!(ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)) {
      throw new BadRequestException(`Tipo de archivo no permitido: ${mimeType}`);
    }
    const maxBytes = this.configService.getOrThrow<number>('documents.maxUploadBytes');
    if (sizeBytes > maxBytes) {
      throw new BadRequestException(
        `El archivo excede el tamaño máximo permitido (${maxBytes} bytes)`,
      );
    }
  }

  private async assertEvolutionBelongsToPatient(
    organizationId: string,
    patientId: string,
    evolutionId: string,
  ): Promise<void> {
    const evolution = await this.prisma.evolution.findFirst({
      where: { id: evolutionId, organizationId, patientId },
      select: { id: true },
    });
    if (!evolution) {
      throw new BadRequestException('La evolución indicada no existe para este paciente');
    }
  }

  /** ADMIN siempre; PROFESSIONAL solo si tiene un TherapySlot activo con el paciente (Módulo 3 §1.2). */
  private async assertPatientInScope(
    organizationId: string,
    actor: AuthenticatedUser,
    patientId: string,
  ): Promise<PatientScope> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId },
      select: { id: true, firstName: true, lastName: true, driveFolderId: true },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
    if (actor.role === UserRole.PROFESSIONAL) {
      const assignedIds = await this.agendaAccessService.getAssignedPatientIds(
        organizationId,
        actor.userId,
      );
      if (!assignedIds.includes(patientId)) {
        throw new NotFoundException('Paciente no encontrado');
      }
    }
    return patient;
  }

  private canReadPsychological(actor: AuthenticatedUser): boolean {
    return actor.specialty === Specialty.PSICOLOGIA;
  }

  /** Omite `name` (puede ser sensible por sí mismo, p. ej. "informe_diagnostico.pdf") cuando el documento es PSYCHOLOGICAL. */
  private toAuditSnapshot(document: DocumentRecord): Record<string, unknown> {
    if (document.confidentiality === ClinicalConfidentiality.PSYCHOLOGICAL) {
      const { name, ...rest } = document;
      void name;
      return rest;
    }
    return { ...document };
  }

  private toDto(document: DocumentRecord, actor: AuthenticatedUser): DocumentDto {
    const isPsychological = document.confidentiality === ClinicalConfidentiality.PSYCHOLOGICAL;
    const redacted = isPsychological && !this.canReadPsychological(actor);
    return {
      id: document.id,
      patientId: document.patientId,
      evolutionId: document.evolutionId,
      uploadedById: document.uploadedById,
      category: document.category,
      name: redacted ? null : document.name,
      mimeType: redacted ? null : document.mimeType,
      sizeBytes: redacted ? null : document.sizeBytes,
      confidentiality: document.confidentiality,
      redacted,
      createdAt: document.createdAt.toISOString(),
    };
  }
}
