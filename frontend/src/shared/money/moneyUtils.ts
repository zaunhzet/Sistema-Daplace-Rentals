/**
 * Daplace Rentals — Utilidades de Precisión Monetaria
 * 
 * Regla de negocio: PROHIBIDO realizar cálculos financieros directos con floats binarios IEEE-754.
 * Todas las operaciones aritméticas internas se realizan en unidades mínimas enteras (céntimos).
 * La presentación y persistencia de valores en el frontend se maneja mediante strings decimales exactos.
 */

/**
 * Convierte un importe monetario (string o number) a céntimos enteros (evita fallos de coma flotante).
 * Ejemplo: "1400.50" -> 140050, 250 -> 25000
 */
export function toCents(amount: string | number): number {
  if (typeof amount === 'number') {
    if (isNaN(amount) || !isFinite(amount)) return 0;
    // Multiplicar por 100 y redondear con Math.round para absorber imprecisiones binarias mínimas
    return Math.round(amount * 100);
  }

  const clean = (amount || '').trim().replace(/,/g, '');
  if (!clean) return 0;

  const parts = clean.split('.');
  const integerPart = parseInt(parts[0] || '0', 10);
  if (isNaN(integerPart)) return 0;

  let fractionalStr = parts[1] || '';
  if (fractionalStr.length === 1) fractionalStr += '0';
  else if (fractionalStr.length > 2) fractionalStr = fractionalStr.substring(0, 2);
  else if (fractionalStr.length === 0) fractionalStr = '00';

  const fractionalPart = parseInt(fractionalStr, 10);
  if (isNaN(fractionalPart)) return 0;

  const isNegative = clean.startsWith('-');
  const absCents = Math.abs(integerPart) * 100 + fractionalPart;
  return isNegative ? -absCents : absCents;
}

/**
 * Convierte una cantidad de céntimos a string decimal exacto con dos decimales.
 * Ejemplo: 140050 -> "1400.50"
 */
export function fromCents(cents: number): string {
  if (isNaN(cents) || !isFinite(cents)) return '0.00';
  const isNegative = cents < 0;
  const absCents = Math.abs(cents);
  const integer = Math.floor(absCents / 100);
  const remainder = absCents % 100;
  const remainderStr = remainder.toString().padStart(2, '0');
  return `${isNegative ? '-' : ''}${integer}.${remainderStr}`;
}

/**
 * Suma cantidades expresadas en céntimos o strings decimales devolviendo el resultado en céntimos.
 */
export function addMoney(...amounts: (number | string)[]): number {
  return amounts.reduce<number>((acc, cur) => acc + toCents(cur), 0);
}

/**
 * Resta a - b expresado en céntimos.
 */
export function subtractMoney(a: number | string, b: number | string): number {
  return toCents(a) - toCents(b);
}

/**
 * Compara dos importes monetarios. Devuelve 1 si a > b, -1 si a < b, 0 si a === b.
 */
export function compareMoney(a: number | string, b: number | string): number {
  const cA = toCents(a);
  const cB = toCents(b);
  if (cA > cB) return 1;
  if (cA < cB) return -1;
  return 0;
}

/**
 * Formatea un importe monetario con símbolo de moneda y separador de miles.
 * Ejemplo: "1400.00", "PEN" -> "S/ 1,400.00"
 */
export function formatMoney(amount: string | number, moneda = 'PEN'): string {
  const cents = toCents(amount);
  const isNegative = cents < 0;
  const abs = Math.abs(cents) / 100;
  
  const formattedNumber = abs.toLocaleString('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const prefix = isNegative ? '-' : '';

  if (moneda === 'PEN') {
    return `${prefix}S/ ${formattedNumber}`;
  }
  if (moneda === 'USD') {
    return `${prefix}US$ ${formattedNumber}`;
  }
  return `${prefix}${moneda} ${formattedNumber}`;
}

/**
 * Valida que un importe ingresado sea estrictamente positivo (> 0) y un formato numérico legal.
 */
export function validateMoneyInput(amountStr: string): { isValid: boolean; error?: string; cents: number } {
  const clean = (amountStr || '').trim();
  if (!clean) {
    return { isValid: false, error: 'El importe es obligatorio.', cents: 0 };
  }

  // Regex para permitir formato decimal válido con hasta 2 decimales
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) {
    return {
      isValid: false,
      error: 'Ingrese un importe válido con hasta dos decimales (ejemplo: 250.00). No utilice signos negativos ni caracteres especiales.',
      cents: 0,
    };
  }

  const cents = toCents(clean);
  if (cents <= 0) {
    return {
      isValid: false,
      error: 'El importe debe ser estrictamente mayor a cero.',
      cents: 0,
    };
  }

  return { isValid: true, cents };
}

/**
 * ADAPTADOR PROVISIONAL:
 * En el modelo actual de UI-ANDRE-002, `Reservation.montoAcordado` fue tipado como `number`.
 * Para interoperar sin modificar de forma destructiva o incompatible el módulo de Reservas,
 * este adaptador transforma el campo numérico en un string decimal exacto normalizado.
 * 
 * AVISO ARQUITECTÓNICO: Cuando el backend Fastify/PostgreSQL exponga los endpoints definitivos,
 * las reservas recibirán importes como strings decimales o tipos Decimal exactos de base de datos.
 */
export function adaptReservationAmount(montoAcordado: number): string {
  if (typeof montoAcordado !== 'number' || isNaN(montoAcordado) || montoAcordado < 0) {
    return '0.00';
  }
  return fromCents(Math.round(montoAcordado * 100));
}
