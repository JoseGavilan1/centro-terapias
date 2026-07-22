export interface OrganizationDto {
  id: string;
  name: string;
  legalId: string | null;
  timezone: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  /** Número de WhatsApp Business (Módulo 6): identifica los webhooks entrantes de esta organización. */
  whatsappPhoneNumberId: string | null;
  /** Enlace de admisión enviado a "Paciente nuevo" en el menú de WhatsApp (Módulo 6). */
  googleFormsUrl: string | null;
  /** Token que autentica el webhook de ingreso a la lista de espera (Módulo 7, ver modulo-07-lista-espera.md §1.4). */
  waitlistIntakeToken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateOrganizationRequest {
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
