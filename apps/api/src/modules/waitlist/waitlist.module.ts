import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { AuditModule } from '../audit/audit.module';
import { PatientsModule } from '../patients/patients.module';
import { WaitlistService } from './application/waitlist.service';
import { WAITLIST_ENTRY_REPOSITORY } from './domain/waitlist-entry.repository';
import { PrismaWaitlistEntryRepository } from './infrastructure/prisma-waitlist-entry.repository';
import { WaitlistController } from './presentation/waitlist.controller';
import { WaitlistWebhookController } from './presentation/waitlist-webhook.controller';

/**
 * A diferencia de Agenda/Documentos/WhatsApp, este módulo sí importa `PatientsModule` (para
 * `PatientsService.create`) y `AgendaModule` (para `TherapySlotsService.create`): asignar una
 * entrada es, por diseño, componer esos dos casos de uso ya existentes (§1.6
 * modulo-07-lista-espera.md), no reimplementar su validación.
 */
@Module({
  imports: [AuditModule, PatientsModule, AgendaModule],
  controllers: [WaitlistWebhookController, WaitlistController],
  providers: [
    WaitlistService,
    { provide: WAITLIST_ENTRY_REPOSITORY, useClass: PrismaWaitlistEntryRepository },
  ],
})
export class WaitlistModule {}
