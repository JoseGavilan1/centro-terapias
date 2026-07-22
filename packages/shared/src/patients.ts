import type { PageQuery } from './pagination';

export interface PatientDto {
  id: string;
  firstName: string;
  lastName: string;
  rut: string;
  birthDate: string;
  diagnosis: string | null;
  phone: string;
  email: string | null;
  address: string | null;
  observations: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePatientRequest {
  firstName: string;
  lastName: string;
  rut: string;
  /** Fecha ISO 8601 (solo fecha, sin hora), p. ej. "2018-03-20". */
  birthDate: string;
  diagnosis?: string;
  phone: string;
  email?: string;
  address?: string;
  observations?: string;
}

export interface UpdatePatientRequest {
  firstName?: string;
  lastName?: string;
  rut?: string;
  birthDate?: string;
  diagnosis?: string | null;
  phone?: string;
  email?: string | null;
  address?: string | null;
  observations?: string | null;
  isActive?: boolean;
}

export interface PatientsQuery extends PageQuery {
  /** Busca por nombre, apellido o RUT. */
  search?: string;
  /** 'true' | 'false' — llega como string por query param. */
  isActive?: string;
}
