import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import {
  OrganizationRecord,
  OrganizationRepository,
  UpdateOrganizationData,
} from '../domain/organization.repository';

@Injectable()
export class PrismaOrganizationRepository implements OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string): Promise<OrganizationRecord | null> {
    return this.prisma.organization.findUnique({ where: { id } });
  }

  update(id: string, data: UpdateOrganizationData): Promise<OrganizationRecord> {
    return this.prisma.organization.update({ where: { id }, data });
  }
}
