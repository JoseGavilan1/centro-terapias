'use client';

import { useMemo, useState } from 'react';
import { MoreHorizontal, Plus } from 'lucide-react';
import {
  APPOINTMENT_STATUS_LABELS,
  AppointmentDto,
  AppointmentStatus,
  TERMINAL_APPOINTMENT_STATUSES,
  TherapySlotDto,
  UserRole,
  WEEKDAY_LABELS,
} from '@centro/shared';
import { useAppointments } from '@/lib/hooks/use-appointments';
import { usePatients } from '@/lib/hooks/use-patients';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { useTherapySlots } from '@/lib/hooks/use-therapy-slots';
import { useUsers } from '@/lib/hooks/use-users';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { CreateAppointmentDialog } from '@/components/agenda/create-appointment-dialog';
import { CreateTherapySlotDialog } from '@/components/agenda/create-therapy-slot-dialog';
import { CreateEvolutionDialog } from '@/components/evolutions/create-evolution-dialog';
import { EditTherapySlotDialog } from '@/components/agenda/edit-therapy-slot-dialog';
import { GenerateAppointmentsDialog } from '@/components/agenda/generate-appointments-dialog';
import { MarkAttendanceDialog } from '@/components/agenda/mark-attendance-dialog';
import { ToggleActiveTherapySlotDialog } from '@/components/agenda/toggle-active-therapy-slot-dialog';
import { UpdateAppointmentStatusDialog } from '@/components/agenda/update-appointment-status-dialog';

const PAGE_SIZE = 20;

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

/** Mapa id -> "Nombre Apellido" para no repetir el fetch en cada fila (escala de un centro, no de miles de registros). */
function useNameLookups() {
  const { data: patients } = usePatients({ pageSize: 100 });
  const { data: professionals } = useUsers({ role: UserRole.PROFESSIONAL, pageSize: 100 });

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

  return { patientNames, professionalNames };
}

export default function AgendaPage() {
  const { data: currentUser } = useCurrentUser();

  if (!currentUser) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return currentUser.role === UserRole.ADMIN ? (
    <AdminAgendaView />
  ) : (
    <ProfessionalAgendaView professionalId={currentUser.id} />
  );
}

