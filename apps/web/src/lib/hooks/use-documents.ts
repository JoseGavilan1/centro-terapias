import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateDocumentMetadata, DocumentDto, DocumentsQuery, Paginated } from '@centro/shared';
import { apiClient } from '@/lib/api-client';

const DOCUMENTS_KEY = 'documents';

export function useDocuments(patientId: string, query: DocumentsQuery) {
  return useQuery({
    queryKey: [DOCUMENTS_KEY, patientId, query],
    queryFn: () =>
      apiClient.get<Paginated<DocumentDto>>(`/patients/${patientId}/documents`, {
        page: query.page,
        pageSize: query.pageSize,
      }),
    enabled: !!patientId,
  });
}

export function useUploadDocument(patientId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, metadata }: { file: File; metadata: CreateDocumentMetadata }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('category', metadata.category);
      if (metadata.evolutionId) {
        formData.append('evolutionId', metadata.evolutionId);
      }
      return apiClient.postForm<DocumentDto>(`/patients/${patientId}/documents`, formData);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [DOCUMENTS_KEY, patientId] }),
  });
}

/** Descarga imperativa (no es una query): pide el binario proxeado y dispara la descarga del navegador. */
export async function downloadDocument(patientId: string, doc: DocumentDto): Promise<void> {
  if (!doc.name) return;
  const blob = await apiClient.downloadBlob(`/patients/${patientId}/documents/${doc.id}/download`);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = doc.name;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
