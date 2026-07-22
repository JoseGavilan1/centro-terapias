'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { isValidRut, PatientDto } from '@centro/shared';
import { ApiError } from '@/lib/api-client';
import { useUpdatePatient } from '@/lib/hooks/use-patients';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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

export function EditPatientDialog({
  patient,
  onOpenChange,
}: {
  patient: PatientDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const updatePatient = useUpdatePatient();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (patient) {
      reset({
        firstName: patient.firstName,
        lastName: patient.lastName,
        rut: patient.rut,
        birthDate: patient.birthDate,
        diagnosis: patient.diagnosis ?? '',
        phone: patient.phone,
        email: patient.email ?? '',
        address: patient.address ?? '',
        observations: patient.observations ?? '',
      });
      setServerError(null);
    }
  }, [patient, reset]);

  if (!patient) return null;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await updatePatient.mutateAsync({
        id: patient!.id,
        dto: { ...values, email: values.email || null },
      });
      toast.success('Paciente actualizado');
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerError('Ya existe otro paciente con ese RUT en el centro');
      } else {
        setServerError('No se pudo actualizar el paciente');
      }
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar paciente</DialogTitle>
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
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-rut">RUT</Label>
              <Input id="edit-rut" {...register('rut')} />
              {errors.rut && <p className="text-sm text-destructive">{errors.rut.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-birthDate">Fecha de nacimiento</Label>
              <Input id="edit-birthDate" type="date" max={today()} {...register('birthDate')} />
              {errors.birthDate && <p className="text-sm text-destructive">{errors.birthDate.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-diagnosis">Diagnóstico (opcional)</Label>
            <Input id="edit-diagnosis" {...register('diagnosis')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-phone">Teléfono del apoderado (WhatsApp)</Label>
              <Input id="edit-phone" {...register('phone')} />
              {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-email">Correo (opcional)</Label>
              <Input id="edit-email" type="email" {...register('email')} />
              {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-address">Dirección (opcional)</Label>
            <Input id="edit-address" {...register('address')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-observations">Observaciones (opcional)</Label>
            <Input id="edit-observations" {...register('observations')} />
          </div>
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
