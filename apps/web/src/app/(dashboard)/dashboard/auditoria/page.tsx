'use client';

import { useState } from 'react';
import { useAuditLogs } from '@/lib/hooks/use-audit-logs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const PAGE_SIZE = 20;

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Creación',
  UPDATE: 'Modificación',
  DELETE: 'Desactivación',
  LOGIN: 'Inicio de sesión',
  LOGIN_FAILED: 'Inicio de sesión fallido',
  LOGOUT: 'Cierre de sesión',
  TOKEN_REFRESH: 'Renovación de sesión',
  TOKEN_REUSE_DETECTED: 'Reuso de token detectado',
  PASSWORD_CHANGE: 'Cambio de contraseña',
  PASSWORD_RESET: 'Restablecimiento de contraseña',
};

export default function AuditLogsPage() {
  const [entity, setEntity] = useState('');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useAuditLogs({ entity: entity || undefined, page, pageSize: PAGE_SIZE });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Auditoría</h1>
      <Input
        placeholder="Filtrar por entidad (p. ej. User, Organization)…"
        className="max-w-xs"
        value={entity}
        onChange={(e) => {
          setEntity(e.target.value);
          setPage(1);
        }}
      />

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {isError && <p className="text-sm text-destructive">No se pudo cargar el registro de auditoría.</p>}

      {data && data.data.length === 0 && (
        <p className="text-sm text-muted-foreground">No hay registros que coincidan con el filtro.</p>
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Acción</TableHead>
                <TableHead>Entidad</TableHead>
                <TableHead>IP</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{new Date(log.createdAt).toLocaleString('es-CL')}</TableCell>
                  <TableCell>{log.userEmail ?? '—'}</TableCell>
                  <TableCell>{ACTION_LABELS[log.action] ?? log.action}</TableCell>
                  <TableCell>
                    {log.entity}
                    {log.entityId ? ` · ${log.entityId.slice(0, 8)}` : ''}
                  </TableCell>
                  <TableCell>{log.ip ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Página {data.page} de {Math.max(data.totalPages, 1)} · {data.total} registros
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
