'use client';

import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { useOrganization, useUpdateOrganization } from '@/lib/hooks/use-organization';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

const schema = z.object({
  name: z.string().min(1, 'Obligatorio'),
  legalId: z.string().optional(),
  timezone: z.string().min(1, 'Obligatorio'),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Correo inválido').optional().or(z.literal('')),
  whatsappPhoneNumberId: z.string().optional(),
  googleFormsUrl: z.string().url('URL inválida').optional().or(z.literal('')),
  waitlistIntakeToken: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function OrganizationPage() {
  const { data: organization, isLoading } = useOrganization();
  const updateOrganization = useUpdateOrganization();
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (organization) {
      reset({
        name: organization.name,
        legalId: organization.legalId ?? '',
        timezone: organization.timezone,
        address: organization.address ?? '',
        phone: organization.phone ?? '',
        email: organization.email ?? '',
        whatsappPhoneNumberId: organization.whatsappPhoneNumberId ?? '',
        googleFormsUrl: organization.googleFormsUrl ?? '',
        waitlistIntakeToken: organization.waitlistIntakeToken ?? '',
      });
    }
  }, [organization, reset]);

  async function onSubmit(values: FormValues) {
    try {
      await updateOrganization.mutateAsync({
        ...values,
        legalId: values.legalId?.trim() || null,
        address: values.address?.trim() || null,
        phone: values.phone?.trim() || null,
        email: values.email || undefined,
        whatsappPhoneNumberId: values.whatsappPhoneNumberId?.trim() || null,
        googleFormsUrl: values.googleFormsUrl?.trim() || null,
        waitlistIntakeToken: values.waitlistIntakeToken?.trim() || null,
      });
      toast.success('Datos del centro actualizados');
    } catch {
      toast.error('No se pudo actualizar el centro');
    }
  }

  if (isLoading || !organization) {
    return <Skeleton className="h-64 max-w-lg" />;
  }

  return (
    <Card className="max-w-lg">
      <CardHeader>
        <CardTitle>Datos del centro</CardTitle>
        <CardDescription>
          Esta información aparece en las comunicaciones del sistema.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="name">Nombre</Label>
            <Input id="name" {...register('name')} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="legalId">RUT / identificador legal</Label>
            <Input id="legalId" {...register('legalId')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="timezone">Zona horaria</Label>
            <Input id="timezone" {...register('timezone')} />
            {errors.timezone && (
              <p className="text-sm text-destructive">{errors.timezone.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="address">Dirección</Label>
            <Input id="address" {...register('address')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone">Teléfono</Label>
            <Input id="phone" {...register('phone')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Correo de contacto</Label>
            <Input id="email" type="email" {...register('email')} />
            {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="whatsappPhoneNumberId">
              Número de WhatsApp Business (phone_number_id)
            </Label>
            <Input id="whatsappPhoneNumberId" {...register('whatsappPhoneNumberId')} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="googleFormsUrl">Enlace del formulario de admisión (Google Forms)</Label>
            <Input id="googleFormsUrl" type="url" {...register('googleFormsUrl')} />
            {errors.googleFormsUrl && (
              <p className="text-sm text-destructive">{errors.googleFormsUrl.message}</p>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="waitlistIntakeToken">Token de ingreso (lista de espera)</Label>
            <div className="flex gap-2">
              <Input id="waitlistIntakeToken" readOnly {...register('waitlistIntakeToken')} />
              <Button
                type="button"
                variant="outline"
                onClick={() => setValue('waitlistIntakeToken', crypto.randomUUID())}
              >
                Generar nuevo
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Se pega en el Apps Script del Google Form de admisión. Regenerarlo invalida el
              anterior — hay que actualizar el script.
            </p>
          </div>
          <Button type="submit" disabled={isSubmitting} className="mt-2 self-start">
            {isSubmitting ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
