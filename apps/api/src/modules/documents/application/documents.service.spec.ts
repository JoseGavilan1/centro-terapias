import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ClinicalConfidentiality, DocumentCategory, Specialty, UserRole } from '@centro/shared';
import { AgendaAccessService } from '../../agenda/application/agenda-access.service';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  DocumentStoragePort,
  EnsurePatientFolderParams,
  UploadFileParams,
} from '../domain/document-storage.port';
import {
  CreateDocumentData,
  DocumentFilters,
  DocumentRecord,
  DocumentRepository,
} from '../domain/document.repository';
import { DocumentsService, UploadDocumentInput } from './documents.service';

const ORG_ID = 'org-1';
const OTHER_ORG_ID = 'org-2';
const PATIENT_ID = 'patient-1';

function makeDocument(overrides: Partial<DocumentRecord> = {}): DocumentRecord {
  return {
    id: 'doc-1',
    organizationId: ORG_ID,
    patientId: PATIENT_ID,
    evolutionId: null,
    uploadedById: 'prof-1',
    category: DocumentCategory.INFORME,
    name: 'informe.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    driveFileId: 'file-1',
    confidentiality: ClinicalConfidentiality.STANDARD,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  };
}

class FakeDocumentRepository implements DocumentRepository {
  documents: DocumentRecord[] = [];
  private seq = 0;

  findById(organizationId: string, id: string): Promise<DocumentRecord | null> {
    return Promise.resolve(
      this.documents.find((d) => d.id === id && d.organizationId === organizationId) ?? null,
    );
  }

  findMany(
    organizationId: string,
    filters: DocumentFilters,
  ): Promise<{ data: DocumentRecord[]; total: number }> {
    const data = this.documents.filter(
      (d) => d.organizationId === organizationId && d.patientId === filters.patientId,
    );
    return Promise.resolve({ data, total: data.length });
  }

  create(data: CreateDocumentData): Promise<DocumentRecord> {
    this.seq += 1;
    const document = makeDocument({ ...data, id: `doc-${this.seq}` });
    this.documents.push(document);
    return Promise.resolve(document);
  }
}

class FakeDocumentStoragePort implements DocumentStoragePort {
  ensureCalls = 0;
  uploadCalls: UploadFileParams[] = [];
  downloadCalls: string[] = [];

  ensurePatientFolder(params: EnsurePatientFolderParams): Promise<string> {
    this.ensureCalls += 1;
    return Promise.resolve(`root-${params.patientId}`);
  }

  uploadFile(params: UploadFileParams): Promise<{ fileId: string }> {
    this.uploadCalls.push(params);
    return Promise.resolve({ fileId: `file-${this.uploadCalls.length}` });
  }

  downloadFile(fileId: string): Promise<Buffer> {
    this.downloadCalls.push(fileId);
    return Promise.resolve(Buffer.from(`content-of-${fileId}`));
  }
}

interface FakePatient {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  driveFolderId: string | null;
}

class FakePrismaService {
  patients: FakePatient[] = [];
  evolutions: Array<{ id: string; organizationId: string; patientId: string }> = [];

  patient = {
    findFirst: ({ where }: { where: { id: string; organizationId: string } }) => {
      const found = this.patients.find(
        (p) => p.id === where.id && p.organizationId === where.organizationId,
      );
      return Promise.resolve(found ?? null);
    },
    update: ({ where, data }: { where: { id: string }; data: Partial<FakePatient> }) => {
      const patient = this.patients.find((p) => p.id === where.id);
      if (patient) Object.assign(patient, data);
      return Promise.resolve(patient);
    },
  };

  evolution = {
    findFirst: ({
      where,
    }: {
      where: { id: string; organizationId: string; patientId: string };
    }) => {
      const found = this.evolutions.find(
        (e) =>
          e.id === where.id &&
          e.organizationId === where.organizationId &&
          e.patientId === where.patientId,
      );
      return Promise.resolve(found ? { id: found.id } : null);
    },
  };
}

class FakeAgendaAccessService {
  assignedPatientIds: string[] = [];
  getAssignedPatientIds(): Promise<string[]> {
    return Promise.resolve(this.assignedPatientIds);
  }
}

