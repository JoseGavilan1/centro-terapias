'use client';

import { useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import {
  Specialty,
  SPECIALTY_LABELS,
  WaitlistEntryDto,
  WAITLIST_STATUS_LABELS,
  WaitlistStatus,
} from '@centro/shared';
import { useWaitlist } from '@/lib/hooks/use-waitlist';
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
import { AssignWaitlistEntryDialog } from '@/components/waitlist/assign-waitlist-entry-dialog';
import { CreateWaitlistEntryDialog } from '@/components/waitlist/create-waitlist-entry-dialog';
import { DiscardWaitlistEntryDialog } from '@/components/waitlist/discard-waitlist-entry-dialog';
import { EditWaitlistEntryDialog } from '@/components/waitlist/edit-waitlist-entry-dialog';

const PAGE_SIZE = 10;
const ALL = '__all__';

const STATUS_BADGE_VARIANT: Record<WaitlistStatus, 'default' | 'secondary' | 'outline'> = {
  [WaitlistStatus.PENDIENTE]: 'default',
  [WaitlistStatus.ASIGNADA]: 'secondary',
  [WaitlistStatus.DESCARTADA]: 'outline',
};

export default function WaitlistPage() {
  const [status, setStatus] = useState<WaitlistStatus | undefined>(WaitlistStatus.PENDIENTE);
  const [requestedSpecialty, setRequestedSpecialty] = useState<Specialty | undefined>(undefined);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<WaitlistEntryDto | null>(null);
  const [assignEntry, setAssignEntry] = useState<WaitlistEntryDto | null>(null);
  const [discardEntry, setDiscardEntry] = useState<WaitlistEntryDto | null>(null);

  const { data, isLoading, isError } = useWaitlist({
    status,
    requestedSpecialty,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Lista de espera</h1>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus />
          Nueva entrada
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={status ?? ALL}
          onValueChange={(value) => {
            setStatus(value === ALL ? undefined : (value as WaitlistStatus));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {Object.values(WaitlistStatus).map((value) => (
              <SelectItem key={value} value={value}>
                {WAITLIST_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={requestedSpecialty ?? ALL}
          onValueChange={(value) => {
            setRequestedSpecialty(value === ALL ? undefined : (value as Specialty));
            setPage(1);
          }}
        >
          <SelectTrigger className="w-56">
            <SelectValue placeholder="Especialidad solicitada" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas las especialidades</SelectItem>
            {Object.values(Specialty).map((value) => (
              <SelectItem key={value} value={value}>
                {SPECIALTY_LABELS[value]}
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

      {isError && <p className="text-sm text-destructive">No se pudo cargar la lista de espera.</p>}

      {data && data.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay entradas que coincidan con los filtros.
        </p>
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Niño/a</TableHead>
                <TableHead>Apoderado</TableHead>
                <TableHead>Especialidad solicitada</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Ingreso</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>
                    {entry.childFirstName} {entry.childLastName}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col">
                      <span>{entry.guardianName}</span>
                      <span className="text-xs text-muted-foreground">{entry.guardianPhone}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    {entry.requestedSpecialty ? SPECIALTY_LABELS[entry.requestedSpecialty] : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[entry.status]}>
                      {WAITLIST_STATUS_LABELS[entry.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>{entry.createdAt.slice(0, 10)}</TableCell>
                  <TableCell>
                    {entry.status === WaitlistStatus.PENDIENTE && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setAssignEntry(entry)}>
                            Asignar
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => setEditEntry(entry)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setDiscardEntry(entry)}
                            className="text-destructive"
                          >
                            Descartar
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Página {data.page} de {Math.max(data.totalPages, 1)} · {data.total} entradas
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

      <CreateWaitlistEntryDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditWaitlistEntryDialog
        entry={editEntry}
        onOpenChange={(open) => !open && setEditEntry(null)}
      />
      <AssignWaitlistEntryDialog
        entry={assignEntry}
        onOpenChange={(open) => !open && setAssignEntry(null)}
      />
      <DiscardWaitlistEntryDialog
        entry={discardEntry}
        onOpenChange={(open) => !open && setDiscardEntry(null)}
      />
    </div>
  );
}
