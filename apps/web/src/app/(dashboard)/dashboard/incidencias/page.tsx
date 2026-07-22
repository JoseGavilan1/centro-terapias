'use client';

import { useMemo, useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import {
  IncidentDto,
  INCIDENT_STATUS_LABELS,
  IncidentStatus,
  INCIDENT_TYPE_LABELS,
  IncidentType,
  UserRole,
} from '@centro/shared';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { useIncidents } from '@/lib/hooks/use-incidents';
import { usePatients } from '@/lib/hooks/use-patients';
import { useUsers } from '@/lib/hooks/use-users';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CreateIncidentDialog } from '@/components/incidents/create-incident-dialog';
import { UpdateIncidentStatusDialog } from '@/components/incidents/update-incident-status-dialog';

const PAGE_SIZE = 10;
const ALL = '__all__';

const STATUS_BADGE_VARIANT: Record<IncidentStatus, 'default' | 'secondary' | 'outline'> = {
  [IncidentStatus.ABIERTA]: 'default',
  [IncidentStatus.EN_REVISION]: 'secondary',
  [IncidentStatus.CERRADA]: 'outline',
};

export default function IncidentsPage() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const [status, setStatus] = useState<IncidentStatus | undefined>(undefined);
  const [type, setType] = useState<IncidentType | undefined>(undefined);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [statusIncident, setStatusIncident] = useState<IncidentDto | null>(null);

  const { data, isLoading, isError } = useIncidents({ status, type, page, pageSize: PAGE_SIZE });
  const { data: patients } = usePatients({ pageSize: 100 });
  const { data: users } = useUsers({ pageSize: 100 });

  const patientNames = useMemo(() => {
    const map = new Map<string, string>();
    patients?.data.forEach((p) => map.set(p.id, `${p.firstName} ${p.lastName}`));
    return map;
  }, [patients]);

  const userNames = useMemo(() => {
    const map = new Map<string, string>();
    users?.data.forEach((u) => map.set(u.id, `${u.firstName} ${u.lastName}`));
    return map;
  }, [users]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Incidencias</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Reportar incidencia
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status ?? ALL}
          onValueChange={(value) => {
            setStatus(value === ALL ? undefined : (value as IncidentStatus));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {Object.values(IncidentStatus).map((value) => (
              <SelectItem key={value} value={value}>
                {INCIDENT_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={type ?? ALL}
          onValueChange={(value) => {
            setType(value === ALL ? undefined : (value as IncidentType));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los tipos</SelectItem>
            {Object.values(IncidentType).map((value) => (
              <SelectItem key={value} value={value}>
                {INCIDENT_TYPE_LABELS[value]}
              </SelectItem>
            ))}
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

      {isError && (
        <p className="text-sm text-destructive">No se pudieron cargar las incidencias.</p>
      )}

      {data && data.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay incidencias que coincidan con los filtros.
        </p>
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Paciente</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Ocurrió</TableHead>
                {isAdmin && <TableHead>Reportado por</TableHead>}
                <TableHead>Estado</TableHead>
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((incident) => (
                <TableRow key={incident.id}>
                  <TableCell>{INCIDENT_TYPE_LABELS[incident.type]}</TableCell>
                  <TableCell>
                    {incident.patientId ? (patientNames.get(incident.patientId) ?? '—') : '—'}
                  </TableCell>
                  <TableCell className="max-w-64 truncate">{incident.description}</TableCell>
                  <TableCell>{new Date(incident.occurredAt).toLocaleString('es-CL')}</TableCell>
                  {isAdmin && <TableCell>{userNames.get(incident.reportedById) ?? '—'}</TableCell>}
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[incident.status]}>
                      {INCIDENT_STATUS_LABELS[incident.status]}
                    </Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      {incident.status !== IncidentStatus.CERRADA && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="size-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => setStatusIncident(incident)}>
                              Actualizar estado
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Página {data.page} de {Math.max(data.totalPages, 1)} · {data.total} incidencias
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
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

      <CreateIncidentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <UpdateIncidentStatusDialog
        incident={statusIncident}
        onOpenChange={(open) => !open && setStatusIncident(null)}
      />
    </div>
  );
}
