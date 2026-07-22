import { useQuery } from '@tanstack/react-query';
import {
  AttendanceReportDto,
  AttendanceReportQuery,
  MonthlyReportEntryDto,
  MonthlyReportQuery,
  ReportsSummaryDto,
} from '@centro/shared';
import { apiClient } from '@/lib/api-client';

const REPORTS_KEY = 'reports';

export function useReportsSummary() {
  return useQuery({
    queryKey: [REPORTS_KEY, 'summary'],
    queryFn: () => apiClient.get<ReportsSummaryDto>('/reports/summary'),
  });
}

export function useAttendanceReport(query: AttendanceReportQuery) {
  return useQuery({
    queryKey: [REPORTS_KEY, 'attendance', query],
    queryFn: () =>
      apiClient.get<AttendanceReportDto>('/reports/attendance', {
        from: query.from,
        to: query.to,
      }),
  });
}

export function useMonthlyReport(query: MonthlyReportQuery) {
  return useQuery({
    queryKey: [REPORTS_KEY, 'monthly', query],
    queryFn: () =>
      apiClient.get<MonthlyReportEntryDto[]>('/reports/monthly', { months: query.months }),
  });
}
