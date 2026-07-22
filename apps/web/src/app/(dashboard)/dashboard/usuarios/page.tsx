'use client';

import { useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import { ROLE_LABELS, SPECIALTY_LABELS, UserDto, UserRole } from '@centro/shared';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { useUsers } from '@/lib/hooks/use-users';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CreateUserDialog } from '@/components/users/create-user-dialog';
import { DeactivateUserDialog } from '@/components/users/deactivate-user-dialog';
import { EditUserDialog } from '@/components/users/edit-user-dialog';
import { ResetPasswordDialog } from '@/components/users/reset-password-dialog';

const PAGE_SIZE = 10;
const ALL = '__all__';

export default function UsersPage() {
  const { data: currentUser } = useCurrentUser();
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<UserRole | undefined>(undefined);
  const [isActive, setIsActive] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<UserDto | null>(null);
  const [resetUser, setResetUser] = useState<UserDto | null>(null);
  const [deactivateUser, setDeactivateUser] = useState<UserDto | null>(null);

  const { data, isLoading, isError } = useUsers({
    search: search || undefined,
    role,
    isActive,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Nuevo usuario
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nombre o correo…"
          className="max-w-xs"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
        <Select
          value={role ?? ALL}
          onValueChange={(value) => {
            setRole(value === ALL ? undefined : (value as UserRole));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los roles</SelectItem>
            <SelectItem value={UserRole.ADMIN}>Administrador</SelectItem>
            <SelectItem value={UserRole.PROFESSIONAL}>Profesional</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={isActive ?? ALL}
          onValueChange={(value) => {
            setIsActive(value === ALL ? undefined : value);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            <SelectItem value="true">Activos</SelectItem>
            <SelectItem value="false">Inactivos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {isError && <p className="text-sm text-destructive">No se pudo cargar la lista de usuarios.</p>}

      {data && data.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay usuarios que coincidan con los filtros.</p>
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Correo</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Especialidad</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((user) => {
                const isSelf = user.id === currentUser?.id;
                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      {user.firstName} {user.lastName}
                    </TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>{ROLE_LABELS[user.role]}</TableCell>
                    <TableCell>{user.specialty ? SPECIALTY_LABELS[user.specialty] : '—'}</TableCell>
                    <TableCell>
                      <Badge variant={user.isActive ? 'default' : 'secondary'}>
                        {user.isActive ? 'Activo' : 'Inactivo'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditUser(user)}>Editar</DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setResetUser(user)}>
                            Restablecer contraseña
                          </DropdownMenuItem>
                          {user.isActive && !isSelf && (
                            <DropdownMenuItem
                              onSelect={() => setDeactivateUser(user)}
                              className="text-destructive"
                            >
                              Desactivar
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Página {data.page} de {Math.max(data.totalPages, 1)} · {data.total} usuarios
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}

      <CreateUserDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditUserDialog
        user={editUser}
        isSelf={editUser?.id === currentUser?.id}
        onOpenChange={(open) => !open && setEditUser(null)}
      />
      <ResetPasswordDialog user={resetUser} onOpenChange={(open) => !open && setResetUser(null)} />
      <DeactivateUserDialog user={deactivateUser} onOpenChange={(open) => !open && setDeactivateUser(null)} />
    </div>
  );
}
