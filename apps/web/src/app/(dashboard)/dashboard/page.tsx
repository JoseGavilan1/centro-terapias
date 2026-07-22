'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import {
  APPOINTMENT_STATUS_LABELS,
  AppointmentStatus,
  ROLE_LABELS,
  SPECIALTY_LABELS,
  UserRole,
} from '@centro/shared';
import { useAppointments } from '@/lib/hooks/use-appointments';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { usePatients } from '@/lib/hooks/use-patients';
import { useReportsSummary } from '@/lib/hooks/use-reports';
import { useUsers } from '@/lib/hooks/use-users';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { StatCard } from '@/components/reports/stat-card';

const STATUS_BADGE_VARIANT: Record<
  AppointmentStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  [AppointmentStatus.PENDIENTE]: 'secondary',
  [AppointmentStatus.SOBRECUPO]: 'outline',
  [AppointmentStatus.CONFIRMADA]: 'default',
  [AppointmentStatus.ATENDIDA]: 'default',
  [AppointmentStatus.NO_ASISTIO]: 'destructive',
  [AppointmentStatus.CANCELADA]: 'destructive',
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DashboardHomePage() {
  const { data: user } = useCurrentUser();
  const isAdmin = user?.role === UserRole.ADMIN;
  const todayStr = today();

  const { data: summary, isLoading: summaryLoading } = useReportsSummary();
  const { data: patients } = usePatients({ pageSize: 100 });
  const { data: professionals } = useUsers({ role: UserRole.PROFESSIONAL, pageSize: 100 });
  const { data: todayAppointments, isLoading: appointmentsLoading } = useAppointments({
    dateFrom: todayStr,
    dateTo: todayStr,
    pageSize: 50,
  });

  const patientNames = useMemo(() => {
    const map = new Map<string, string>();
    patients?.data.forEach((p) => map.set(p.id, `${p.firstName} ${p.lastName}`));
    return map;
  }, [patients]);

  const professionalNames = useMemo(() => {
    const map = new Map<string, string>();
    professionals?.data.forEach((p) => map.set(p.id, `${p.firstName} ${p.lastName}`));
    return map;
  }, [professionals]);

  if (!user) return null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Hola, {user.firstName}</h1>

      {isAdmin && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">Resumen</h2>
          {summaryLoading && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full" />
              ))}
            </div>
          )}
          {summary && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <StatCard label="Pacientes activos" value={summary.activePatients} />
              <StatCard label="Terapeutas activos" value={summary.activeProfessionals} />
              <StatCard label="Lista de espera pendiente" value={summary.pendingWaitlistEntries} />
            </div>
          )}
          <Link
            href="/dashboard/reportes"
            className="w-fit text-sm text-muted-foreground underline"
          >
            Ver reportes completos
          </Link>
        </section>
      )}

      {!isAdmin && (
        <section className="flex flex-col gap-3">
          <StatCard label="Mis pacientes asignados" value={patients?.total ?? 0} />
        </section>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Agenda de hoy</h2>
          <Link href="/dashboard/agenda" className="text-sm text-muted-foreground underline">
            Ver agenda completa
          </Link>
        </div>

        {appointmentsLoading && <Skeleton className="h-32 w-full" />}

        {todayAppointments && todayAppointments.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No hay citas agendadas para hoy.</p>
        )}

        {todayAppointments && todayAppointments.data.length > 0 && (
          <Card>
            <CardContent className="flex flex-col divide-y py-2">
              {todayAppointments.data.map((appointment) => (
                <div key={appointment.id} className="flex items-center justify-between py-2">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium">
                      {patientNames.get(appointment.patientId) ?? appointment.patientId}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {appointment.startTime}
                      {isAdmin &&
                        ` · ${professionalNames.get(appointment.professionalId) ?? appointment.professionalId}`}
                    </span>
                  </div>
                  <Badge variant={STATUS_BADGE_VARIANT[appointment.status]}>
                    {APPOINTMENT_STATUS_LABELS[appointment.status]}
                  </Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Tu cuenta</CardTitle>
          <CardDescription>{user.organizationName}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            <span className="text-muted-foreground">Rol:</span> {ROLE_LABELS[user.role]}
          </p>
          {user.specialty && (
            <p>
              <span className="text-muted-foreground">Especialidad:</span>{' '}
              {SPECIALTY_LABELS[user.specialty]}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">Correo:</span> {user.email}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
