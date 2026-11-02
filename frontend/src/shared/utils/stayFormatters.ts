import { calculateNights } from '../../features/reservations/services/reservationService';

/**
 * Formatea de forma determinista la cantidad de noches.
 * Previene el error operativo reportado por Diego donde se mostraba "→ noche →" sin cantidad.
 */
export function formatNights(
  noches: number | undefined | null,
  ingreso?: string,
  salida?: string
): string {
  let count = Number(noches);
  if (isNaN(count)) {
    if (ingreso && salida) {
      count = calculateNights(ingreso, salida);
    }
  }
  if (isNaN(count) || count < 0) {
    count = 0;
  }
  return `${count} noche${count === 1 ? '' : 's'}`;
}

/**
 * Formatea de forma segura un horario en formato HH:mm.
 * Acepta HH:mm, H:mm o HH:mm:ss y normaliza a HH:mm.
 * Para reservas históricas donde el valor es nulo o vacío, devuelve explícitamente el fallback
 * en lugar de inventar una hora que el operador no ingresó.
 */
export function formatTimeHHmm(
  time: string | undefined | null,
  fallback = 'No especificado'
): string {
  if (!time || typeof time !== 'string' || time.trim() === '') {
    return fallback;
  }
  const trimmed = time.trim();
  const timeMatch = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?$/);
  if (timeMatch) {
    const h = timeMatch[1].padStart(2, '0');
    const m = timeMatch[2];
    return `${h}:${m}`;
  }
  return trimmed;
}

/**
 * Formatea fechas tipo YYYY-MM-DD o ISO strings evitando el desfase de zona horaria
 * y previniendo la visualización de "Invalid Date".
 */
export function formatDisplayDate(
  dateStr: string | undefined | null,
  fallback = 'Fecha no disponible'
): string {
  if (!dateStr || typeof dateStr !== 'string' || dateStr.trim() === '') {
    return fallback;
  }

  const clean = dateStr.trim();
  // Caso estándar YYYY-MM-DD
  const ymdMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    const [, year, month, day] = ymdMatch;
    return `${day}/${month}/${year}`;
  }

  // Intento seguro con Date
  const d = new Date(clean);
  if (isNaN(d.getTime())) {
    return fallback;
  }

  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formatea la etiqueta de canal evitando etiquetas vacías ("Canal: ").
 */
export function formatChannelLabel(
  origen: string | undefined | null,
  fallback = 'Canal Directo'
): string {
  if (!origen || typeof origen !== 'string' || origen.trim() === '') {
    return fallback;
  }
  const clean = origen.trim().toUpperCase();
  switch (clean) {
    case 'AIRBNB':
      return 'Airbnb';
    case 'BOOKING':
    case 'BOOKING.COM':
      return 'Booking.com';
    case 'VRBO':
      return 'VRBO';
    case 'WEB':
      return 'Web';
    case 'DIRECTO':
      return 'Directo';
    default:
      return origen.trim();
  }
}
