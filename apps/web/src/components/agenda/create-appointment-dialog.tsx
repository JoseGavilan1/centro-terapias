'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { UserRole } from '@centro/shared';
import { ApiError } from '@/lib/api-client';
import { useCreateAppointment } from '@/lib/hooks/use-appointments';
import { usePatients } from '@/lib/hooks/use-patients';
import { useUsers } from '@/lib/hooks/use-users';
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

const schema = z.object({
  patientId: z.string().min(1, 'Obligatorio'),
  professionalId: z.string().min(1, 'Obligatorio'),
  date: z.string().min(1, 'Obligatorio'),
  startTime: z.string().min(1, 'Obligatorio'),
  durationMinutes: z.coerce
    .number()
    .int()
    .min(15, 'Mínimo 15 minutos')
    .max(240, 'Máximo 240 minutos'),
  notes: z.string().max(500).optional(),
});

type FormValues = z.infer<typeof schema>;

export function CreateAppointmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createAppointment = useCreateAppointment();
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
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { durationMinutes: 45 },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await createAppointment.mutateAsync({ ...values, notes: values.notes || undefined });
      toast.success('Sobrecupo registrado');
      reset();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerError(
          'El horario se solapa con otra cita no cancelada del profesional o del paciente',
        );
      } else {
        setServerError('No se pudo registrar el sobrecupo');
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
          <DialogTitle>Nuevo sobrecupo</DialogTitle>
          <DialogDescription>
            Atención puntual fuera del horario fijo del paciente.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-2">
            <Label>Paciente</Label>
            <Select
              value={watch('patientId')}
              onValueChange={(value) => setValue('patientId', value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un paciente" />
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
                <SelectValue placeholder="Seleccione un profesional" />
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
              <Label htmlFor="appt-date">Fecha</Label>
              <Input id="appt-date" type="date" {...register('date')} />
              {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="appt-startTime">Hora</Label>
              <Input id="appt-startTime" type="time" {...register('startTime')} />
              {errors.startTime && (
                <p className="text-sm text-destructive">{errors.startTime.message}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="appt-durationMinutes">Duración (minutos)</Label>
            <Input
              id="appt-durationMinutes"
              type="number"
              min={15}
              max={240}
              {...register('durationMinutes')}
            />
            {errors.durationMinutes && (
              <p className="text-sm text-destructive">{errors.durationMinutes.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="appt-notes">Notas (opcional)</Label>
            <Input id="appt-notes" {...register('notes')} />
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Registrar sobrecupo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
