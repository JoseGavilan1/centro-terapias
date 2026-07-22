'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { isValidRut, Specialty, SPECIALTY_LABELS } from '@centro/shared';
import { useCreateWaitlistEntry } from '@/lib/hooks/use-waitlist';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const today = () => new Date().toISOString().slice(0, 10);
const NONE = '__none__';

const schema = z.object({
  childFirstName: z.string().min(1, 'Obligatorio'),
  childLastName: z.string().min(1, 'Obligatorio'),
  childRut: z
    .string()
    .optional()
    .refine((value) => !value || isValidRut(value), 'RUT inválido'),
  childBirthDate: z
    .string()
    .optional()
    .refine((value) => !value || value <= today(), 'No puede ser una fecha futura'),
  guardianName: z.string().min(1, 'Obligatorio'),
  guardianPhone: z.string().min(6, 'Obligatorio'),
  guardianEmail: z.string().email('Correo inválido').optional().or(z.literal('')),
  requestedSpecialty: z.nativeEnum(Specialty).optional(),
  reason: z.string().max(1000).optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateWaitlistEntryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createEntry = useCreateWaitlistEntry();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await createEntry.mutateAsync({
        ...values,
        childRut: values.childRut || undefined,
        childBirthDate: values.childBirthDate || undefined,
        guardianEmail: values.guardianEmail || undefined,
        reason: values.reason || undefined,
      });
      toast.success('Entrada registrada en la lista de espera');
      reset();
      onOpenChange(false);
    } catch {
      setServerError('No se pudo registrar la entrada');
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
          <DialogTitle>Nueva entrada en lista de espera</DialogTitle>
          <DialogDescription>
            Registro manual (consulta telefónica o presencial, no llegada por el formulario).
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="childFirstName">Nombre del niño/a</Label>
              <Input id="childFirstName" {...register('childFirstName')} />
              {errors.childFirstName && (
                <p className="text-sm text-destructive">{errors.childFirstName.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="childLastName">Apellido del niño/a</Label>
              <Input id="childLastName" {...register('childLastName')} />
              {errors.childLastName && (
                <p className="text-sm text-destructive">{errors.childLastName.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="childRut">RUT del niño/a (opcional)</Label>
              <Input id="childRut" placeholder="12.345.678-5" {...register('childRut')} />
              {errors.childRut && (
                <p className="text-sm text-destructive">{errors.childRut.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="childBirthDate">Fecha de nacimiento (opcional)</Label>
              <Input
                id="childBirthDate"
                type="date"
                max={today()}
                {...register('childBirthDate')}
              />
              {errors.childBirthDate && (
                <p className="text-sm text-destructive">{errors.childBirthDate.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="guardianName">Nombre del apoderado</Label>
              <Input id="guardianName" {...register('guardianName')} />
              {errors.guardianName && (
                <p className="text-sm text-destructive">{errors.guardianName.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="guardianPhone">Teléfono del apoderado</Label>
              <Input id="guardianPhone" {...register('guardianPhone')} />
              {errors.guardianPhone && (
                <p className="text-sm text-destructive">{errors.guardianPhone.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="guardianEmail">Correo del apoderado (opcional)</Label>
              <Input id="guardianEmail" type="email" {...register('guardianEmail')} />
              {errors.guardianEmail && (
                <p className="text-sm text-destructive">{errors.guardianEmail.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label>Especialidad solicitada (opcional)</Label>
              <Select
                value={watch('requestedSpecialty') ?? NONE}
                onValueChange={(value) =>
                  setValue('requestedSpecialty', value === NONE ? undefined : (value as Specialty))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sin especificar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sin especificar</SelectItem>
                  {Object.values(Specialty).map((specialty) => (
                    <SelectItem key={specialty} value={specialty}>
                      {SPECIALTY_LABELS[specialty]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reason">Motivo de consulta (opcional)</Label>
            <Textarea id="reason" {...register('reason')} />
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Registrar entrada'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
