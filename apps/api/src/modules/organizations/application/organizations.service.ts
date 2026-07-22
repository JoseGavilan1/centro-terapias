import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction, OrganizationDto, UpdateOrganizationRequest } from '@centro/shared';
import { AuditService } from '../../audit/application/audit.service';
import { AuthenticatedUser, RequestContext } from '../../../common/types/authenticated-user';
import {
  ORGANIZATION_REPOSITORY,
  OrganizationRecord,
  OrganizationRepository,
} from '../domain/organization.repository';

@Injectable()
export class OrganizationsService {
  constructor(
    @Inject(ORGANIZATION_REPOSITORY)
    private readonly organizationRepository: OrganizationRepository,
    private readonly auditService: AuditService,
  ) {}

  async getCurrent(organizationId: string): Promise<OrganizationDto> {
    const organization = await this.organizationRepository.findById(organizationId);
    if (!organization) {
      throw new NotFoundException('Organización no encontrada');
    }
    return this.toDto(organization);
  }

  async update(
    organizationId: string,
    dto: UpdateOrganizationRequest,
    actor: AuthenticatedUser,
    context: RequestContext,
  ): Promise<OrganizationDto> {
    const existing = await this.organizationRepository.findById(organizationId);
    if (!existing) {
      throw new NotFoundException('Organización no encontrada');
    }

    const updated = await this.organizationRepository.update(organizationId, dto);

    await this.auditService.log({
      organizationId,
      userId: actor.userId,
      userEmail: actor.email,
      action: AuditAction.UPDATE,
      entity: 'Organization',
      entityId: organizationId,
      oldValue: existing,
      newValue: updated,
      ip: context.ip,
      userAgent: context.userAgent,
    });

    return this.toDto(updated);
  }

  private toDto(organization: OrganizationRecord): OrganizationDto {
    return {
      id: organization.id,
      name: organization.name,
      legalId: organization.legalId,
      timezone: organization.timezone,
      address: organization.address,
      phone: organization.phone,
      email: organization.email,
      whatsappPhoneNumberId: organization.whatsappPhoneNumberId,
      googleFormsUrl: organization.googleFormsUrl,
      waitlistIntakeToken: organization.waitlistIntakeToken,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    };
  }
}
