'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { TherapySlotDto, UserRole, WEEKDAY_LABELS, Weekday } from '@centro/shared';
import { ApiError } from '@/lib/api-client';
import { usePatients } from '@/lib/hooks/use-patients';
import { useUpdateTherapySlot } from '@/lib/hooks/use-therapy-slots';
import { useUsers } from '@/lib/hooks/use-users';
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

const schema = z.object({
  patientId: z.string().min(1, 'Obligatorio'),
  professionalId: z.string().min(1, 'Obligatorio'),
  weekday: z.nativeEnum(Weekday, { message: 'Obligatorio' }),
  startTime: z.string().min(1, 'Obligatorio'),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(15, 'Mínimo 15 minutos')
    .max(240, 'Máximo 240 minutos'),
  validFrom: z.string().min(1, 'Obligatorio'),
  validTo: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function EditTherapySlotDialog({
  slot,
  onOpenChange,
}: {
  slot: TherapySlotDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const updateSlot = useUpdateTherapySlot();
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: patients } = usePatients({ isActive: 'true', pageSize: 100 });
  const { data: professionals } = useUsers({
    role: UserRole.PROFESSIONAL,
    isActive: 'true',
    pageSize: 100,
  });
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (slot) {
      reset({
        patientId: slot.patientId,
        professionalId: slot.professionalId,
        weekday: slot.weekday,
        startTime: slot.startTime,
        durationMinutes: slot.durationMinutes,
        validFrom: slot.validFrom,
        validTo: slot.validTo ?? '',
      });
      setServerError(null);
    }
  }, [slot, reset]);

  if (!slot) return null;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await updateSlot.mutateAsync({
        id: slot!.id,
        dto: { ...values, validTo: values.validTo || null },
      });
      toast.success('Plantilla actualizada');
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerError(
          'El horario se solapa con otra plantilla activa del mismo profesional o paciente',
        );
      } else if (error instanceof ApiError && error.status === 400) {
        setServerError(error.message);
      } else {
        setServerError('No se pudo actualizar la plantilla');
      }
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar plantilla de horario</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-2">
            <Label>Paciente</Label>
            <Select
              value={watch('patientId')}
              onValueChange={(value) => setValue('patientId', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {patients?.data.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.firstName} {patient.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.patientId && (
              <p className="text-sm text-destructive">{errors.patientId.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label>Profesional</Label>
            <Select
              value={watch('professionalId')}
              onValueChange={(value) => setValue('professionalId', value)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {professionals?.data.map((professional) => (
                  <SelectItem key={professional.id} value={professional.id}>
                    {professional.firstName} {professional.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.professionalId && (
              <p className="text-sm text-destructive">{errors.professionalId.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label>Día de la semana</Label>
              <Select
                value={watch('weekday')}
                onValueChange={(value) => setValue('weekday', value as Weekday)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Weekday).map((weekday) => (
                    <SelectItem key={weekday} value={weekday}>
                      {WEEKDAY_LABELS[weekday]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.weekday && (
                <p className="text-sm text-destructive">{errors.weekday.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-startTime">Hora</Label>
              <Input id="edit-startTime" type="time" {...register('startTime')} />
              {errors.startTime && (
                <p className="text-sm text-destructive">{errors.startTime.message}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="edit-durationMinutes">Duración (minutos)</Label>
            <Input
              id="edit-durationMinutes"
              type="number"
              min={15}
              max={240}
              {...register('durationMinutes')}
            />
            {errors.durationMinutes && (
              <p className="text-sm text-destructive">{errors.durationMinutes.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-validFrom">Vigente desde</Label>
              <Input id="edit-validFrom" type="date" {...register('validFrom')} />
              {errors.validFrom && (
                <p className="text-sm text-destructive">{errors.validFrom.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-validTo">Vigente hasta (opcional)</Label>
              <Input id="edit-validTo" type="date" {...register('validTo')} />
            </div>
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
