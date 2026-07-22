'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { IncidentType, INCIDENT_TYPE_LABELS } from '@centro/shared';
import { useCreateIncident } from '@/lib/hooks/use-incidents';
import { usePatients } from '@/lib/hooks/use-patients';
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

const NONE = '__none__';
const nowLocal = () =>
  new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const schema = z.object({
  patientId: z.string().optional(),
  type: z.nativeEnum(IncidentType, { message: 'Obligatorio' }),
  description: z.string().min(1, 'Obligatorio').max(2000),
  occurredAt: z
    .string()
    .min(1, 'Obligatorio')
    .refine((value) => new Date(value).getTime() <= Date.now(), 'No puede ser una fecha futura'),
});

type FormValues = z.infer<typeof schema>;

export function CreateIncidentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createIncident = useCreateIncident();
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: patients } = usePatients({ isActive: 'true', pageSize: 100 });
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { occurredAt: nowLocal() },
  });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await createIncident.mutateAsync({
        ...values,
        patientId: values.patientId || undefined,
        occurredAt: new Date(values.occurredAt).toISOString(),
      });
      toast.success('Incidencia reportada; se notificó al administrador');
      reset({ occurredAt: nowLocal() });
      onOpenChange(false);
    } catch {
      setServerError('No se pudo reportar la incidencia');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset({ occurredAt: nowLocal() });
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reportar incidencia</DialogTitle>
          <DialogDescription>
            Violencia, abuso, accidentes o situaciones graves. Prioridad alta: se notifica de
            inmediato al administrador.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-2">
            <Label>Tipo</Label>
            <Select
              value={watch('type')}
              onValueChange={(value) => setValue('type', value as IncidentType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccione un tipo" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(IncidentType).map((type) => (
                  <SelectItem key={type} value={type}>
                    {INCIDENT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && <p className="text-sm text-destructive">{errors.type.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label>Paciente (opcional)</Label>
            <Select
              value={watch('patientId') ?? NONE}
              onValueChange={(value) => setValue('patientId', value === NONE ? undefined : value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sin paciente específico" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sin paciente específico</SelectItem>
                {patients?.data.map((patient) => (
                  <SelectItem key={patient.id} value={patient.id}>
                    {patient.firstName} {patient.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="occurredAt">Fecha y hora</Label>
            <Input id="occurredAt" type="datetime-local" {...register('occurredAt')} />
            {errors.occurredAt && (
              <p className="text-sm text-destructive">{errors.occurredAt.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Descripción</Label>
            <Textarea id="description" {...register('description')} />
            {errors.description && (
              <p className="text-sm text-destructive">{errors.description.message}</p>
            )}
          </div>
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Guardando…' : 'Reportar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
