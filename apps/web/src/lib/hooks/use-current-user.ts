import { useQuery } from '@tanstack/react-query';
import { AuthUserDto } from '@centro/shared';
import { apiClient } from '@/lib/api-client';

export function useCurrentUser() {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiClient.get<AuthUserDto>('/auth/me'),
  });
}
