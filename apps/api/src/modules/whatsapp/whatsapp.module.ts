import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AgendaModule } from '../agenda/agenda.module';
import { WhatsAppConversationService } from './application/whatsapp-conversation.service';
import { WhatsAppMessagingService } from './application/whatsapp-messaging.service';
import { WhatsAppReminderService } from './application/whatsapp-reminder.service';
import { MESSAGING_PORT, MessagingPort } from './domain/messaging.port';
import { WHATSAPP_CONVERSATION_REPOSITORY } from './domain/whatsapp-conversation.repository';
import { WHATSAPP_MESSAGE_REPOSITORY } from './domain/whatsapp-message.repository';
import { ConsoleMessagingAdapter } from './infrastructure/console-messaging.adapter';
import { PrismaWhatsAppConversationRepository } from './infrastructure/prisma-whatsapp-conversation.repository';
import { PrismaWhatsAppMessageRepository } from './infrastructure/prisma-whatsapp-message.repository';
import { WhatsAppCloudApiAdapter } from './infrastructure/whatsapp-cloud-api.adapter';
import { WhatsappController } from './presentation/whatsapp.controller';
import { WhatsappCronController } from './presentation/whatsapp-cron.controller';
import { WhatsappWebhookController } from './presentation/whatsapp-webhook.controller';

/**
 * No importa `PatientsModule` (mismo criterio anti-ciclo que `AgendaModule`/`EvolutionsModule`/
 * `DocumentsModule`): resuelve paciente/organización/administradores vía Prisma directamente
 * en los servicios de este módulo.
 *
 * `WhatsAppMessagingService` se exporta además para `IncidentsModule` (Módulo 8), que lo
 * reutiliza para notificar administradores sin duplicar el envío/registro de mensajes.
 */
@Module({
  imports: [AgendaModule],
  controllers: [WhatsappWebhookController, WhatsappController, WhatsappCronController],
  providers: [
    WhatsAppMessagingService,
    WhatsAppConversationService,
    WhatsAppReminderService,
    { provide: WHATSAPP_MESSAGE_REPOSITORY, useClass: PrismaWhatsAppMessageRepository },
    { provide: WHATSAPP_CONVERSATION_REPOSITORY, useClass: PrismaWhatsAppConversationRepository },
    {
      provide: MESSAGING_PORT,
      useFactory: (configService: ConfigService): MessagingPort => {
        const driver = configService.getOrThrow<string>('whatsapp.messagingDriver');
        if (driver === 'whatsapp-cloud-api') {
          return new WhatsAppCloudApiAdapter(
            configService.getOrThrow<string>('whatsapp.accessToken'),
          );
        }
        return new ConsoleMessagingAdapter();
      },
      inject: [ConfigService],
    },
  ],
  exports: [WhatsAppMessagingService],
})
export class WhatsappModule {}
