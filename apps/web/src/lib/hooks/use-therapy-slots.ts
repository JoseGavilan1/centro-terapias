import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateTherapySlotRequest,
  Paginated,
  TherapySlotDto,
  TherapySlotsQuery,
  UpdateTherapySlotRequest,
} from '@centro/shared';
import { apiClient } from '@/lib/api-client';

export const THERAPY_SLOTS_KEY = 'therapy-slots';

export function useTherapySlots(query: TherapySlotsQuery) {
  return useQuery({
    queryKey: [THERAPY_SLOTS_KEY, query],
    queryFn: () =>
      apiClient.get<Paginated<TherapySlotDto>>('/therapy-slots', {
        professionalId: query.professionalId,
        patientId: query.patientId,
        page: query.page,
        pageSize: query.pageSize,
      }),
  });
}

export function useCreateTherapySlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateTherapySlotRequest) =>
      apiClient.post<TherapySlotDto>('/therapy-slots', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [THERAPY_SLOTS_KEY] }),
  });
}

export function useUpdateTherapySlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateTherapySlotRequest }) =>
      apiClient.patch<TherapySlotDto>(`/therapy-slots/${id}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [THERAPY_SLOTS_KEY] }),
  });
}

export function useDeactivateTherapySlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/therapy-slots/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [THERAPY_SLOTS_KEY] }),
  });
}
