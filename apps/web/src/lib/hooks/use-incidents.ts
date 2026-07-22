import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateIncidentRequest,
  IncidentDto,
  IncidentsQuery,
  Paginated,
  UpdateIncidentStatusRequest,
} from '@centro/shared';
import { apiClient } from '@/lib/api-client';

const INCIDENTS_KEY = 'incidents';

export function useIncidents(query: IncidentsQuery) {
  return useQuery({
    queryKey: [INCIDENTS_KEY, query],
    queryFn: () =>
      apiClient.get<Paginated<IncidentDto>>('/incidents', {
        status: query.status,
        type: query.type,
        patientId: query.patientId,
        page: query.page,
        pageSize: query.pageSize,
      }),
  });
}

export function useCreateIncident() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateIncidentRequest) => apiClient.post<IncidentDto>('/incidents', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [INCIDENTS_KEY] }),
  });
}

export function useUpdateIncidentStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateIncidentStatusRequest }) =>
      apiClient.patch<IncidentDto>(`/incidents/${id}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [INCIDENTS_KEY] }),
  });
}
