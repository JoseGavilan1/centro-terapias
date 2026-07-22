'use client';

import { ROLE_LABELS, SPECIALTY_LABELS } from '@centro/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCurrentUser } from '@/lib/hooks/use-current-user';

export default function DashboardHomePage() {
  const { data: user } = useCurrentUser();
  if (!user) return null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Hola, {user.firstName}</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Tu cuenta</CardTitle>
          <CardDescription>{user.organizationName}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1 text-sm">
          <p>
            <span className="text-muted-foreground">Rol:</span> {ROLE_LABELS[user.role]}
          </p>
          {user.specialty && (
            <p>
              <span className="text-muted-foreground">Especialidad:</span>{' '}
              {SPECIALTY_LABELS[user.specialty]}
            </p>
          )}
          <p>
            <span className="text-muted-foreground">Correo:</span> {user.email}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
