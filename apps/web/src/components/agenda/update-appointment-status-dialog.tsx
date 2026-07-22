'use client';

import { toast } from 'sonner';
import { AppointmentDto, AppointmentStatus } from '@centro/shared';
import { useUpdateAppointmentStatus } from '@/lib/hooks/use-appointments';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** CU-05: confirmar o cancelar (ADMIN). `target` fija el estado destino de este diálogo. */
export function UpdateAppointmentStatusDialog({
  appointment,
  target,
  onOpenChange,
}: {
  appointment: AppointmentDto | null;
  target: AppointmentStatus.CONFIRMADA | AppointmentStatus.CANCELADA | null;
  onOpenChange: (open: boolean) => void;
}) {
  const updateStatus = useUpdateAppointmentStatus();
  if (!appointment || !target) return null;

  const isCancel = target === AppointmentStatus.CANCELADA;

  async function handleConfirm() {
    try {
      await updateStatus.mutateAsync({ id: appointment!.id, dto: { status: target! } });
      toast.success(isCancel ? 'Cita cancelada' : 'Cita confirmada');
      onOpenChange(false);
    } catch {
      toast.error(isCancel ? 'No se pudo cancelar la cita' : 'No se pudo confirmar la cita');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCancel ? 'Cancelar cita' : 'Confirmar cita'}</DialogTitle>
          <DialogDescription>
            {appointment.date} · {appointment.startTime}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Volver
          </Button>
          <Button
            variant={isCancel ? 'destructive' : 'default'}
            onClick={() => void handleConfirm()}
            disabled={updateStatus.isPending}
          >
            {updateStatus.isPending ? 'Guardando…' : isCancel ? 'Cancelar cita' : 'Confirmar cita'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
