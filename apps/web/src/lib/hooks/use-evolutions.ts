import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateEvolutionRequest, EvolutionDto, EvolutionsQuery, Paginated } from '@centro/shared';
import { apiClient } from '@/lib/api-client';

const EVOLUTIONS_KEY = 'evolutions';

export function useEvolutions(patientId: string, query: EvolutionsQuery) {
  return useQuery({
    queryKey: [EVOLUTIONS_KEY, patientId, query],
    queryFn: () =>
      apiClient.get<Paginated<EvolutionDto>>(`/patients/${patientId}/evolutions`, {
        page: query.page,
        pageSize: query.pageSize,
      }),
    enabled: !!patientId,
  });
}

export function useCreateEvolution(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateEvolutionRequest) =>
      apiClient.post<EvolutionDto>(`/patients/${patientId}/evolutions`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [EVOLUTIONS_KEY, patientId] }),
  });
}
