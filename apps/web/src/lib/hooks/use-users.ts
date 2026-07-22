import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CreateUserRequest,
  Paginated,
  ResetPasswordRequest,
  UpdateUserRequest,
  UserDto,
  UsersQuery,
} from '@centro/shared';
import { apiClient } from '@/lib/api-client';

const USERS_KEY = 'users';

export function useUsers(query: UsersQuery) {
  return useQuery({
    queryKey: [USERS_KEY, query],
    queryFn: () =>
      apiClient.get<Paginated<UserDto>>('/users', {
        search: query.search,
        role: query.role,
        specialty: query.specialty,
        isActive: query.isActive,
        page: query.page,
        pageSize: query.pageSize,
      }),
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateUserRequest) => apiClient.post<UserDto>('/users', dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [USERS_KEY] }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: UpdateUserRequest }) =>
      apiClient.patch<UserDto>(`/users/${id}`, dto),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [USERS_KEY] }),
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete<void>(`/users/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [USERS_KEY] }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: ResetPasswordRequest }) =>
      apiClient.post<void>(`/users/${id}/reset-password`, dto),
  });
}
