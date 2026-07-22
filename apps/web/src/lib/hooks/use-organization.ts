import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { OrganizationDto, UpdateOrganizationRequest } from '@centro/shared';
import { apiClient } from '@/lib/api-client';

const ORG_KEY = 'organization';

export function useOrganization() {
  return useQuery({
    queryKey: [ORG_KEY],
    queryFn: () => apiClient.get<OrganizationDto>('/organizations/current'),
  });
}

export function useUpdateOrganization() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: UpdateOrganizationRequest) =>
      apiClient.patch<OrganizationDto>('/organizations/current', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [ORG_KEY] }),
  });
}
