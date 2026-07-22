import { createHmac, timingSafeEqual } from 'crypto';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../../../common/decorators/public.decorator';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service';
import { WhatsAppConversationService } from '../application/whatsapp-conversation.service';

interface MetaWebhookValue {
  metadata?: { phone_number_id?: string };
  messages?: Array<{ from?: string; text?: { body?: string } }>;
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{ value?: MetaWebhookValue }>;
  }>;
}

interface RequestWithRawBody extends Request {
  rawBody?: Buffer;
}

/**
 * Webhook de Meta (WhatsApp Cloud API). Ambos endpoints son `@Public()`: Meta no envía el
 * JWT de la plataforma, se autentica con el token de verificación (`GET`) y la firma
 * HMAC (`POST`) — ver modulo-06-whatsapp.md CU-01.
 */
@ApiExcludeController()
@Controller('webhooks/whatsapp')
export class WhatsappWebhookController {
  constructor(
    private readonly conversationService: WhatsAppConversationService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Get()
  verify(
    @Query('hub.mode') mode: string | undefined,
    @Query('hub.verify_token') token: string | undefined,
    @Query('hub.challenge') challenge: string | undefined,
    @Res() res: Response,
  ): void {
    const expected = this.configService.get<string>('whatsapp.verifyToken');
    if (mode === 'subscribe' && expected && token === expected) {
      res.status(HttpStatus.OK).send(challenge ?? '');
      return;
    }
    res.status(HttpStatus.FORBIDDEN).send();
  }

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async receive(
    @Req() req: RequestWithRawBody,
    @Body() body: MetaWebhookPayload,
  ): Promise<{ received: true }> {
    this.assertValidSignature(req);

    for (const entry of body.entry ?? []) {
      for (const change of entry.changes ?? []) {
        await this.processChange(change.value);
      }
    }

    // Meta reintenta el mismo mensaje si no recibe 2xx; siempre se responde 200,
    // incluso si el payload no correspondía a ninguna organización registrada.
    return { received: true };
  }

  private async processChange(value: MetaWebhookValue | undefined): Promise<void> {
    const phoneNumberId = value?.metadata?.phone_number_id;
    const messages = value?.messages ?? [];
    if (!phoneNumberId || messages.length === 0) {
      return;
    }

    const organization = await this.prisma.organization.findUnique({
      where: { whatsappPhoneNumberId: phoneNumberId },
      select: { id: true },
    });
    // Mensaje a un número no registrado en ninguna organización: no hay tenant al que
    // asignarlo (modulo-06-whatsapp.md §1) — se descarta silenciosamente.
    if (!organization) {
      return;
    }

    for (const message of messages) {
      if (!message.from) {
        continue;
      }
      await this.conversationService.handleIncomingMessage({
        organizationId: organization.id,
        fromPhoneNumberId: phoneNumberId,
        phone: message.from,
        text: message.text?.body ?? '',
      });
    }
  }

  /** Sin `WHATSAPP_APP_SECRET` configurado (default de este entorno), no se verifica firma (doble de desarrollo). */
  private assertValidSignature(req: RequestWithRawBody): void {
    const appSecret = this.configService.get<string>('whatsapp.appSecret');
    if (!appSecret) {
      return;
    }

    const header = req.headers['x-hub-signature-256'];
    const signature = Array.isArray(header) ? header[0] : header;
    if (!req.rawBody || !signature) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }

    const expected = `sha256=${createHmac('sha256', appSecret).update(req.rawBody).digest('hex')}`;
    const provided = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expected);
    const isValid =
      provided.length === expectedBuffer.length && timingSafeEqual(provided, expectedBuffer);
    if (!isValid) {
      throw new UnauthorizedException('Firma de webhook inválida');
    }
  }
}
