import { Module } from '@nestjs/common';
import { AuditService } from './application/audit.service';
import { AUDIT_LOG_REPOSITORY } from './domain/audit-log.repository';
import { PrismaAuditLogRepository } from './infrastructure/prisma-audit-log.repository';
import { AuditLogsController } from './presentation/audit-logs.controller';

@Module({
  controllers: [AuditLogsController],
  providers: [
    AuditService,
    { provide: AUDIT_LOG_REPOSITORY, useClass: PrismaAuditLogRepository },
  ],
  exports: [AuditService],
})
export class AuditModule {}
