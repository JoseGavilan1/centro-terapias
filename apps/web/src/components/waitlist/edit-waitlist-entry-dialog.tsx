'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { isValidRut, Specialty, SPECIALTY_LABELS, WaitlistEntryDto } from '@centro/shared';
import { ApiError } from '@/lib/api-client';
import { useUpdateWaitlistEntry } from '@/lib/hooks/use-waitlist';
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
  sede: z.string().max(100).optional(),
});

type FormValues = z.infer<typeof schema>;

export function EditWaitlistEntryDialog({
  entry,
  onOpenChange,
}: {
  entry: WaitlistEntryDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const updateEntry = useUpdateWaitlistEntry();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (entry) {
      reset({
        childFirstName: entry.childFirstName,
        childLastName: entry.childLastName,
        childRut: entry.childRut ?? '',
        childBirthDate: entry.childBirthDate ?? '',
        guardianName: entry.guardianName,
        guardianPhone: entry.guardianPhone,
        guardianEmail: entry.guardianEmail ?? '',
        requestedSpecialty: entry.requestedSpecialty ?? undefined,
        reason: entry.reason ?? '',
        sede: entry.sede ?? '',
      });
      setServerError(null);
    }
  }, [entry, reset]);

  if (!entry) return null;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await updateEntry.mutateAsync({
        id: entry!.id,
        dto: {
          ...values,
          childRut: values.childRut || undefined,
          childBirthDate: values.childBirthDate || undefined,
          guardianEmail: values.guardianEmail || undefined,
          reason: values.reason || undefined,
          sede: values.sede || undefined,
        },
      });
      toast.success('Entrada actualizada');
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerError('Solo se puede editar una entrada mientras está pendiente');
      } else {
        setServerError('No se pudo actualizar la entrada');
      }
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar entrada</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-childFirstName">Nombre del niño/a</Label>
              <Input id="edit-childFirstName" {...register('childFirstName')} />
              {errors.childFirstName && (
                <p className="text-sm text-destructive">{errors.childFirstName.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-childLastName">Apellido del niño/a</Label>
              <Input id="edit-childLastName" {...register('childLastName')} />
              {errors.childLastName && (
                <p className="text-sm text-destructive">{errors.childLastName.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-childRut">RUT del niño/a (opcional)</Label>
              <Input id="edit-childRut" {...register('childRut')} />
              {errors.childRut && (
                <p className="text-sm text-destructive">{errors.childRut.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-childBirthDate">Fecha de nacimiento (opcional)</Label>
              <Input
                id="edit-childBirthDate"
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
              <Label htmlFor="edit-guardianName">Nombre del apoderado</Label>
              <Input id="edit-guardianName" {...register('guardianName')} />
              {errors.guardianName && (
                <p className="text-sm text-destructive">{errors.guardianName.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-guardianPhone">Teléfono del apoderado</Label>
              <Input id="edit-guardianPhone" {...register('guardianPhone')} />
              {errors.guardianPhone && (
                <p className="text-sm text-destructive">{errors.guardianPhone.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-guardianEmail">Correo del apoderado (opcional)</Label>
              <Input id="edit-guardianEmail" type="email" {...register('guardianEmail')} />
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
            <Label htmlFor="edit-sede">Sede (opcional)</Label>
            <Input id="edit-sede" {...register('sede')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-reason">Motivo de consulta (opcional)</Label>
            <Textarea id="edit-reason" {...register('reason')} />
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
