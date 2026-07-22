'use client';

import { toast } from 'sonner';
import { AppointmentDto, AppointmentStatus } from '@centro/shared';
import { ApiError } from '@/lib/api-client';
import { useMarkAttendance } from '@/lib/hooks/use-appointments';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** CU-06: PROFESSIONAL (propia, hoy o pasado) o ADMIN (sin restricción). */
export function MarkAttendanceDialog({
  appointment,
  onOpenChange,
}: {
  appointment: AppointmentDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const markAttendance = useMarkAttendance();
  if (!appointment) return null;

  async function handleMark(
    status: AppointmentStatus.ATENDIDA | AppointmentStatus.NO_ASISTIO | AppointmentStatus.CANCELADA,
  ) {
    try {
      await markAttendance.mutateAsync({ id: appointment!.id, dto: { status } });
      toast.success('Asistencia registrada');
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        toast.error('No puede marcar asistencia de una cita futura');
      } else {
        toast.error('No se pudo registrar la asistencia');
      }
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Marcar asistencia</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {appointment.date} · {appointment.startTime}
        </p>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            className="w-full"
            disabled={markAttendance.isPending}
            onClick={() => void handleMark(AppointmentStatus.ATENDIDA)}
          >
            Asistió
          </Button>
          <Button
            className="w-full"
            variant="outline"
            disabled={markAttendance.isPending}
            onClick={() => void handleMark(AppointmentStatus.NO_ASISTIO)}
          >
            No asistió
          </Button>
          <Button
            className="w-full"
            variant="destructive"
            disabled={markAttendance.isPending}
            onClick={() => void handleMark(AppointmentStatus.CANCELADA)}
          >
            Canceló
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