function AdminAgendaView() {
  const [tab, setTab] = useState<'plantillas' | 'citas'>('plantillas');
  const { patientNames, professionalNames } = useNameLookups();

  const [createSlotOpen, setCreateSlotOpen] = useState(false);
  const [editSlot, setEditSlot] = useState<TherapySlotDto | null>(null);
  const [toggleSlot, setToggleSlot] = useState<TherapySlotDto | null>(null);
  const [generateOpen, setGenerateOpen] = useState(false);
  const [createApptOpen, setCreateApptOpen] = useState(false);
  const [statusDialog, setStatusDialog] = useState<{
    appointment: AppointmentDto;
    target: AppointmentStatus.CONFIRMADA | AppointmentStatus.CANCELADA;
  } | null>(null);
  const [attendanceAppointment, setAttendanceAppointment] = useState<AppointmentDto | null>(null);

  const slots = useTherapySlots({ page: 1, pageSize: PAGE_SIZE });
  const appointments = useAppointments({ page: 1, pageSize: PAGE_SIZE });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Agenda</h1>
        <div className="flex gap-2">
          {tab === 'plantillas' ? (
            <Button onClick={() => setCreateSlotOpen(true)}>
              <Plus />
              Nueva plantilla
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => setGenerateOpen(true)}>
                Generar citas
              </Button>
              <Button onClick={() => setCreateApptOpen(true)}>
                <Plus />
                Nuevo sobrecupo
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b">
        {(['plantillas', 'citas'] as const).map((key) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'px-3 py-2 text-sm font-medium',
              tab === key ? 'border-b-2 border-primary text-foreground' : 'text-muted-foreground',
            )}
          >
            {key === 'plantillas' ? 'Plantillas' : 'Citas'}
          </button>
        ))}
      </div>

      {tab === 'plantillas' && (
        <SlotsTable
          slots={slots.data?.data ?? []}
          isLoading={slots.isLoading}
          patientNames={patientNames}
          professionalNames={professionalNames}
          onEdit={setEditSlot}
          onToggleActive={setToggleSlot}
        />
      )}

      {tab === 'citas' && (
        <AppointmentsTable
          appointments={appointments.data?.data ?? []}
          isLoading={appointments.isLoading}
          patientNames={patientNames}
          professionalNames={professionalNames}
          onConfirm={(appointment) =>
            setStatusDialog({ appointment, target: AppointmentStatus.CONFIRMADA })
          }
          onCancel={(appointment) =>
            setStatusDialog({ appointment, target: AppointmentStatus.CANCELADA })
          }
          onMarkAttendance={setAttendanceAppointment}
        />
      )}

      <CreateTherapySlotDialog open={createSlotOpen} onOpenChange={setCreateSlotOpen} />
      <EditTherapySlotDialog slot={editSlot} onOpenChange={(open) => !open && setEditSlot(null)} />
      <ToggleActiveTherapySlotDialog
        slot={toggleSlot}
        onOpenChange={(open) => !open && setToggleSlot(null)}
      />
      <GenerateAppointmentsDialog open={generateOpen} onOpenChange={setGenerateOpen} />
      <CreateAppointmentDialog open={createApptOpen} onOpenChange={setCreateApptOpen} />
      <UpdateAppointmentStatusDialog
        appointment={statusDialog?.appointment ?? null}
        target={statusDialog?.target ?? null}
        onOpenChange={(open) => !open && setStatusDialog(null)}
      />
      <MarkAttendanceDialog
        appointment={attendanceAppointment}
        onOpenChange={(open) => !open && setAttendanceAppointment(null)}
      />
    </div>
  );
}

