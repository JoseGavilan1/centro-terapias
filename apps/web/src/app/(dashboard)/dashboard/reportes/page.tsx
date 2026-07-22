'use client';

import { useState } from 'react';
import { useAttendanceReport, useMonthlyReport, useReportsSummary } from '@/lib/hooks/use-reports';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { StatCard } from '@/components/reports/stat-card';

const MONTH_OPTIONS = [3, 6, 12];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function startOfMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [months, setMonths] = useState(6);

  const { data: summary, isLoading: summaryLoading } = useReportsSummary();
  const {
    data: attendance,
    isLoading: attendanceLoading,
    isError: attendanceError,
  } = useAttendanceReport({ from, to });
  const {
    data: monthly,
    isLoading: monthlyLoading,
    isError: monthlyError,
  } = useMonthlyReport({ months });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold">Reportes</h1>
        <p className="text-sm text-muted-foreground">
          Visibilidad operacional sin trabajo manual: pacientes, atenciones, lista de espera y
          rendimiento mensual.
        </p>
      </div>

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
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Atenciones</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="from">Desde</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="to">Hasta</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>

        {attendanceLoading && <Skeleton className="h-24 w-full" />}
        {attendanceError && (
          <p className="text-sm text-destructive">No se pudo cargar el reporte de atenciones.</p>
        )}
        {attendance && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            <StatCard label="Total" value={attendance.total} />
            <StatCard label="Atendidas" value={attendance.attended} />
            <StatCard label="Confirmadas" value={attendance.confirmed} />
            <StatCard label="Pendientes" value={attendance.pending} />
            <StatCard label="Canceladas" value={attendance.cancelled} />
            <StatCard label="No asistió" value={attendance.noShow} />
            <StatCard label="Sobrecupo" value={attendance.overbooked} />
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Rendimiento mensual</h2>
          <div className="flex gap-2">
            {MONTH_OPTIONS.map((option) => (
              <Button
                key={option}
                variant={months === option ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMonths(option)}
              >
                {option} meses
              </Button>
            ))}
          </div>
        </div>

        {monthlyLoading && (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}
        {monthlyError && (
          <p className="text-sm text-destructive">No se pudo cargar el rendimiento mensual.</p>
        )}
        {monthly && monthly.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Últimos {months} meses</CardTitle>
              <CardDescription>
                Vista de tabla — misma fuente de datos que el resumen.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mes</TableHead>
                    <TableHead>Atenciones totales</TableHead>
                    <TableHead>Atendidas</TableHead>
                    <TableHead>No asistió</TableHead>
                    <TableHead>Canceladas</TableHead>
                    <TableHead>Pacientes nuevos</TableHead>
                    <TableHead>Nuevos en lista de espera</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monthly.map((entry) => (
                    <TableRow key={entry.month}>
                      <TableCell>{entry.month}</TableCell>
                      <TableCell>{entry.totalAppointments}</TableCell>
                      <TableCell>{entry.attended}</TableCell>
                      <TableCell>{entry.noShow}</TableCell>
                      <TableCell>{entry.cancelled}</TableCell>
                      <TableCell>{entry.newPatients}</TableCell>
                      <TableCell>{entry.newWaitlistEntries}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
