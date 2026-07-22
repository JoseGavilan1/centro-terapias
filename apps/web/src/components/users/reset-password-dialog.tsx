'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { PASSWORD_MIN_LENGTH, PASSWORD_POLICY_MESSAGE, PASSWORD_POLICY_REGEX, UserDto } from '@centro/shared';
import { useResetPassword } from '@/lib/hooks/use-users';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  temporaryPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
    .regex(PASSWORD_POLICY_REGEX, PASSWORD_POLICY_MESSAGE),
});

type FormValues = z.infer<typeof schema>;

export function ResetPasswordDialog({
  user,
  onOpenChange,
}: {
  user: UserDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const resetPassword = useResetPassword();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  if (!user) return null;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await resetPassword.mutateAsync({ id: user!.id, dto: values });
      toast.success('Contraseña temporal asignada. Se cerraron las sesiones activas del usuario.');
      reset();
      onOpenChange(false);
    } catch {
      setServerError('No se pudo asignar la contraseña temporal');
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restablecer contraseña</DialogTitle>
          <DialogDescription>
            {user.firstName} {user.lastName} deberá cambiarla al iniciar sesión; sus sesiones activas se cerrarán.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="temporaryPassword">Contraseña temporal</Label>
            <Input id="temporaryPassword" type="text" {...register('temporaryPassword')} />
            {errors.temporaryPassword && (
              <p className="text-sm text-destructive">{errors.temporaryPassword.message}</p>
            )}
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Asignar contraseña'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
