'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_POLICY_REGEX,
  SPECIALTY_LABELS,
  Specialty,
  UserRole,
} from '@centro/shared';
import { ApiError } from '@/lib/api-client';
import { useCreateUser } from '@/lib/hooks/use-users';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const schema = z
  .object({
    email: z.string().min(1, 'Obligatorio').email('Correo inválido'),
    firstName: z.string().min(1, 'Obligatorio'),
    lastName: z.string().min(1, 'Obligatorio'),
    role: z.nativeEnum(UserRole),
    specialty: z.nativeEnum(Specialty).optional(),
    phone: z.string().optional(),
    temporaryPassword: z
      .string()
      .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
      .regex(PASSWORD_POLICY_REGEX, PASSWORD_POLICY_MESSAGE),
  })
  .refine((data) => data.role !== UserRole.PROFESSIONAL || !!data.specialty, {
    message: 'La especialidad es obligatoria para un profesional',
    path: ['specialty'],
  });

type FormValues = z.infer<typeof schema>;

export function CreateUserDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const createUser = useCreateUser();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: UserRole.PROFESSIONAL },
  });
  const role = watch('role');

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await createUser.mutateAsync({
        ...values,
        specialty: values.role === UserRole.PROFESSIONAL ? values.specialty : undefined,
      });
      toast.success('Usuario creado. Deberá cambiar su contraseña al ingresar.');
      reset();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerError('Ya existe un usuario con ese correo');
      } else {
        setServerError('No se pudo crear el usuario');
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
          <DialogDescription>Se asignará una contraseña temporal que deberá cambiarse al ingresar.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="firstName">Nombre</Label>
              <Input id="firstName" {...register('firstName')} />
              {errors.firstName && <p className="text-sm text-destructive">{errors.firstName.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="lastName">Apellido</Label>
              <Input id="lastName" {...register('lastName')} />
              {errors.lastName && <p className="text-sm text-destructive">{errors.lastName.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Correo</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Teléfono (opcional)</Label>
            <Input id="phone" {...register('phone')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Rol</Label>
            <Select
              defaultValue={UserRole.PROFESSIONAL}
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
          </div>
          {role === UserRole.PROFESSIONAL && (
            <div className="flex flex-col gap-2">
              <Label>Especialidad</Label>
              <Select onValueChange={(value) => setValue('specialty', value as Specialty)}>
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
              {isSubmitting ? 'Creando…' : 'Crear usuario'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
