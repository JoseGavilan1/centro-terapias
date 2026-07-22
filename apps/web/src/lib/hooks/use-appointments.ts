import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AppointmentDto,
  AppointmentsQuery,
  CreateAppointmentRequest,
  GenerateAppointmentsRequest,
  GenerateAppointmentsResult,
  MarkAttendanceRequest,
  Paginated,
  UpdateAppointmentStatusRequest,
} from '@centro/shared';
import { apiClient } from '@/lib/api-client';

export const APPOINTMENTS_KEY = 'appointments';

export function useAppointments(query: AppointmentsQuery) {
  return useQuery({
    queryKey: [APPOINTMENTS_KEY, query],
    queryFn: () =>
      apiClient.get<Paginated<AppointmentDto>>('/appointments', {
        dateFrom: query.dateFrom,
        dateTo: query.dateTo,
        professionalId: query.professionalId,
        patientId: query.patientId,
        status: query.status,
        page: query.page,
        pageSize: query.pageSize,
      }),
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateAppointmentRequest) =>
      apiClient.post<AppointmentDto>('/appointments', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] }),
  });
}

export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateAppointmentStatusRequest }) =>
      apiClient.patch<AppointmentDto>(`/appointments/${id}/status`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] }),
  });
}

export function useMarkAttendance() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: MarkAttendanceRequest }) =>
      apiClient.patch<AppointmentDto>(`/appointments/${id}/attendance`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] }),
  });
}

/** CU-03: crea instancias PENDIENTE desde las plantillas activas; por eso invalida `appointments`, no `therapy-slots`. */
export function useGenerateAppointments() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: GenerateAppointmentsRequest) =>
      apiClient.post<GenerateAppointmentsResult>('/therapy-slots/generate-appointments', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] }),
  });
}
