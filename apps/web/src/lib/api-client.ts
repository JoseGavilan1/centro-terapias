/**
 * Cliente HTTP hacia la API propia (/api/v1/*), reescrita por Next hacia el
 * backend NestJS (ADR-06). Las cookies httpOnly viajan automáticamente al ser
 * same-origin; este cliente solo se preocupa de reintentar una vez tras un
 * refresh silencioso cuando el access token expiró.
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const API_PREFIX = '/api/v1';

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  refreshPromise ??= fetch(`${API_PREFIX}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then((res) => res.ok)
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Evita el reintento automático tras 401 (usado por el propio login/refresh). */
  skipAuthRetry?: boolean;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_PREFIX}${path}`, 'http://placeholder.local');
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return `${url.pathname}${url.search}`;
}

/** GET/POST/PATCH/DELETE con reintento tras un refresh silencioso ante un 401. Común a request(), requestForm() y downloadBlob(). */
async function fetchWithAuthRetry(url: string, init: RequestInit): Promise<Response> {
  let response = await fetch(url, init);
  if (response.status === 401) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await fetch(url, init);
    }
  }
  return response;
}

async function throwIfError(response: Response): Promise<void> {
  if (response.ok) return;
  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : undefined;
  const message =
    (payload && typeof payload === 'object' && 'message' in payload
      ? String((payload as { message: unknown }).message)
      : undefined) ?? 'Error inesperado';
  throw new ApiError(response.status, message, payload);
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const url = buildUrl(path, options.query);
  const doFetch = () =>
    fetch(url, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });

  let response = await doFetch();

  if (response.status === 401 && !options.skipAuthRetry) {
    const refreshed = await tryRefresh();
    if (refreshed) {
      response = await doFetch();
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const isJson = response.headers.get('content-type')?.includes('application/json');
  const payload = isJson ? await response.json() : undefined;

  if (!response.ok) {
    const message =
      (payload && typeof payload === 'object' && 'message' in payload
        ? String((payload as { message: unknown }).message)
        : undefined) ?? 'Error inesperado';
    throw new ApiError(response.status, message, payload);
  }

  return payload as T;
}

/**
 * `multipart/form-data` (subida de documentos, Módulo 5): nunca fija `Content-Type` a mano
 * para que el navegador agregue el boundary correcto.
 */
async function requestForm<T>(path: string, formData: FormData): Promise<T> {
  const url = buildUrl(path);
  const response = await fetchWithAuthRetry(url, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  });
  await throwIfError(response);
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Descarga binaria (Módulo 5): el proxy de confidencialidad vive en la API, nunca en una URL directa del proveedor. */
async function downloadBlob(path: string): Promise<Blob> {
  const url = buildUrl(path);
  const response = await fetchWithAuthRetry(url, { method: 'GET', credentials: 'include' });
  await throwIfError(response);
  return response.blob();
}

export const apiClient = {
  get: <T>(path: string, query?: RequestOptions['query']) =>
    request<T>(path, { method: 'GET', query }),
  post: <T>(path: string, body?: unknown, options?: Pick<RequestOptions, 'skipAuthRetry'>) =>
    request<T>(path, { method: 'POST', body, ...options }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  postForm: <T>(path: string, formData: FormData) => requestForm<T>(path, formData),
  downloadBlob: (path: string) => downloadBlob(path),
};
