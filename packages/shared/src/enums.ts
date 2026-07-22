/**
 * Roles del sistema.
 * El "Psicólogo" del dominio NO es un rol aparte: es un PROFESSIONAL con
 * specialty = PSICOLOGIA. Sus permisos especiales sobre información
 * psicológica se derivan de la especialidad (ver docs/01-arquitectura.md, ADR-04).
 */
export enum UserRole {
  ADMIN = 'ADMIN',
  PROFESSIONAL = 'PROFESSIONAL',
}

export enum Specialty {
  FONOAUDIOLOGIA = 'FONOAUDIOLOGIA',
  PSICOLOGIA = 'PSICOLOGIA',
  TERAPIA_OCUPACIONAL = 'TERAPIA_OCUPACIONAL',
  KINESIOLOGIA = 'KINESIOLOGIA',
  PSICOPEDAGOGIA = 'PSICOPEDAGOGIA',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.PROFESSIONAL]: 'Profesional',
};

export const SPECIALTY_LABELS: Record<Specialty, string> = {
  [Specialty.FONOAUDIOLOGIA]: 'Fonoaudiología',
  [Specialty.PSICOLOGIA]: 'Psicología',
  [Specialty.TERAPIA_OCUPACIONAL]: 'Terapia Ocupacional',
  [Specialty.KINESIOLOGIA]: 'Kinesiología',
  [Specialty.PSICOPEDAGOGIA]: 'Psicopedagogía',
};
