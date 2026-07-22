import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { UsersModule } from '../users/users.module';
import { AgendaAccessService } from './application/agenda-access.service';
import { AgendaValidationService } from './application/agenda-validation.service';
import { AppointmentsService } from './application/appointments.service';
import { TherapySlotsService } from './application/therapy-slots.service';
import { APPOINTMENT_REPOSITORY } from './domain/appointment.repository';
import { THERAPY_SLOT_REPOSITORY } from './domain/therapy-slot.repository';
import { PrismaAppointmentRepository } from './infrastructure/prisma-appointment.repository';
import { PrismaTherapySlotRepository } from './infrastructure/prisma-therapy-slot.repository';
import { AppointmentsController } from './presentation/appointments.controller';
import { TherapySlotsController } from './presentation/therapy-slots.controller';

/**
 * No importa `PatientsModule` (evita el ciclo patients -> agenda -> patients):
 * `AgendaValidationService` lee `patients` vía Prisma directamente en su capa
 * de infraestructura. `PatientsModule` sí importa este módulo para consumir
 * `AgendaAccessService` (modulo-03-agenda.md §1.2).
 *
 * `TherapySlotsService` se exporta además para `WaitlistModule` (Módulo 7), que lo reutiliza
 * al asignar una entrada en vez de reimplementar la validación de solapamiento de horario.
 */
@Module({
  imports: [AuditModule, UsersModule],
  controllers: [TherapySlotsController, AppointmentsController],
  providers: [
    TherapySlotsService,
    AppointmentsService,
    AgendaAccessService,
    AgendaValidationService,
    { provide: THERAPY_SLOT_REPOSITORY, useClass: PrismaTherapySlotRepository },
    { provide: APPOINTMENT_REPOSITORY, useClass: PrismaAppointmentRepository },
  ],
  exports: [AgendaAccessService, TherapySlotsService],
})
export class AgendaModule {}
