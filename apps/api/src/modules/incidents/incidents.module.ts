import { Module } from '@nestjs/common';
import { AgendaModule } from '../agenda/agenda.module';
import { AuditModule } from '../audit/audit.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { IncidentsService } from './application/incidents.service';
import { INCIDENT_REPOSITORY } from './domain/incident.repository';
import { PrismaIncidentRepository } from './infrastructure/prisma-incident.repository';
import { IncidentsController } from './presentation/incidents.controller';

/**
 * Importa `AgendaModule` (para `AgendaAccessService`, verificar que un PROFESSIONAL solo
 * reporte sobre pacientes asignados) y `WhatsappModule` (para `WhatsAppMessagingService`,
 * notificación inmediata al administrador). No importa `PatientsModule` (mismo criterio
 * anti-ciclo que Agenda/Evolutions/Documents/WhatsApp/Waitlist): resuelve la existencia del
 * paciente vía Prisma directamente en el servicio.
 */
@Module({
  imports: [AgendaModule, AuditModule, WhatsappModule],
  controllers: [IncidentsController],
  providers: [
    IncidentsService,
    { provide: INCIDENT_REPOSITORY, useClass: PrismaIncidentRepository },
  ],
})
export class IncidentsModule {}
