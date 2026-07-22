/**
 * RUT chileno (Rol Único Tributario). Formato canónico usado en todo el
 * sistema: "12345678-9" (sin puntos, con guion, dígito verificador en
 * mayúscula si es 'K'). Validado con el algoritmo módulo 11 estándar.
 */

const RUT_BODY_MIN_DIGITS = 7;
const RUT_BODY_MAX_DIGITS = 8;
const MODULO_11_INITIAL_MULTIPLIER = 2;
const MODULO_11_MAX_MULTIPLIER = 7;

/** Quita puntos/espacios y normaliza a "XXXXXXXX-Y". No valida el dígito verificador. */
export function normalizeRut(raw: string): string {
  const clean = raw.replace(/[^0-9kK]/g, '').toUpperCase();
  if (clean.length < 2) {
    return clean;
  }
  const body = clean.slice(0, -1);
  const checkDigit = clean.slice(-1);
  return `${body}-${checkDigit}`;
}

function computeCheckDigit(body: string): string {
  let sum = 0;
  let multiplier = MODULO_11_INITIAL_MULTIPLIER;
  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === MODULO_11_MAX_MULTIPLIER ? MODULO_11_INITIAL_MULTIPLIER : multiplier + 1;
  }
  const remainder = 11 - (sum % 11);
  if (remainder === 11) return '0';
  if (remainder === 10) return 'K';
  return String(remainder);
}

/** true si `raw` (en cualquier formato con o sin puntos/guion) es un RUT chileno válido. */
export function isValidRut(raw: string): boolean {
  const normalized = normalizeRut(raw);
  const match = new RegExp(`^(\\d{${RUT_BODY_MIN_DIGITS},${RUT_BODY_MAX_DIGITS}})-([0-9K])$`).exec(normalized);
  if (!match) {
    return false;
  }
  const [, body, checkDigit] = match;
  return computeCheckDigit(body) === checkDigit;
}
