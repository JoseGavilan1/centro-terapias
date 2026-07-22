'use client';

import { useMemo, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { isValidRut, UserRole, WaitlistEntryDto, WEEKDAY_LABELS, Weekday } from '@centro/shared';
import { ApiError } from '@/lib/api-client';
import { useUsers } from '@/lib/hooks/use-users';
import { useAssignWaitlistEntry } from '@/lib/hooks/use-waitlist';
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

const today = () => new Date().toISOString().slice(0, 10);

function buildSchema(needsRut: boolean, needsBirthDate: boolean) {
  return z.object({
    professionalId: z.string().min(1, 'Obligatorio'),
    weekday: z.nativeEnum(Weekday, { message: 'Obligatorio' }),
    startTime: z.string().min(1, 'Obligatorio'),
    durationMinutes: z.coerce
      .number()
      .int()
      .min(15, 'Mínimo 15 minutos')
      .max(240, 'Máximo 240 minutos'),
    validFrom: z.string().min(1, 'Obligatorio'),
    sede: z.string().max(100).optional(),
    rut: z
      .string()
      .optional()
      .refine(
        (value) => (needsRut ? !!value && isValidRut(value) : !value || isValidRut(value)),
        'RUT inválido',
      ),
    birthDate: z
      .string()
      .optional()
      .refine((value) => (needsBirthDate ? !!value : true), 'Obligatorio')
      .refine((value) => !value || value <= today(), 'No puede ser una fecha futura'),
  });
}

type FormValues = z.infer<ReturnType<typeof buildSchema>>;

export function AssignWaitlistEntryDialog({
  entry,
  onOpenChange,
}: {
  entry: WaitlistEntryDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const assignEntry = useAssignWaitlistEntry();
  const [serverError, setServerError] = useState<string | null>(null);
  const { data: professionals } = useUsers({
    role: UserRole.PROFESSIONAL,
    isActive: 'true',
    pageSize: 100,
  });

  const needsRut = !entry?.childRut;
  const needsBirthDate = !entry?.childBirthDate;
  const schema = useMemo(() => buildSchema(needsRut, needsBirthDate), [needsRut, needsBirthDate]);

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

  if (!entry) return null;

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await assignEntry.mutateAsync({
        id: entry!.id,
        dto: {
          ...values,
          sede: values.sede || undefined,
          rut: values.rut || undefined,
          birthDate: values.birthDate || undefined,
        },
      });
      toast.success('Entrada asignada: paciente y horario creados');
      reset();
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setServerError(
          'Ya existe un paciente con ese RUT, o el horario se solapa con otra plantilla activa',
        );
      } else if (error instanceof ApiError && error.status === 400) {
        setServerError(error.message);
      } else {
        setServerError('No se pudo asignar la entrada');
      }
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Asignar entrada</DialogTitle>
          <DialogDescription>
            {entry.childFirstName} {entry.childLastName}: crea el paciente y su horario fijo en un
            solo paso.
          </DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
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
              <Label>Día de la semana</Label>
              <Select
                value={watch('weekday')}
                onValueChange={(value) => setValue('weekday', value as Weekday)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione un día" />
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
              <Label htmlFor="assign-startTime">Hora</Label>
              <Input id="assign-startTime" type="time" {...register('startTime')} />
              {errors.startTime && (
                <p className="text-sm text-destructive">{errors.startTime.message}</p>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="assign-durationMinutes">Duración (minutos)</Label>
              <Input
                id="assign-durationMinutes"
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
              <Label htmlFor="assign-validFrom">Vigente desde</Label>
              <Input id="assign-validFrom" type="date" {...register('validFrom')} />
              {errors.validFrom && (
                <p className="text-sm text-destructive">{errors.validFrom.message}</p>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="assign-sede">Sede (opcional)</Label>
            <Input id="assign-sede" {...register('sede')} />
          </div>
          {(needsRut || needsBirthDate) && (
            <div className="grid grid-cols-2 gap-4 rounded-md border border-dashed p-3">
              {needsRut && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="assign-rut">RUT del niño/a</Label>
                  <Input id="assign-rut" placeholder="12.345.678-5" {...register('rut')} />
                  {errors.rut && <p className="text-sm text-destructive">{errors.rut.message}</p>}
                </div>
              )}
              {needsBirthDate && (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="assign-birthDate">Fecha de nacimiento</Label>
                  <Input
                    id="assign-birthDate"
                    type="date"
                    max={today()}
                    {...register('birthDate')}
                  />
                  {errors.birthDate && (
                    <p className="text-sm text-destructive">{errors.birthDate.message}</p>
                  )}
                </div>
              )}
            </div>
          )}
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Asignando…' : 'Asignar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
