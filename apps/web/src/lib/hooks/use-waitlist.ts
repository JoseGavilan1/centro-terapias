import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AssignWaitlistEntryRequest,
  CreateWaitlistEntryRequest,
  DiscardWaitlistEntryRequest,
  Paginated,
  UpdateWaitlistEntryRequest,
  WaitlistEntryDto,
  WaitlistQuery,
} from '@centro/shared';
import { apiClient } from '@/lib/api-client';

const WAITLIST_KEY = 'waitlist';

export function useWaitlist(query: WaitlistQuery) {
  return useQuery({
    queryKey: [WAITLIST_KEY, query],
    queryFn: () =>
      apiClient.get<Paginated<WaitlistEntryDto>>('/waitlist', {
        status: query.status,
        requestedSpecialty: query.requestedSpecialty,
        page: query.page,
        pageSize: query.pageSize,
      }),
  });
}

export function useCreateWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateWaitlistEntryRequest) =>
      apiClient.post<WaitlistEntryDto>('/waitlist', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [WAITLIST_KEY] }),
  });
}

export function useUpdateWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateWaitlistEntryRequest }) =>
      apiClient.patch<WaitlistEntryDto>(`/waitlist/${id}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [WAITLIST_KEY] }),
  });
}

export function useAssignWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: AssignWaitlistEntryRequest }) =>
      apiClient.patch<WaitlistEntryDto>(`/waitlist/${id}/assign`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [WAITLIST_KEY] }),
  });
}

export function useDiscardWaitlistEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: DiscardWaitlistEntryRequest }) =>
      apiClient.patch<WaitlistEntryDto>(`/waitlist/${id}/discard`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [WAITLIST_KEY] }),
  });
}
