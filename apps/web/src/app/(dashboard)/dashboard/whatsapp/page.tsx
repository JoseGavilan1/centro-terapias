'use client';

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Send } from 'lucide-react';
import { toast } from 'sonner';
import { WhatsAppMessageDirection } from '@centro/shared';
import { useRunReminders, useWhatsAppMessages } from '@/lib/hooks/use-whatsapp-messages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const PAGE_SIZE = 20;

const STATUS_BADGE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  QUEUED: 'secondary',
  SENT: 'default',
  DELIVERED: 'default',
  FAILED: 'destructive',
};

export default function WhatsAppMessagesPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, isError } = useWhatsAppMessages({ page, pageSize: PAGE_SIZE });
  const runReminders = useRunReminders();

  async function handleRunReminders() {
    try {
      const result = await runReminders.mutateAsync();
      toast.success(
        `Se enviaron ${result.sent} recordatorios (${result.skipped} ya estaban enviados)`,
      );
    } catch {
      toast.error('No se pudieron enviar los recordatorios');
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Mensajes WhatsApp</h1>
        <Button onClick={() => void handleRunReminders()} disabled={runReminders.isPending}>
          <Send />
          {runReminders.isPending ? 'Enviando…' : 'Enviar recordatorios ahora'}
        </Button>
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">No se pudo cargar el historial de mensajes.</p>
      )}

      {data && data.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin mensajes registrados.</p>
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead />
                <TableHead>Teléfono</TableHead>
                <TableHead>Plantilla / mensaje</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((message) => (
                <TableRow key={message.id}>
                  <TableCell>{new Date(message.createdAt).toLocaleString('es-CL')}</TableCell>
                  <TableCell>
                    {message.direction === WhatsAppMessageDirection.OUTBOUND ? (
                      <ArrowUpRight className="size-4 text-muted-foreground" />
                    ) : (
                      <ArrowDownLeft className="size-4 text-muted-foreground" />
                    )}
                  </TableCell>
                  <TableCell>{message.phone}</TableCell>
                  <TableCell className="max-w-64 truncate">
                    {message.templateKey ?? message.body}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_BADGE_VARIANT[message.status] ?? 'secondary'}>
                      {message.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Página {data.page} de {Math.max(data.totalPages, 1)} · {data.total} mensajes
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
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
