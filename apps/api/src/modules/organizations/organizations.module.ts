import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { OrganizationsService } from './application/organizations.service';
import { ORGANIZATION_REPOSITORY } from './domain/organization.repository';
import { PrismaOrganizationRepository } from './infrastructure/prisma-organization.repository';
import { OrganizationsController } from './presentation/organizations.controller';

@Module({
  imports: [AuditModule],
  controllers: [OrganizationsController],
  providers: [
    OrganizationsService,
    { provide: ORGANIZATION_REPOSITORY, useClass: PrismaOrganizationRepository },
  ],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}
