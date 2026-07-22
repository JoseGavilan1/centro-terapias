'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@/lib/api-client';
import { SidebarNav } from '@/components/dashboard/sidebar-nav';
import { Topbar } from '@/components/dashboard/topbar';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/lib/hooks/use-current-user';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { data: user, isLoading, isError } = useCurrentUser();

  useEffect(() => {
    if (isError) {
      // /auth/me falló incluso tras el intento de refresh automático: la sesión
      // ya no es válida. Sin este logout, la cookie ct_session (7 días) sigue
      // marcando "hay sesión" para el middleware aunque el token esté muerto,
      // y el usuario queda en un loop de redirección /login ↔ /dashboard.
      apiClient
        .post('/auth/logout', undefined, { skipAuthRetry: true })
        .catch(() => undefined)
        .finally(() => router.replace('/login'));
    }
  }, [isError, router]);

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    );
  }

  return (
    <div className="grid min-h-screen grid-cols-[240px_1fr]">
      <aside className="border-r bg-muted/20">
        <div className="flex h-14 items-center border-b px-4 font-semibold">Centro de Terapias</div>
        <SidebarNav role={user.role} />
      </aside>
      <div className="flex flex-col">
        <Topbar user={user} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
