'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_MESSAGE,
  PASSWORD_POLICY_REGEX,
  ROLE_LABELS,
  SPECIALTY_LABELS,
} from '@centro/shared';
import { ApiError, apiClient } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

const schema = z.object({
  currentPassword: z.string().min(1, 'Obligatoria'),
  newPassword: z
    .string()
    .min(PASSWORD_MIN_LENGTH, `Mínimo ${PASSWORD_MIN_LENGTH} caracteres`)
    .regex(PASSWORD_POLICY_REGEX, PASSWORD_POLICY_MESSAGE),
});

type FormValues = z.infer<typeof schema>;

export default function ProfilePage() {
  return (
    <Suspense>
      <ProfileContent />
    </Suspense>
  );
}

function ProfileContent() {
  const { data: user, isLoading } = useCurrentUser();
  const searchParams = useSearchParams();
  const forcedChange = searchParams.get('cambiarClave') === '1';

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    try {
      await apiClient.post<void>('/auth/change-password', values);
      toast.success('Contraseña actualizada. Sus otras sesiones se cerraron.');
      reset();
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setError('currentPassword', { message: 'La contraseña actual no es correcta' });
      } else {
        toast.error('No se pudo cambiar la contraseña');
      }
    }
  }

  if (isLoading || !user) {
    return <Skeleton className="h-64 max-w-lg" />;
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Mi perfil</h1>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Datos personales</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            <span className="text-muted-foreground">Nombre:</span> {user.firstName} {user.lastName}
          </p>
          <p>
            <span className="text-muted-foreground">Correo:</span> {user.email}
          </p>
          <p>
            <span className="text-muted-foreground">Rol:</span> {ROLE_LABELS[user.role]}
          </p>
          {user.specialty && (
            <p>
              <span className="text-muted-foreground">Especialidad:</span> {SPECIALTY_LABELS[user.specialty]}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-lg">
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
          <CardDescription>
            {forcedChange
              ? 'Debe cambiar su contraseña temporal antes de continuar.'
              : 'Al cambiarla, se cerrarán sus otras sesiones activas.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div className="flex flex-col gap-2">
              <Label htmlFor="currentPassword">Contraseña actual</Label>
              <Input id="currentPassword" type="password" {...register('currentPassword')} />
              {errors.currentPassword && (
                <p className="text-sm text-destructive">{errors.currentPassword.message}</p>
              )}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="newPassword">Nueva contraseña</Label>
              <Input id="newPassword" type="password" {...register('newPassword')} />
              {errors.newPassword && <p className="text-sm text-destructive">{errors.newPassword.message}</p>}
            </div>
            <Button type="submit" disabled={isSubmitting} className="self-start">
              {isSubmitting ? 'Guardando…' : 'Cambiar contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
