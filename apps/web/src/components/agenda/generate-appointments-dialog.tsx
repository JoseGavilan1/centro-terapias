'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { ApiError } from '@/lib/api-client';
import { useGenerateAppointments } from '@/lib/hooks/use-appointments';
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

const schema = z
  .object({
    from: z.string().min(1, 'Obligatorio'),
    to: z.string().min(1, 'Obligatorio'),
  })
  .refine((values) => values.to >= values.from, {
    message: '"Hasta" debe ser posterior a "Desde"',
    path: ['to'],
  });

type FormValues = z.infer<typeof schema>;

export function GenerateAppointmentsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const generateAppointments = useGenerateAppointments();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { from: today() } });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      const result = await generateAppointments.mutateAsync(values);
      toast.success(`Se generaron ${result.created} citas nuevas (${result.skipped} ya existían)`);
      reset();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setServerError(error.message);
      } else {
        setServerError('No se pudieron generar las citas');
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
          <DialogTitle>Generar citas</DialogTitle>
          <DialogDescription>
            Crea las citas pendientes del rango a partir de las plantillas activas. No duplica citas
            ya generadas.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="from">Desde</Label>
              <Input id="from" type="date" {...register('from')} />
              {errors.from && <p className="text-sm text-destructive">{errors.from.message}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="to">Hasta (máximo 60 días)</Label>
              <Input id="to" type="date" {...register('to')} />
              {errors.to && <p className="text-sm text-destructive">{errors.to.message}</p>}
            </div>
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Generando…' : 'Generar citas'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
