'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  IncidentDto,
  INCIDENT_STATUS_LABELS,
  IncidentStatus,
  INCIDENT_TYPE_LABELS,
} from '@centro/shared';
import { useUpdateIncidentStatus } from '@/lib/hooks/use-incidents';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** Transiciones hacia adelante únicamente; CERRADA es terminal (§1.3 modulo-08-incidencias.md). */
const NEXT_STATUSES: Record<IncidentStatus, IncidentStatus[]> = {
  [IncidentStatus.ABIERTA]: [IncidentStatus.EN_REVISION, IncidentStatus.CERRADA],
  [IncidentStatus.EN_REVISION]: [IncidentStatus.CERRADA],
  [IncidentStatus.CERRADA]: [],
};

export function UpdateIncidentStatusDialog({
  incident,
  onOpenChange,
}: {
  incident: IncidentDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const updateStatus = useUpdateIncidentStatus();
  const [status, setStatus] = useState<IncidentStatus | undefined>(undefined);

  if (!incident) return null;
  const options = NEXT_STATUSES[incident.status];

  async function handleConfirm() {
    if (!status) return;
    try {
      await updateStatus.mutateAsync({ id: incident!.id, dto: { status } });
      toast.success('Estado actualizado');
      setStatus(undefined);
      onOpenChange(false);
    } catch {
      toast.error('No se pudo actualizar el estado');
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) setStatus(undefined);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Actualizar estado</DialogTitle>
          <DialogDescription>
            {INCIDENT_TYPE_LABELS[incident.type]} · Estado actual:{' '}
            {INCIDENT_STATUS_LABELS[incident.status]}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label>Nuevo estado</Label>
          <Select value={status} onValueChange={(value) => setStatus(value as IncidentStatus)}>
            <SelectTrigger>
              <SelectValue placeholder="Seleccione un estado" />
            </SelectTrigger>
            <SelectContent>
              {options.map((value) => (
                <SelectItem key={value} value={value}>
                  {INCIDENT_STATUS_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void handleConfirm()} disabled={!status || updateStatus.isPending}>
            {updateStatus.isPending ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
