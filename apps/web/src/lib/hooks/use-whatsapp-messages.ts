import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paginated, PageQuery, ReminderRunResult, WhatsAppMessageDto } from '@centro/shared';
import { apiClient } from '@/lib/api-client';

const WHATSAPP_MESSAGES_KEY = 'whatsapp-messages';

export function useWhatsAppMessages(query: PageQuery) {
  return useQuery({
    queryKey: [WHATSAPP_MESSAGES_KEY, query],
    queryFn: () =>
      apiClient.get<Paginated<WhatsAppMessageDto>>('/whatsapp/messages', {
        page: query.page,
        pageSize: query.pageSize,
      }),
  });
}

export function useRunReminders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.post<ReminderRunResult>('/whatsapp/reminders/run'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [WHATSAPP_MESSAGES_KEY] }),
  });
}
