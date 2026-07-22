import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreatePatientRequest,
  Paginated,
  PatientDto,
  PatientsQuery,
  UpdatePatientRequest,
} from '@centro/shared';
import { apiClient } from '@/lib/api-client';

const PATIENTS_KEY = 'patients';

export function usePatients(query: PatientsQuery) {
  return useQuery({
    queryKey: [PATIENTS_KEY, query],
    queryFn: () =>
      apiClient.get<Paginated<PatientDto>>('/patients', {
        search: query.search,
        isActive: query.isActive,
        page: query.page,
        pageSize: query.pageSize,
      }),
  });
}

export function usePatient(id: string) {
  return useQuery({
    queryKey: [PATIENTS_KEY, id],
    queryFn: () => apiClient.get<PatientDto>(`/patients/${id}`),
    enabled: !!id,
  });
}

export function useCreatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreatePatientRequest) => apiClient.post<PatientDto>('/patients', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PATIENTS_KEY] }),
  });
}

export function useUpdatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdatePatientRequest }) =>
      apiClient.patch<PatientDto>(`/patients/${id}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PATIENTS_KEY] }),
  });
}

export function useDeactivatePatient() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/patients/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PATIENTS_KEY] }),
  });
}
