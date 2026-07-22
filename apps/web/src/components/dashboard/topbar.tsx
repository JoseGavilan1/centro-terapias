'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, User as UserIcon } from 'lucide-react';
import { toast } from 'sonner';
import { AuthUserDto, ROLE_LABELS } from '@centro/shared';
import { apiClient } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export function Topbar({ user }: { user: AuthUserDto }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  async function handleLogout() {
    try {
      await apiClient.post('/auth/logout', undefined, { skipAuthRetry: true });
    } catch {
      // El logout es tolerante en el servidor; si la red falla igual
      // limpiamos el estado local para no dejar datos del tenant en memoria.
    } finally {
      // Sin esto, los datos cacheados (usuarios, auditoría, organización)
      // del tenant anterior quedan en memoria y podrían mostrarse
      // brevemente si otra persona inicia sesión en el mismo navegador
      // (equipo compartido) antes de que las queries nuevas resuelvan.
      queryClient.clear();
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <header className="flex h-14 items-center justify-between border-b bg-background px-4">
      <span className="text-sm font-medium text-muted-foreground">{user.organizationName}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="gap-2">
            <UserIcon className="size-4" />
            {user.firstName} {user.lastName}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{ROLE_LABELS[user.role]}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              void handleLogout();
              toast('Sesión cerrada');
            }}
          >
            <LogOut />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
