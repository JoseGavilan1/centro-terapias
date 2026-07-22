import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { AuditModule } from '../audit/audit.module';
import { PatientsService } from './application/patients.service';
import { PATIENT_REPOSITORY } from './domain/patient.repository';
import { PrismaPatientRepository } from './infrastructure/prisma-patient.repository';
import { PatientsController } from './presentation/patients.controller';

@Module({
  imports: [AuditModule, AgendaModule],
  controllers: [PatientsController],
  providers: [PatientsService, { provide: PATIENT_REPOSITORY, useClass: PrismaPatientRepository }],
  exports: [PatientsService],
})
export class PatientsModule {}
