'use client';

import { toast } from 'sonner';
import { PatientDto } from '@centro/shared';
import { useDeactivatePatient, useUpdatePatient } from '@/lib/hooks/use-patients';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function ToggleActivePatientDialog({
  patient,
  onOpenChange,
}: {
  patient: PatientDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const deactivatePatient = useDeactivatePatient();
  const updatePatient = useUpdatePatient();
  if (!patient) return null;

  const isDeactivating = patient.isActive;
  const isPending = deactivatePatient.isPending || updatePatient.isPending;

  async function handleConfirm() {
    try {
      if (isDeactivating) {
        await deactivatePatient.mutateAsync(patient!.id);
        toast.success('Paciente desactivado');
      } else {
        await updatePatient.mutateAsync({ id: patient!.id, dto: { isActive: true } });
        toast.success('Paciente reactivado');
      }
      onOpenChange(false);
    } catch {
      toast.error(isDeactivating ? 'No se pudo desactivar el paciente' : 'No se pudo reactivar el paciente');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isDeactivating ? 'Desactivar paciente' : 'Reactivar paciente'}</DialogTitle>
          <DialogDescription>
            {patient.firstName} {patient.lastName} ({patient.rut}).{' '}
            {isDeactivating
              ? 'No se elimina ningún dato: el registro y su futura ficha clínica se preservan.'
              : 'Volverá a aparecer como paciente activo del centro.'}
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
