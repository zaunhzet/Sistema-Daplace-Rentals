import { getAccessToken, refreshApi, getAuthEpoch } from '../../features/auth/authClient';

export class ApiError extends Error {
  public statusCode: number;
  public code?: string;
  public details?: unknown;
  public requestId?: string;

  constructor(
    param1: string,
    param2?: string | number,
    param3?: string | number,
    param4?: unknown,
    param5?: string
  ) {
    if (typeof param2 === 'number') {
      // Firma clásica: (message, statusCode, code, details, requestId)
      super(param1);
      this.statusCode = param2;
      this.code = typeof param3 === 'string' ? param3 : undefined;
      this.details = param4;
      this.requestId = param5;
    } else {
      // Firma de auth: (code, message, statusCode, requestId, details)
      super(typeof param2 === 'string' ? param2 : param1);
      this.code = param1;
      this.statusCode = typeof param3 === 'number' ? param3 : 500;
      this.requestId = typeof param4 === 'string' ? param4 : undefined;
      this.details = param5;
    }
    this.name = 'ApiError';
  }
}

export function getApiBaseUrl(): string {
  // En navegador con Vite dev server, la ruta relativa aprovecha el proxy '/api' sin problemas de CORS
  if (typeof window !== 'undefined' && window.location) {
    return '';
  }
  return 'http://127.0.0.1:3000';
}

export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const requestEpoch = getAuthEpoch();
  const baseUrl = getApiBaseUrl();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${normalizedEndpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...((options.headers as Record<string, string>) || {}),
  };

  const currentToken = getAccessToken();
  if (currentToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error de conexión';
    throw new ApiError(
      `No se pudo conectar con el servidor backend (${errorMsg}). Verifique que el servicio de API esté activo en el puerto 3000.`,
      503,
      'NETWORK_ERROR'
    );
  }

  // Descarte de respuestas tardías si la sesión cambió durante la petición (Fix INT-04)
  if (getAuthEpoch() !== requestEpoch) {
    throw new ApiError(
      'Operación descartada por cambio de sesión de autenticación.',
      499,
      'STALE_SESSION_RESPONSE'
    );
  }

  // Si recibimos 401 y teníamos un token activo, renovar de forma atómica y reintentar una sola vez
  if (response.status === 401 && currentToken) {
    try {
      const refreshResult = await refreshApi();
      if (getAuthEpoch() !== requestEpoch) {
        throw new ApiError(
          'Operación descartada por cambio de sesión de autenticación.',
          499,
          'STALE_SESSION_RESPONSE'
        );
      }
      headers['Authorization'] = `Bearer ${refreshResult.accessToken}`;
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
      if (getAuthEpoch() !== requestEpoch) {
        throw new ApiError(
          'Operación descartada por cambio de sesión de autenticación.',
          499,
          'STALE_SESSION_RESPONSE'
        );
      }
    } catch (err) {
      if (err instanceof ApiError && err.code === 'STALE_SESSION_RESPONSE') {
        throw err;
      }
      // Si la renovación falla, se procesa la respuesta 401 original
    }
  }

  if (response.status === 204) {
    return {} as T;
  }

  let data: any = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { rawText: text };
    }
  }

  if (!response.ok) {
    const errorObj = data?.error;
    const message = errorObj?.message || data?.message || response.statusText || 'Error en la solicitud al servidor';
    throw new ApiError(
      message,
      response.status,
      errorObj?.code,
      errorObj?.details || errorObj?.motivos,
      errorObj?.requestId
    );
  }

  return data as T;
}
