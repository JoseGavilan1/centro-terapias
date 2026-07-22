export interface PatientRecord {
  id: string;
  organizationId: string;
  firstName: string;
  lastName: string;
  rut: string;
  birthDate: Date;
  diagnosis: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  observations: string | null;
  isActive: boolean;
  driveFolderId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreatePatientData {
  organizationId: string;
  firstName: string;
  lastName: string;
  rut: string;
  birthDate: Date;
  diagnosis: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  observations: string | null;
}

export interface UpdatePatientData {
  firstName?: string;
  lastName?: string;
  rut?: string;
  birthDate?: Date;
  diagnosis?: string | null;
  phone?: string;
  email?: string | null;
  address?: string | null;
  observations?: string | null;
  isActive?: boolean;
}

export interface PatientFilters {
  search?: string;
  isActive?: boolean;
  /** Restringe el listado a este conjunto de ids (PROFESSIONAL, ver AgendaAccessService). Sin filtro si es `undefined`. */
  patientIds?: string[];
  page: number;
  pageSize: number;
}

/**
 * Todo método recibe `organizationId` explícito (ADR-03): un `id` de otra
 * organización se comporta como inexistente, nunca como un 403 filtrado a
 * posteriori. `rut` se busca ya normalizado (packages/shared/src/rut.ts).
 */
export interface PatientRepository {
  findById(organizationId: string, id: string): Promise<PatientRecord | null>;
  /** Incluye pacientes activos e inactivos: la unicidad de RUT aplica a ambos. */
  findByRut(organizationId: string, rut: string, excludeId?: string): Promise<PatientRecord | null>;
  findMany(
    organizationId: string,
    filters: PatientFilters,
  ): Promise<{ data: PatientRecord[]; total: number }>;
  create(data: CreatePatientData): Promise<PatientRecord>;
  update(organizationId: string, id: string, data: UpdatePatientData): Promise<PatientRecord>;
}

export const PATIENT_REPOSITORY = Symbol('PATIENT_REPOSITORY');
