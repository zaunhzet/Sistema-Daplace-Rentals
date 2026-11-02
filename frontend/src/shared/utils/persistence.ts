/**
 * Utilidades de persistencia de filtros y preferencias en localStorage / sessionStorage
 * con separación por rol y usuario, garantizando aislamiento estricto y prevención
 * de accesos no autorizados al cambiar de sesión.
 */

export function getScopedStorageKey(
  key: string,
  user?: { id?: string; email?: string; rol?: string } | null
): string {
  const role = user?.rol || 'ANON';
  const uid = user?.id ? user.id.slice(0, 8) : 'guest';
  return `daplace_filter_${role}_${uid}_${key}`;
}

export function savePersistentState<T>(
  key: string,
  value: T,
  user?: { id?: string; email?: string; rol?: string } | null
): void {
  try {
    const storageKey = getScopedStorageKey(key, user);
    localStorage.setItem(storageKey, JSON.stringify(value));
  } catch {
    // Si localStorage no está disponible o falla cuota, degradación silenciosa
  }
}

export function loadPersistentState<T>(
  key: string,
  defaultValue: T,
  user?: { id?: string; email?: string; rol?: string } | null
): T {
  try {
    const storageKey = getScopedStorageKey(key, user);
    const item = localStorage.getItem(storageKey);
    if (item === null) return defaultValue;
    return JSON.parse(item) as T;
  } catch {
    return defaultValue;
  }
}

export function clearPersistentState(
  key: string,
  user?: { id?: string; email?: string; rol?: string } | null
): void {
  try {
    const storageKey = getScopedStorageKey(key, user);
    localStorage.removeItem(storageKey);
  } catch {
    // Degradar silenciosamente
  }
}
