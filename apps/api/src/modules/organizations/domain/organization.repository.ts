export interface OrganizationRecord {
  id: string;
  name: string;
  legalId: string | null;
  timezone: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  whatsappPhoneNumberId: string | null;
  googleFormsUrl: string | null;
  waitlistIntakeToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateOrganizationData {
  name?: string;
  legalId?: string | null;
  timezone?: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsappPhoneNumberId?: string | null;
  googleFormsUrl?: string | null;
  waitlistIntakeToken?: string | null;
}

export interface OrganizationRepository {
  findById(id: string): Promise<OrganizationRecord | null>;
  update(id: string, data: UpdateOrganizationData): Promise<OrganizationRecord>;
}

export const ORGANIZATION_REPOSITORY = Symbol('ORGANIZATION_REPOSITORY');
