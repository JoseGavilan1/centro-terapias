import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { WaitlistEntryDto } from '@centro/shared';
import { Public } from '../../../common/decorators/public.decorator';
import { WAITLIST_ENTRY_REPOSITORY, WaitlistEntryRepository } from '../domain/waitlist-entry.repository';
import { WaitlistService } from '../application/waitlist.service';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';

/**
 * Puente Google Forms -> Apps Script -> este webhook (§1.4 modulo-07-lista-espera.md). Cada
 * organización resuelve por su propio `waitlistIntakeToken` (no hay un id de organización en el
 * payload, a diferencia del webhook de WhatsApp que sí lo recibe implícito en `phone_number_id`).
 */
@ApiExcludeController()
@Controller('webhooks/waitlist')
export class WaitlistWebhookController {
  constructor(
    private readonly waitlistService: WaitlistService,
    @Inject(WAITLIST_ENTRY_REPOSITORY) private readonly waitlistRepository: WaitlistEntryRepository,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  async receive(
    @Headers('x-intake-token') token: string | undefined,
    @Body() dto: CreateWaitlistEntryDto,
  ): Promise<WaitlistEntryDto> {
    if (!token) {
      throw new UnauthorizedException('Token de ingreso ausente');
    }
    const organizationId = await this.waitlistRepository.findOrganizationIdByIntakeToken(token);
    if (!organizationId) {
      throw new UnauthorizedException('Token de ingreso inválido');
    }
    return this.waitlistService.intake(organizationId, dto);
  }
}
