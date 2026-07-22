import { Specialty, WaitlistStatus } from '@centro/shared';

export interface WaitlistEntryRecord {
  id: string;
  organizationId: string;
  childFirstName: string;
  childLastName: string;
  childRut: string | null;
  childBirthDate: Date | null;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string | null;
  requestedSpecialty: Specialty | null;
  reason: string | null;
  sede: string | null;
  status: WaitlistStatus;
  assignedPatientId: string | null;
  assignedTherapySlotId: string | null;
  discardReason: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateWaitlistEntryData {
  organizationId: string;
  childFirstName: string;
  childLastName: string;
  childRut: string | null;
  childBirthDate: Date | null;
  guardianName: string;
  guardianPhone: string;
  guardianEmail: string | null;
  requestedSpecialty: Specialty | null;
  reason: string | null;
}

export interface UpdateWaitlistEntryData {
  childFirstName?: string;
  childLastName?: string;
  childRut?: string | null;
  childBirthDate?: Date | null;
  guardianName?: string;
  guardianPhone?: string;
  guardianEmail?: string | null;
  requestedSpecialty?: Specialty | null;
  reason?: string | null;
  sede?: string | null;
  status?: WaitlistStatus;
  assignedPatientId?: string | null;
  assignedTherapySlotId?: string | null;
  discardReason?: string | null;
  resolvedAt?: Date | null;
}

export interface WaitlistEntryFilters {
  status?: WaitlistStatus;
  requestedSpecialty?: Specialty;
  page: number;
  pageSize: number;
}

/** Todo método recibe `organizationId` explícito (ADR-03), igual criterio que el resto de los repositorios. */
export interface WaitlistEntryRepository {
  findById(organizationId: string, id: string): Promise<WaitlistEntryRecord | null>;
  findMany(
    organizationId: string,
    filters: WaitlistEntryFilters,
  ): Promise<{ data: WaitlistEntryRecord[]; total: number }>;
  create(data: CreateWaitlistEntryData): Promise<WaitlistEntryRecord>;
  update(
    organizationId: string,
    id: string,
    data: UpdateWaitlistEntryData,
  ): Promise<WaitlistEntryRecord>;
  /** Resuelve la organización por su token de intake (§1.4 modulo-07-lista-espera.md). */
  findOrganizationIdByIntakeToken(token: string): Promise<string | null>;
}

export const WAITLIST_ENTRY_REPOSITORY = Symbol('WAITLIST_ENTRY_REPOSITORY');
