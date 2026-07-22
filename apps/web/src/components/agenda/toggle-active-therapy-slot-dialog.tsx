'use client';

import { toast } from 'sonner';
import { TherapySlotDto } from '@centro/shared';
import { useDeactivateTherapySlot, useUpdateTherapySlot } from '@/lib/hooks/use-therapy-slots';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ToggleActiveTherapySlotDialog({
  slot,
  onOpenChange,
}: {
  slot: TherapySlotDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const deactivateSlot = useDeactivateTherapySlot();
  const updateSlot = useUpdateTherapySlot();
  if (!slot) return null;

  const isDeactivating = slot.isActive;
  const isPending = deactivateSlot.isPending || updateSlot.isPending;

  async function handleConfirm() {
    try {
      if (isDeactivating) {
        await deactivateSlot.mutateAsync(slot!.id);
        toast.success('Plantilla desactivada');
      } else {
        await updateSlot.mutateAsync({ id: slot!.id, dto: { isActive: true } });
        toast.success('Plantilla reactivada');
      }
      onOpenChange(false);
    } catch {
      toast.error(
        isDeactivating ? 'No se pudo desactivar la plantilla' : 'No se pudo reactivar la plantilla',
      );
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isDeactivating ? 'Desactivar plantilla' : 'Reactivar plantilla'}
          </DialogTitle>
          <DialogDescription>
            {isDeactivating
              ? 'No se generarán más citas desde esta plantilla. Las citas ya generadas no se modifican.'
              : 'Volverá a generar citas en las próximas ejecuciones de "Generar citas".'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant={isDeactivating ? 'destructive' : 'default'}
            onClick={() => void handleConfirm()}
            disabled={isPending}
          >
            {isPending ? 'Guardando…' : isDeactivating ? 'Desactivar' : 'Reactivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
