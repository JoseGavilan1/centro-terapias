import { Inject, Injectable } from '@nestjs/common';
import { AppointmentStatus } from '@centro/shared';
import {
  AppointmentRecord,
  APPOINTMENT_REPOSITORY,
  AppointmentRepository,
} from '../domain/appointment.repository';
import { THERAPY_SLOT_REPOSITORY, TherapySlotRepository } from '../domain/therapy-slot.repository';
import { AppointmentsService } from './appointments.service';

export interface AttendedAppointmentContext {
  patientId: string;
  professionalId: string;
}

/**
 * Punto de acceso que otros módulos consumen sin importar `AgendaModule`
 * completo: `PatientsModule` lo usa para filtrar `/patients` por profesional
 * (modulo-03-agenda.md §1.2); `EvolutionsModule` lo usa para validar el
 * vínculo opcional evolución-cita (modulo-04-fichas-clinicas.md §1.2);
 * `WhatsappModule` lo usa para el menú y el recordatorio automático
 * (modulo-06-whatsapp.md §1). La dependencia siempre es unidireccional hacia
 * `agenda`, nunca al revés.
 */
@Injectable()
export class AgendaAccessService {
  constructor(
    @Inject(THERAPY_SLOT_REPOSITORY) private readonly therapySlotRepository: TherapySlotRepository,
    @Inject(APPOINTMENT_REPOSITORY) private readonly appointmentRepository: AppointmentRepository,
    private readonly appointmentsService: AppointmentsService,
  ) {}

  /** Ids de pacientes con al menos un `TherapySlot` activo asignado a este profesional. */
  getAssignedPatientIds(organizationId: string, professionalId: string): Promise<string[]> {
    return this.therapySlotRepository.findAssignedPatientIds(organizationId, professionalId);
  }

  /** `null` si la cita no existe o no está en estado `ATENDIDA` (único estado válido para vincular una evolución). */
  async getAttendedAppointmentContext(
    organizationId: string,
    appointmentId: string,
  ): Promise<AttendedAppointmentContext | null> {
    const appointment = await this.appointmentRepository.findById(organizationId, appointmentId);
    if (!appointment || appointment.status !== AppointmentStatus.ATENDIDA) {
      return null;
    }
    return { patientId: appointment.patientId, professionalId: appointment.professionalId };
  }

  /** Próxima cita no terminal de un paciente (Módulo 6, menú de WhatsApp). */
  findNextUpcomingAppointment(
    organizationId: string,
    patientId: string,
  ): Promise<AppointmentRecord | null> {
    return this.appointmentsService.findNextUpcomingForPatient(organizationId, patientId);
  }

  /** Confirmar/cancelar iniciado por el paciente vía WhatsApp (Módulo 6, `confirmedVia=WHATSAPP`). */
  respondToAppointmentViaWhatsApp(
    organizationId: string,
    appointmentId: string,
    response: 'CONFIRM' | 'CANCEL',
  ): Promise<AppointmentRecord> {
    return this.appointmentsService.applyWhatsAppResponse(organizationId, appointmentId, response);
  }

  /** Citas `PENDIENTE` de todas las organizaciones que caen en `[from, to]` (Módulo 6, recordatorio diario). */
  findAppointmentsDueForReminder(from: Date, to: Date): Promise<AppointmentRecord[]> {
    return this.appointmentRepository.findDueForReminder(from, to);
  }
}
