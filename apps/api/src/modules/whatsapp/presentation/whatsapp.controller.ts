import { Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Paginated, ReminderRunResult, UserRole, WhatsAppMessageDto } from '@centro/shared';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { WhatsAppMessagingService } from '../application/whatsapp-messaging.service';
import { WhatsAppReminderService } from '../application/whatsapp-reminder.service';

@ApiTags('whatsapp')
@ApiBearerAuth()
@Controller('whatsapp')
@Roles(UserRole.ADMIN)
export class WhatsappController {
  constructor(
    private readonly messagingService: WhatsAppMessagingService,
    private readonly reminderService: WhatsAppReminderService,
  ) {}

  @Get('messages')
  @ApiOperation({ summary: 'Historial de mensajes de WhatsApp de la organización' })
  findMany(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<WhatsAppMessageDto>> {
    return this.messagingService.findMany(user.organizationId, query);
  }

  @Post('reminders/run')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ejecutar ahora el barrido de recordatorios de 24 h (mismo método que el cron diario)',
  })
  runReminders(): Promise<ReminderRunResult> {
    return this.reminderService.sendDueReminders();
  }
}