function ProfessionalAgendaView({ professionalId }: { professionalId: string }) {
  const { patientNames } = useNameLookups();
  const [attendanceAppointment, setAttendanceAppointment] = useState<AppointmentDto | null>(null);
  const [evolutionAppointment, setEvolutionAppointment] = useState<AppointmentDto | null>(null);
  const appointments = useAppointments({ professionalId, page: 1, pageSize: PAGE_SIZE });
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Mi agenda</h1>

      {appointments.isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {appointments.data && appointments.data.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No tiene citas registradas.</p>
      )}

      {appointments.data && appointments.data.data.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paciente</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Hora</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="w-32" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {appointments.data.data.map((appointment) => {
              const canMarkAttendance =
                appointment.date <= today && !TERMINAL_APPOINTMENT_STATUSES.has(appointment.status);
              return (
                <TableRow key={appointment.id}>
                  <TableCell>
                    {patientNames.get(appointment.patientId) ?? appointment.patientId}
                  </TableCell>
                  <TableCell>{appointment.date}</TableCell>
                  <TableCell>{appointment.startTime}</TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[appointment.status]}>
                      {APPOINTMENT_STATUS_LABELS[appointment.status]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {canMarkAttendance && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setAttendanceAppointment(appointment)}
                        >
                          Marcar asistencia
                        </Button>
                      )}
                      {appointment.status === AppointmentStatus.ATENDIDA && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEvolutionAppointment(appointment)}
                        >
                          Registrar evolución
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <MarkAttendanceDialog
        appointment={attendanceAppointment}
        onOpenChange={(open) => !open && setAttendanceAppointment(null)}
      />
      {evolutionAppointment && (
        <CreateEvolutionDialog
          open
          onOpenChange={(open) => !open && setEvolutionAppointment(null)}
          patientId={evolutionAppointment.patientId}
          appointmentId={evolutionAppointment.id}
        />
      )}
    </div>
  );
}

function SlotsTable({
  slots,
  isLoading,
  patientNames,
  professionalNames,
  onEdit,
  onToggleActive,
}: {
  slots: TherapySlotDto[];
  isLoading: boolean;
  patientNames: Map<string, string>;
  professionalNames: Map<string, string>;
  onEdit: (slot: TherapySlotDto) => void;
  onToggleActive: (slot: TherapySlotDto) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No hay plantillas de horario registradas.</p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Paciente</TableHead>
          <TableHead>Profesional</TableHead>
          <TableHead>Día</TableHead>
          <TableHead>Hora</TableHead>
          <TableHead>Duración</TableHead>
          <TableHead>Vigencia</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {slots.map((slot) => (
          <TableRow key={slot.id}>
            <TableCell>{patientNames.get(slot.patientId) ?? slot.patientId}</TableCell>
            <TableCell>
              {professionalNames.get(slot.professionalId) ?? slot.professionalId}
            </TableCell>
            <TableCell>{WEEKDAY_LABELS[slot.weekday]}</TableCell>
            <TableCell>{slot.startTime}</TableCell>
            <TableCell>{slot.durationMinutes} min</TableCell>
            <TableCell>
              {slot.validFrom} {slot.validTo ? `– ${slot.validTo}` : ''}
            </TableCell>
            <TableCell>
              <Badge variant={slot.isActive ? 'default' : 'secondary'}>
                {slot.isActive ? 'Activa' : 'Inactiva'}
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
                  <DropdownMenuItem onSelect={() => onEdit(slot)}>Editar</DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onToggleActive(slot)}
                    className={slot.isActive ? 'text-destructive' : undefined}
                  >
                    {slot.isActive ? 'Desactivar' : 'Reactivar'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function AppointmentsTable({
  appointments,
  isLoading,
  patientNames,
  professionalNames,
  onConfirm,
  onCancel,
  onMarkAttendance,
}: {
  appointments: AppointmentDto[];
  isLoading: boolean;
  patientNames: Map<string, string>;
  professionalNames: Map<string, string>;
  onConfirm: (appointment: AppointmentDto) => void;
  onCancel: (appointment: AppointmentDto) => void;
  onMarkAttendance: (appointment: AppointmentDto) => void;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  if (appointments.length === 0) {
    return <p className="text-sm text-muted-foreground">No hay citas registradas.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Paciente</TableHead>
          <TableHead>Profesional</TableHead>
          <TableHead>Fecha</TableHead>
          <TableHead>Hora</TableHead>
          <TableHead>Estado</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {appointments.map((appointment) => {
          const canConfirmOrCancel =
            appointment.status === AppointmentStatus.PENDIENTE ||
            appointment.status === AppointmentStatus.SOBRECUPO ||
            appointment.status === AppointmentStatus.CONFIRMADA;
          const canMarkAttendance = !TERMINAL_APPOINTMENT_STATUSES.has(appointment.status);
          return (
            <TableRow key={appointment.id}>
              <TableCell>
                {patientNames.get(appointment.patientId) ?? appointment.patientId}
              </TableCell>
              <TableCell>
                {professionalNames.get(appointment.professionalId) ?? appointment.professionalId}
              </TableCell>
              <TableCell>{appointment.date}</TableCell>
              <TableCell>{appointment.startTime}</TableCell>
              <TableCell>
                <Badge variant={STATUS_BADGE_VARIANT[appointment.status]}>
                  {APPOINTMENT_STATUS_LABELS[appointment.status]}
                </Badge>
              </TableCell>
              <TableCell>
                {(canConfirmOrCancel || canMarkAttendance) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="size-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {appointment.status !== AppointmentStatus.CONFIRMADA &&
                        canConfirmOrCancel && (
                          <DropdownMenuItem onSelect={() => onConfirm(appointment)}>
                            Confirmar
                          </DropdownMenuItem>
                        )}
                      {canConfirmOrCancel && (
                        <DropdownMenuItem
                          onSelect={() => onCancel(appointment)}
                          className="text-destructive"
                        >
                          Cancelar
                        </DropdownMenuItem>
                      )}
                      {canMarkAttendance && (
                        <DropdownMenuItem onSelect={() => onMarkAttendance(appointment)}>
                          Marcar asistencia
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