class FakeAuditService {
  entries: Array<{ newValue?: unknown }> = [];
  log(entry: { newValue?: unknown }): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

class FakeConfigService {
  getOrThrow(key: string): number {
    if (key === 'documents.maxUploadBytes') return 15 * 1024 * 1024;
    throw new Error(`clave de configuración inesperada en el test: ${key}`);
  }
}

describe('DocumentsService', () => {
  let repo: FakeDocumentRepository;
  let storage: FakeDocumentStoragePort;
  let prisma: FakePrismaService;
  let agendaAccess: FakeAgendaAccessService;
  let audit: FakeAuditService;
  let service: DocumentsService;
  let admin: AuthenticatedUser;
  let professional: AuthenticatedUser;
  let psychologist: AuthenticatedUser;
  const context = { ip: '127.0.0.1', userAgent: 'jest' };

  const validInput: UploadDocumentInput = {
    category: DocumentCategory.INFORME,
    fileName: 'informe.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 1024,
    content: Buffer.from('contenido'),
  };

  beforeEach(() => {
    repo = new FakeDocumentRepository();
    storage = new FakeDocumentStoragePort();
    prisma = new FakePrismaService();
    agendaAccess = new FakeAgendaAccessService();
    audit = new FakeAuditService();
    service = new DocumentsService(
      repo,
      storage,
      prisma as unknown as PrismaService,
      agendaAccess as unknown as AgendaAccessService,
      audit as unknown as AuditService,
      new FakeConfigService() as unknown as import('@nestjs/config').ConfigService,
    );

    prisma.patients = [
      {
        id: PATIENT_ID,
        organizationId: ORG_ID,
        firstName: 'Sofía',
        lastName: 'Gómez',
        driveFolderId: null,
      },
    ];
    agendaAccess.assignedPatientIds = [PATIENT_ID];

    admin = {
      userId: 'admin-1',
      organizationId: ORG_ID,
      email: 'admin@demo.cl',
      role: UserRole.ADMIN,
      specialty: null,
    };
    professional = {
      userId: 'prof-1',
      organizationId: ORG_ID,
      email: 'prof@demo.cl',
      role: UserRole.PROFESSIONAL,
      specialty: Specialty.KINESIOLOGIA,
    };
    psychologist = {
      userId: 'psych-1',
      organizationId: ORG_ID,
      email: 'psych@demo.cl',
      role: UserRole.PROFESSIONAL,
      specialty: Specialty.PSICOLOGIA,
    };
  });

  describe('upload', () => {
    it('sube un documento STANDARD para un profesional no-psicólogo', async () => {
      const dto = await service.upload(ORG_ID, professional, PATIENT_ID, validInput, context);
      expect(dto.confidentiality).toBe(ClinicalConfidentiality.STANDARD);
      expect(dto.redacted).toBe(false);
      expect(dto.name).toBe('informe.pdf');
      expect(audit.entries).toHaveLength(1);
    });

    it('sube un documento PSYCHOLOGICAL para un psicólogo', async () => {
      const dto = await service.upload(ORG_ID, psychologist, PATIENT_ID, validInput, context);
      expect(dto.confidentiality).toBe(ClinicalConfidentiality.PSYCHOLOGICAL);
      expect(dto.redacted).toBe(false);
    });

    it('la primera subida de un paciente provisiona la carpeta y persiste driveFolderId', async () => {
      await service.upload(ORG_ID, professional, PATIENT_ID, validInput, context);
      expect(storage.ensureCalls).toBe(1);
      expect(prisma.patients[0].driveFolderId).toBe(`root-${PATIENT_ID}`);
    });

    it('la segunda subida del mismo paciente no vuelve a provisionar la carpeta', async () => {
      await service.upload(ORG_ID, professional, PATIENT_ID, validInput, context);
      await service.upload(ORG_ID, professional, PATIENT_ID, validInput, context);
      expect(storage.ensureCalls).toBe(1);
    });

    it('rechaza con 404 a un profesional fuera del alcance de agenda del paciente', async () => {
      agendaAccess.assignedPatientIds = [];
      await expect(
        service.upload(ORG_ID, professional, PATIENT_ID, validInput, context),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('ADMIN no tiene restricción de alcance por agenda', async () => {
      agendaAccess.assignedPatientIds = [];
      const dto = await service.upload(ORG_ID, admin, PATIENT_ID, validInput, context);
      expect(dto.id).toBeDefined();
    });

    it('rechaza un mimeType no permitido', async () => {
      await expect(
        service.upload(
          ORG_ID,
          professional,
          PATIENT_ID,
          { ...validInput, mimeType: 'application/zip' },
          context,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rechaza un archivo que excede el tamaño máximo', async () => {
      await expect(
        service.upload(
          ORG_ID,
          professional,
          PATIENT_ID,
          { ...validInput, sizeBytes: 16 * 1024 * 1024 },
          context,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('permite vincular un evolutionId del mismo paciente', async () => {
      prisma.evolutions.push({ id: 'evo-1', organizationId: ORG_ID, patientId: PATIENT_ID });
      const dto = await service.upload(
        ORG_ID,
        professional,
        PATIENT_ID,
        { ...validInput, evolutionId: 'evo-1' },
        context,
      );
      expect(dto.evolutionId).toBe('evo-1');
    });

    it('rechaza un evolutionId de otro paciente', async () => {
      prisma.evolutions.push({ id: 'evo-1', organizationId: ORG_ID, patientId: 'other-patient' });
      await expect(
        service.upload(
          ORG_ID,
          professional,
          PATIENT_ID,
          { ...validInput, evolutionId: 'evo-1' },
          context,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('omite el nombre del archivo en la auditoría de un documento PSYCHOLOGICAL', async () => {
      await service.upload(ORG_ID, psychologist, PATIENT_ID, validInput, context);
      const newValue = audit.entries[0].newValue as Record<string, unknown>;
      expect(newValue.name).toBeUndefined();
    });

    it('incluye el nombre del archivo en la auditoría de un documento STANDARD', async () => {
      await service.upload(ORG_ID, professional, PATIENT_ID, validInput, context);
      const newValue = audit.entries[0].newValue as Record<string, unknown>;
      expect(newValue.name).toBe('informe.pdf');
    });
  });

  describe('findMany — redacción por confidencialidad', () => {
    beforeEach(() => {
      repo.documents.push(
        makeDocument({ id: 'doc-std', confidentiality: ClinicalConfidentiality.STANDARD }),
        makeDocument({
          id: 'doc-psy',
          confidentiality: ClinicalConfidentiality.PSYCHOLOGICAL,
          uploadedById: psychologist.userId,
        }),
      );
    });

    it('ADMIN ve el STANDARD completo y el PSYCHOLOGICAL redactado', async () => {
      const result = await service.findMany(ORG_ID, admin, PATIENT_ID, {});
      const std = result.data.find((d) => d.id === 'doc-std')!;
      const psy = result.data.find((d) => d.id === 'doc-psy')!;
      expect(std.redacted).toBe(false);
      expect(std.name).not.toBeNull();
      expect(psy.redacted).toBe(true);
      expect(psy.name).toBeNull();
      expect(psy.mimeType).toBeNull();
      expect(psy.sizeBytes).toBeNull();
    });

    it('un profesional psicólogo ve el PSYCHOLOGICAL completo', async () => {
      const result = await service.findMany(ORG_ID, psychologist, PATIENT_ID, {});
      const psy = result.data.find((d) => d.id === 'doc-psy')!;
      expect(psy.redacted).toBe(false);
      expect(psy.name).toBe('informe.pdf');
    });

    it('un profesional fuera del alcance del paciente recibe 404', async () => {
      agendaAccess.assignedPatientIds = [];
      await expect(service.findMany(ORG_ID, professional, PATIENT_ID, {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('download', () => {
    it('descarga un documento STANDARD dentro del alcance', async () => {
      repo.documents.push(makeDocument({ id: 'doc-std' }));
      const result = await service.download(ORG_ID, admin, PATIENT_ID, 'doc-std');
      expect(result.mimeType).toBe('application/pdf');
      expect(storage.downloadCalls).toEqual(['file-1']);
    });

    it('rechaza con 403 la descarga de un PSYCHOLOGICAL sin acceso, sin llamar al storage', async () => {
      repo.documents.push(
        makeDocument({ id: 'doc-psy', confidentiality: ClinicalConfidentiality.PSYCHOLOGICAL }),
      );
      await expect(service.download(ORG_ID, admin, PATIENT_ID, 'doc-psy')).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(storage.downloadCalls).toHaveLength(0);
    });

    it('permite la descarga de un PSYCHOLOGICAL a un psicólogo', async () => {
      repo.documents.push(
        makeDocument({ id: 'doc-psy', confidentiality: ClinicalConfidentiality.PSYCHOLOGICAL }),
      );
      const result = await service.download(ORG_ID, psychologist, PATIENT_ID, 'doc-psy');
      expect(result.mimeType).toBe('application/pdf');
    });

    it('un documento de otra organización se comporta como inexistente', async () => {
      repo.documents.push(makeDocument({ id: 'doc-otra-org', organizationId: OTHER_ORG_ID }));
      await expect(
        service.download(ORG_ID, admin, PATIENT_ID, 'doc-otra-org'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
