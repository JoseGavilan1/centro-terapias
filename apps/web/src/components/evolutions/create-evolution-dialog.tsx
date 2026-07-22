'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import { useCreateEvolution } from '@/lib/hooks/use-evolutions';
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
import { Textarea } from '@/components/ui/textarea';

const today = () => new Date().toISOString().slice(0, 10);

const schema = z.object({
  date: z
    .string()
    .min(1, 'Obligatorio')
    .refine((value) => value <= today(), 'No puede ser una fecha futura'),
  observation: z.string().min(1, 'Obligatorio').max(5000),
  workPlan: z.string().min(1, 'Obligatorio').max(2000),
});

type FormValues = z.infer<typeof schema>;

export function CreateEvolutionDialog({
  open,
  onOpenChange,
  patientId,
  appointmentId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  /** Cita ATENDIDA propia que esta evolución documenta (opcional, ver Módulo 4 §1.2). */
  appointmentId?: string;
}) {
  const createEvolution = useCreateEvolution(patientId);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { date: today() } });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await createEvolution.mutateAsync({ ...values, appointmentId });
      toast.success('Evolución registrada');
      reset({ date: today(), observation: '', workPlan: '' });
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerError('Esta cita ya tiene una evolución asociada');
      } else {
        setServerError('No se pudo registrar la evolución');
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
          <DialogTitle>Nueva evolución</DialogTitle>
          <DialogDescription>
            Registro append-only: una vez guardada no se puede editar ni eliminar.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="evolution-date">Fecha</Label>
            <Input id="evolution-date" type="date" max={today()} {...register('date')} />
            {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="evolution-observation">Observación</Label>
            <Textarea id="evolution-observation" rows={4} {...register('observation')} />
            {errors.observation && (
              <p className="text-sm text-destructive">{errors.observation.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="evolution-workPlan">Plan de trabajo</Label>
            <Textarea id="evolution-workPlan" rows={3} {...register('workPlan')} />
            {errors.workPlan && (
              <p className="text-sm text-destructive">{errors.workPlan.message}</p>
            )}
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Registrar evolución'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
