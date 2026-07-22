import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@centro/shared';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { USER_REPOSITORY, UserRepository } from '../../users/domain/user.repository';

/**
 * Validaciones de existencia/rol compartidas por TherapySlotsService y
 * AppointmentsService. Lee `patients` directamente vía Prisma (no a través
 * de `PatientsModule`) para que la dependencia de módulos siga siendo
 * unidireccional (patients -> agenda) y no haya ciclo (modulo-03-agenda.md §1.2).
 */
@Injectable()
export class AgendaValidationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(USER_REPOSITORY) private readonly userRepository: UserRepository,
  ) {}

  async assertPatientExists(organizationId: string, patientId: string): Promise<void> {
    const patient = await this.prisma.patient.findFirst({
      where: { id: patientId, organizationId },
      select: { id: true },
    });
    if (!patient) {
      throw new NotFoundException('Paciente no encontrado');
    }
  }

  async assertProfessionalValid(organizationId: string, professionalId: string): Promise<void> {
    const professional = await this.userRepository.findById(organizationId, professionalId);
    if (!professional) {
      throw new NotFoundException('Profesional no encontrado');
    }
    if (professional.role !== UserRole.PROFESSIONAL) {
      throw new BadRequestException(
        'Solo un usuario con rol PROFESSIONAL puede tener slots o citas',
      );
    }
  }
}
