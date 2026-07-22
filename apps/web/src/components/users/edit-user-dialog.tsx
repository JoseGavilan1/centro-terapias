'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { SPECIALTY_LABELS, Specialty, UserDto, UserRole } from '@centro/shared';
import { useUpdateUser } from '@/lib/hooks/use-users';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const schema = z
  .object({
    firstName: z.string().min(1, 'Obligatorio'),
    lastName: z.string().min(1, 'Obligatorio'),
    role: z.nativeEnum(UserRole),
    specialty: z.nativeEnum(Specialty).optional(),
    phone: z.string().optional(),
  })
  .refine((data) => data.role !== UserRole.PROFESSIONAL || !!data.specialty, {
    message: 'La especialidad es obligatoria para un profesional',
    path: ['specialty'],
  });

type FormValues = z.infer<typeof schema>;

export function EditUserDialog({
  user,
  onOpenChange,
  isSelf,
}: {
  user: UserDto | null;
  onOpenChange: (open: boolean) => void;
  isSelf: boolean;
}) {
  const updateUser = useUpdateUser();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });
  const role = watch('role');

  useEffect(() => {
    if (user) {
      reset({
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        specialty: user.specialty ?? undefined,
        phone: user.phone ?? '',
      });
      setServerError(null);
    }
  }, [user, reset]);

  if (!user) return null;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await updateUser.mutateAsync({
        id: user!.id,
        dto: { ...values, specialty: values.role === UserRole.PROFESSIONAL ? values.specialty : null },
      });
      toast.success('Usuario actualizado');
      onOpenChange(false);
    } catch {
      setServerError('No se pudo actualizar el usuario');
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar usuario</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-firstName">Nombre</Label>
              <Input id="edit-firstName" {...register('firstName')} />
              {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-lastName">Apellido</Label>
              <Input id="edit-lastName" {...register('lastName')} />
              {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-phone">Teléfono (opcional)</Label>
            <Input id="edit-phone" {...register('phone')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Rol</Label>
            <Select
              value={role}
              disabled={isSelf}
              onValueChange={(value) => setValue('role', value as UserRole)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UserRole.PROFESSIONAL}>Profesional</SelectItem>
                <SelectItem value={UserRole.ADMIN}>Administrador</SelectItem>
              </SelectContent>
            </Select>
            {isSelf && <p className="text-xs text-muted-foreground">No puede cambiar su propio rol</p>}
          </div>
          {role === UserRole.PROFESSIONAL && (
            <div className="flex flex-col gap-2">
              <Label>Especialidad</Label>
              <Select
                value={watch('specialty')}
                onValueChange={(value) => setValue('specialty', value as Specialty)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione una especialidad" />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Specialty).map((specialty) => (
                    <SelectItem key={specialty} value={specialty}>
                      {SPECIALTY_LABELS[specialty]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.specialty && <p className="text-sm text-destructive">{errors.specialty.message}</p>}
            </div>
          )}
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
