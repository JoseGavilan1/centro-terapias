'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Download, Lock, Plus, ShieldAlert } from 'lucide-react';
import { DOCUMENT_CATEGORY_LABELS, DocumentDto, EvolutionDto, UserRole } from '@centro/shared';
import { ApiError } from '@/lib/api-client';
import { useCurrentUser } from '@/lib/hooks/use-current-user';
import { downloadDocument, useDocuments } from '@/lib/hooks/use-documents';
import { useEvolutions } from '@/lib/hooks/use-evolutions';
import { usePatient } from '@/lib/hooks/use-patients';
import { useUsers } from '@/lib/hooks/use-users';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { CreateEvolutionDialog } from '@/components/evolutions/create-evolution-dialog';
import { UploadDocumentDialog } from '@/components/documents/upload-document-dialog';

const PAGE_SIZE = 10;

export default function PatientDetailPage() {
  const params = useParams<{ id: string }>();
  const patientId = params.id;

  const { data: currentUser } = useCurrentUser();
  const isProfessional = currentUser?.role === UserRole.PROFESSIONAL;

  const { data: patient, error: patientError } = usePatient(patientId);
  const [page, setPage] = useState(1);
  const {
    data: evolutions,
    isLoading,
    isError,
  } = useEvolutions(patientId, { page, pageSize: PAGE_SIZE });
  const { data: professionals } = useUsers({ role: UserRole.PROFESSIONAL, pageSize: 100 });
  const [createOpen, setCreateOpen] = useState(false);

  const {
    data: documents,
    isLoading: documentsLoading,
    isError: documentsError,
  } = useDocuments(patientId, { page: 1, pageSize: 20 });
  const [uploadOpen, setUploadOpen] = useState(false);

  const authorNames = useMemo(() => {
    const map = new Map<string, string>();
    professionals?.data.forEach((p) => map.set(p.id, `${p.firstName} ${p.lastName}`));
    return map;
  }, [professionals]);

  if (patientError instanceof ApiError && patientError.status === 404) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-24 text-center text-muted-foreground">
        <ShieldAlert className="size-8" />
        <p className="font-medium text-foreground">Paciente no encontrado</p>
        <p className="max-w-sm text-sm">No existe, o no está dentro de sus pacientes asignados.</p>
        <Link href="/dashboard/pacientes" className="text-sm underline">
          Volver a Pacientes
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/dashboard/pacientes"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Volver a pacientes
      </Link>

      {!patient && <Skeleton className="h-24 w-full" />}
      {patient && (
        <Card>
          <CardHeader>
            <CardTitle>
              {patient.firstName} {patient.lastName}
            </CardTitle>
            <CardDescription>
              RUT {patient.rut} · {patient.phone}
              {patient.diagnosis ? ` · ${patient.diagnosis}` : ''}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Historial clínico</h2>
        {isProfessional && (
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            Nueva evolución
          </Button>
        )}
      </div>

      {isLoading && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <p className="text-sm text-destructive">No se pudo cargar el historial clínico.</p>
      )}

      {evolutions && evolutions.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin evoluciones registradas.</p>
      )}

      {evolutions && evolutions.data.length > 0 && (
        <>
          <div className="flex flex-col gap-3">
            {evolutions.data.map((evolution) => (
              <EvolutionCard
                key={evolution.id}
                evolution={evolution}
                authorName={authorNames.get(evolution.authorId)}
              />
            ))}
          </div>

          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Página {evolutions.page} de {Math.max(evolutions.totalPages, 1)} · {evolutions.total}{' '}
              evoluciones
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
                disabled={page >= evolutions.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </>
      )}

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Documentos</h2>
        {isProfessional && (
          <Button onClick={() => setUploadOpen(true)}>
            <Plus />
            Subir documento
          </Button>
        )}
      </div>

      {documentsLoading && <Skeleton className="h-16 w-full" />}
      {documentsError && (
        <p className="text-sm text-destructive">No se pudieron cargar los documentos.</p>
      )}
      {documents && documents.data.length === 0 && (
        <p className="text-sm text-muted-foreground">Sin documentos registrados.</p>
      )}
      {documents && documents.data.length > 0 && (
        <div className="flex flex-col gap-2">
          {documents.data.map((doc) => (
            <DocumentCard key={doc.id} document={doc} patientId={patientId} />
          ))}
        </div>
      )}

      <CreateEvolutionDialog open={createOpen} onOpenChange={setCreateOpen} patientId={patientId} />
      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        patientId={patientId}
        evolutions={evolutions?.data ?? []}
      />
    </div>
  );
}

function DocumentCard({ document: doc, patientId }: { document: DocumentDto; patientId: string }) {
  if (doc.redacted) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-3 text-muted-foreground">
          <Lock className="size-4" />
          <span className="text-sm font-medium text-foreground">
            Documento psicológico confidencial
          </span>
          <span className="text-xs">{doc.createdAt.slice(0, 10)}</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium">{doc.name}</span>
          <span className="text-xs text-muted-foreground">
            {DOCUMENT_CATEGORY_LABELS[doc.category]} · {doc.createdAt.slice(0, 10)}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => void downloadDocument(patientId, doc)}>
          <Download className="size-4" />
          Descargar
        </Button>
      </CardContent>
    </Card>
  );
}

function EvolutionCard({
  evolution,
  authorName,
}: {
  evolution: EvolutionDto;
  authorName?: string;
}) {
  // Defensa en profundidad (Módulo 4 §6.3): nunca renderiza observation/workPlan cuando
  // redacted=true, sin importar qué haya devuelto el backend en esos campos.
  if (evolution.redacted) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-3 py-4 text-muted-foreground">
          <Lock className="size-4" />
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">
              Contenido psicológico confidencial
            </span>
            <span className="text-xs">
              {evolution.date} · {authorName ?? 'Profesional'}
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{evolution.date}</CardTitle>
          <div className="flex gap-2">
            {evolution.confidentiality === 'PSYCHOLOGICAL' && (
              <Badge variant="secondary">Psicológica</Badge>
            )}
            {evolution.appointmentId && <Badge variant="outline">Vinculada a una atención</Badge>}
          </div>
        </div>
        <CardDescription>{authorName ?? 'Profesional'}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        {evolution.amendsId && (
          <p className="text-xs text-muted-foreground">Corrige una evolución anterior.</p>
        )}
        <p>
          <span className="font-medium">Observación: </span>
          {evolution.observation}
        </p>
        <p>
          <span className="font-medium">Plan de trabajo: </span>
          {evolution.workPlan}
        </p>
      </CardContent>
    </Card>
  );
}
