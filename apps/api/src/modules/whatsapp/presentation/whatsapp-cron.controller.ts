import {
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request } from 'express';
import { ReminderRunResult } from '@centro/shared';
import { Public } from '../../../common/decorators/public.decorator';
import { WhatsAppReminderService } from '../application/whatsapp-reminder.service';

/**
 * Trigger externo del barrido diario de recordatorios (Vercel Cron u otro scheduler): en
 * serverless no hay proceso persistente que dispare el `@Cron` interno de
 * `WhatsAppReminderService`, así que el scheduler externo llama este endpoint por HTTP.
 * `@Public()`: no hay usuario/JWT en un cron; se autentica con un secreto compartido
 * (`CRON_SECRET`) en vez de sesión, igual que `WhatsappWebhookController` con Meta.
 */
@ApiExcludeController()
@Controller('cron/whatsapp-reminders')
export class WhatsappCronController {
  constructor(
    private readonly reminderService: WhatsAppReminderService,
    private readonly configService: ConfigService,
  ) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  run(@Req() req: Request): Promise<ReminderRunResult> {
    this.assertValidCronSecret(req);
    return this.reminderService.sendDueReminders();
  }

  private assertValidCronSecret(req: Request): void {
    const secret = this.configService.get<string>('cronSecret');
    const provided = req.headers.authorization;
    if (!secret || provided !== `Bearer ${secret}`) {
      throw new UnauthorizedException('Cron secret inválido');
    }
  }
}
