'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MoreHorizontal, Plus } from 'lucide-react';
import { PatientDto, UserRole } from '@centro/shared';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { usePatients } from '@/lib/hooks/use-patients';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
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
import { CreatePatientDialog } from '@/components/patients/create-patient-dialog';
import { EditPatientDialog } from '@/components/patients/edit-patient-dialog';
import { ToggleActivePatientDialog } from '@/components/patients/toggle-active-patient-dialog';

const PAGE_SIZE = 10;
const ALL = '__all__';

export default function PatientsPage() {
  const { data: currentUser } = useCurrentUser();
  const isAdmin = currentUser?.role === UserRole.ADMIN;

  const [search, setSearch] = useState('');
  const [isActive, setIsActive] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [editPatient, setEditPatient] = useState<PatientDto | null>(null);
  const [toggleActivePatient, setToggleActivePatient] = useState<PatientDto | null>(null);

  const { data, isLoading, isError } = usePatients({
    search: search || undefined,
    isActive,
    page,
    pageSize: PAGE_SIZE,
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Pacientes</h1>
        {isAdmin && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Nuevo paciente
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nombre o RUT…"
          className="max-w-xs"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
        />
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

      {isError && (
        <p className="text-sm text-destructive">No se pudo cargar la lista de pacientes.</p>
      )}

      {data && data.data.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No hay pacientes que coincidan con los filtros.
        </p>
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>RUT</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Diagnóstico</TableHead>
                <TableHead>Estado</TableHead>
                {isAdmin && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((patient) => (
                <TableRow key={patient.id}>
                  <TableCell>
                    <Link href={`/dashboard/pacientes/${patient.id}`} className="hover:underline">
                      {patient.firstName} {patient.lastName}
                    </Link>
                  </TableCell>
                  <TableCell>{patient.rut}</TableCell>
                  <TableCell>{patient.phone}</TableCell>
                  <TableCell className="max-w-48 truncate">{patient.diagnosis ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={patient.isActive ? 'default' : 'secondary'}>
                      {patient.isActive ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </TableCell>
                  {isAdmin && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditPatient(patient)}>
                            Editar
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => setToggleActivePatient(patient)}
                            className={patient.isActive ? 'text-destructive' : undefined}
                          >
                            {patient.isActive ? 'Desactivar' : 'Reactivar'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Página {data.page} de {Math.max(data.totalPages, 1)} · {data.total} pacientes
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

      <CreatePatientDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditPatientDialog
        patient={editPatient}
        onOpenChange={(open) => !open && setEditPatient(null)}
      />
      <ToggleActivePatientDialog
        patient={toggleActivePatient}
        onOpenChange={(open) => !open && setToggleActivePatient(null)}
      />
    </div>
  );
}
