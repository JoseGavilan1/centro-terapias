'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import {
  ALLOWED_DOCUMENT_MIME_TYPES,
  DOCUMENT_CATEGORY_LABELS,
  DocumentCategory,
  EvolutionDto,
} from '@centro/shared';
import { ApiError } from '@/lib/api-client';
import { useUploadDocument } from '@/lib/hooks/use-documents';
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

const schema = z.object({
  category: z.nativeEnum(DocumentCategory, { message: 'Obligatorio' }),
  evolutionId: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export function UploadDocumentDialog({
  open,
  onOpenChange,
  patientId,
  evolutions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  evolutions: EvolutionDto[];
}) {
  const uploadDocument = useUploadDocument(patientId);
  const [file, setFile] = useState<File | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    if (!file) {
      setServerError('Debe seleccionar un archivo');
      return;
    }
    try {
      await uploadDocument.mutateAsync({
        file,
        metadata: { category: values.category, evolutionId: values.evolutionId || undefined },
      });
      toast.success('Documento subido');
      reset();
      setFile(null);
      onOpenChange(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setServerError(error.message);
      } else {
        setServerError('No se pudo subir el documento');
      }
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          reset();
          setFile(null);
        }
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir documento</DialogTitle>
          <DialogDescription>PDF o imagen, hasta 15 MB.</DialogDescription>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="document-file">Archivo</Label>
            <Input
              id="document-file"
              type="file"
              accept={ALLOWED_DOCUMENT_MIME_TYPES.join(',')}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Categoría</Label>
            <Select
              value={watch('category')}
              onValueChange={(value) => setValue('category', value as DocumentCategory)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Seleccione una categoría" />
              </SelectTrigger>
              <SelectContent>
                {Object.values(DocumentCategory).map((category) => (
                  <SelectItem key={category} value={category}>
                    {DOCUMENT_CATEGORY_LABELS[category]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category && (
              <p className="text-sm text-destructive">{errors.category.message}</p>
            )}
          </div>
          {evolutions.length > 0 && (
            <div className="flex flex-col gap-2">
              <Label>Vincular a una evolución (opcional)</Label>
              <Select
                value={watch('evolutionId') ?? ''}
                onValueChange={(value) => setValue('evolutionId', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Ninguna" />
                </SelectTrigger>
                <SelectContent>
                  {evolutions.map((evolution) => (
                    <SelectItem key={evolution.id} value={evolution.id}>
                      {evolution.date}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {serverError && <p className="text-sm text-destructive">{serverError}</p>}
          <DialogFooter>
            <Button type="submit" disabled={isSubmitting || uploadDocument.isPending}>
              {isSubmitting || uploadDocument.isPending ? 'Subiendo…' : 'Subir documento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
