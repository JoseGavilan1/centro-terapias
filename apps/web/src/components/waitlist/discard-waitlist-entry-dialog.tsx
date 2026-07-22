'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { WaitlistEntryDto } from '@centro/shared';
import { useDiscardWaitlistEntry } from '@/lib/hooks/use-waitlist';
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
import { Textarea } from '@/components/ui/textarea';

export function DiscardWaitlistEntryDialog({
  entry,
  onOpenChange,
}: {
  entry: WaitlistEntryDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const discardEntry = useDiscardWaitlistEntry();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!entry) return null;

  async function handleConfirm() {
    if (reason.trim().length === 0) {
      setError('El motivo es obligatorio');
      return;
    }
    try {
      await discardEntry.mutateAsync({ id: entry!.id, dto: { reason: reason.trim() } });
      toast.success('Entrada descartada');
      setReason('');
      onOpenChange(false);
    } catch {
      setError('No se pudo descartar la entrada');
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) {
          setReason('');
          setError(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Descartar entrada</DialogTitle>
          <DialogDescription>
            {entry.childFirstName} {entry.childLastName} · {entry.guardianName}. Se conserva el
            registro con el motivo, no se elimina.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="discard-reason">Motivo</Label>
          <Textarea
            id="discard-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleConfirm()}
            disabled={discardEntry.isPending}
          >
            {discardEntry.isPending ? 'Guardando…' : 'Descartar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
