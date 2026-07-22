'use client';

import { toast } from 'sonner';
import { UserDto } from '@centro/shared';
import { useDeactivateUser } from '@/lib/hooks/use-users';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export function DeactivateUserDialog({
  user,
  onOpenChange,
}: {
  user: UserDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const deactivateUser = useDeactivateUser();
  if (!user) return null;

  async function handleConfirm() {
    try {
      await deactivateUser.mutateAsync(user!.id);
      toast.success('Usuario desactivado');
      onOpenChange(false);
    } catch {
      toast.error('No se pudo desactivar el usuario');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desactivar usuario</DialogTitle>
          <DialogDescription>
            {user.firstName} {user.lastName} no podrá iniciar sesión. Esta acción no borra su historial ni se
            puede deshacer desde aquí; un administrador puede reactivarlo editándolo más tarde.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => void handleConfirm()} disabled={deactivateUser.isPending}>
            {deactivateUser.isPending ? 'Desactivando…' : 'Desactivar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
