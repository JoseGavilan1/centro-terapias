import { useQuery } from '@tanstack/react-query';
import { AuditLogDto, AuditLogsQuery, Paginated } from '@centro/shared';
import { apiClient } from '@/lib/api-client';

export function useAuditLogs(query: AuditLogsQuery) {
  return useQuery({
    queryKey: ['audit-logs', query],
    queryFn: () =>
      apiClient.get<Paginated<AuditLogDto>>('/audit-logs', {
        entity: query.entity,
        userId: query.userId,
        action: query.action,
        from: query.from,
        to: query.to,
        page: query.page,
        pageSize: query.pageSize,
      }),
  });
}
