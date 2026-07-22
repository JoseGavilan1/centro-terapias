import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { AuditModule } from '../audit/audit.module';
import { EvolutionsService } from './application/evolutions.service';
import { EVOLUTION_REPOSITORY } from './domain/evolution.repository';
import { PrismaEvolutionRepository } from './infrastructure/prisma-evolution.repository';
import { EvolutionsController } from './presentation/evolutions.controller';

/**
 * No importa `PatientsModule` (mismo criterio que `AgendaModule`, ver
 * modulo-04-fichas-clinicas.md §1): valida la existencia del paciente
 * leyendo `patients` vía Prisma directamente en `EvolutionsService`.
 */
@Module({
  imports: [AuditModule, AgendaModule],
  controllers: [EvolutionsController],
  providers: [
    EvolutionsService,
    { provide: EVOLUTION_REPOSITORY, useClass: PrismaEvolutionRepository },
  ],
})
export class EvolutionsModule {}
