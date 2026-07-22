'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  CalendarDays,
  LayoutDashboard,
  MessageCircle,
  ScrollText,
  Settings,
  User,
  Users,
  UserRound,
} from 'lucide-react';
import { UserRole } from '@centro/shared';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Inicio', icon: LayoutDashboard },
  // "Pacientes" ya no es adminOnly desde el Módulo 3 (§1.2): PROFESSIONAL
  // accede en modo solo lectura, filtrado por sus pacientes asignados.
  { href: '/dashboard/pacientes', label: 'Pacientes', icon: UserRound },
  { href: '/dashboard/agenda', label: 'Agenda', icon: CalendarDays },
  { href: '/dashboard/usuarios', label: 'Usuarios', icon: Users, adminOnly: true },
  { href: '/dashboard/organizacion', label: 'Centro', icon: Settings, adminOnly: true },
  { href: '/dashboard/auditoria', label: 'Auditoría', icon: ScrollText, adminOnly: true },
  { href: '/dashboard/whatsapp', label: 'Mensajes WhatsApp', icon: MessageCircle, adminOnly: true },
  { href: '/dashboard/perfil', label: 'Mi perfil', icon: User },
];

export function SidebarNav({ role }: { role: UserRole }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1 p-2">
      {NAV_ITEMS.filter((item) => !item.adminOnly || role === UserRole.ADMIN).map((item) => {
        const isActive = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-accent',
            )}
          >
            <Icon className="size-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
