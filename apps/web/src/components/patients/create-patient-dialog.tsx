'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { isValidRut } from '@centro/shared';
import { ApiError } from '@/lib/api-client';
import { useCreatePatient } from '@/lib/hooks/use-patients';
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

const today = () => new Date().toISOString().slice(0, 10);

const schema = z.object({
  firstName: z.string().min(1, 'Obligatorio'),
  lastName: z.string().min(1, 'Obligatorio'),
  rut: z.string().min(1, 'Obligatorio').refine(isValidRut, 'RUT inválido'),
  birthDate: z
    .string()
    .min(1, 'Obligatorio')
    .refine((value) => value <= today(), 'No puede ser una fecha futura'),
  diagnosis: z.string().optional(),
  phone: z.string().min(6, 'Obligatorio'),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  address: z.string().optional(),
  observations: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreatePatientDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createPatient = useCreatePatient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await createPatient.mutateAsync({ ...values, email: values.email || undefined });
      toast.success('Paciente registrado');
      reset();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerError('Ya existe un paciente con ese RUT en el centro');
      } else {
        setServerError('No se pudo registrar el paciente');
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
          <DialogTitle>Nuevo paciente</DialogTitle>
          <DialogDescription>Datos del paciente y contacto de su apoderado.</DialogDescription>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rut">RUT</Label>
              <Input id="rut" placeholder="12.345.678-5" {...register('rut')} />
              {errors.rut && <p className="text-sm text-destructive">{errors.rut.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="birthDate">Fecha de nacimiento</Label>
              <Input id="birthDate" type="date" max={today()} {...register('birthDate')} />
              {errors.birthDate && <p className="text-sm text-destructive">{errors.birthDate.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="diagnosis">Diagnóstico (opcional)</Label>
            <Input id="diagnosis" {...register('diagnosis')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="phone">Teléfono del apoderado (WhatsApp)</Label>
              <Input id="phone" {...register('phone')} />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Correo (opcional)</Label>
              <Input id="email" type="email" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="address">Dirección (opcional)</Label>
            <Input id="address" {...register('address')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="observations">Observaciones (opcional)</Label>
            <Input id="observations" {...register('observations')} />
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Registrar paciente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
