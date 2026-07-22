export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface PageQuery {
  page?: number;
  pageSize?: number;
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Construye una respuesta paginada a partir de los datos de una página y el
 * total de registros. Única fuente de la fórmula de `totalPages` y de los
 * valores por defecto de `page`/`pageSize`, reutilizada por todo servicio
 * que exponga un listado paginado (evita que cada uno reimplemente el mismo
 * cálculo con el riesgo de que diverjan).
 */
export function paginate<T>(
  data: T[],
  total: number,
  query: { page?: number; pageSize?: number },
): Paginated<T> {
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? DEFAULT_PAGE_SIZE;
  return {
    data,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}
