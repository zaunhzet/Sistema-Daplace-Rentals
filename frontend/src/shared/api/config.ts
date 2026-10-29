/**
 * Determina si la aplicación debe usar mocks en memoria o el backend PostgreSQL real.
 * 
 * Regla de negocio:
 * - En el navegador (desarrollo o producción): se conecta a la API real por defecto.
 * - Modo mock explícito: únicamente si VITE_USE_MOCKS === 'true'.
 * - En pruebas automatizadas de Node (donde window no existe): utiliza mocks para aislamiento.
 */
export function isMockMode(): boolean {
  if (typeof window === 'undefined') {
    return process.env.VITE_USE_MOCKS !== 'false';
  }
  return import.meta.env.VITE_USE_MOCKS === 'true';
}
