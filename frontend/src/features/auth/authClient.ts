import type {
  ApiErrorResponse,
  LoginResponse,
  RefreshResponse,
  User,
} from './types';

const API_BASE_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_API_BASE_URL) ||
  'http://127.0.0.1:3000';

let inMemoryAccessToken: string | null = null;
let activeRefreshPromise: Promise<RefreshResponse> | null = null;
let authEpoch = 0;
const sessionUpdateListeners = new Set<(user: User) => void>();
const sessionExpiredListeners = new Set<() => void>();

export function getAuthEpoch(): number {
  return authEpoch;
}

export function bumpAuthEpoch(): number {
  return ++authEpoch;
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
}

export function subscribeSessionUpdate(listener: (user: User) => void): () => void {
  sessionUpdateListeners.add(listener);
  return () => sessionUpdateListeners.delete(listener);
}

export function subscribeSessionExpired(listener: () => void): () => void {
  sessionExpiredListeners.add(listener);
  return () => sessionExpiredListeners.delete(listener);
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number,
    public readonly requestId?: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (response.ok) {
    return (await response.json()) as T;
  }

  let code = 'HTTP_ERROR';
  let message = 'Ocurrió un error en la comunicación con el servidor.';
  let requestId: string | undefined;

  try {
    const errorBody = (await response.json()) as ApiErrorResponse;
    if (errorBody?.error) {
      code = errorBody.error.code ?? code;
      message = errorBody.error.message ?? message;
      requestId = errorBody.error.requestId;
    }
  } catch {
    // Si la respuesta no contiene JSON estructurado
  }

  throw new ApiError(code, message, response.status, requestId);
}

export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });

  const data = await handleResponse<LoginResponse>(response);
  bumpAuthEpoch();
  setAccessToken(data.accessToken);
  sessionUpdateListeners.forEach((l) => l(data.user));
  return data;
}

// Fix 4 & 6: Coordinación de renovaciones con una única petición en curso.
// Evita llamadas duplicadas en paralelo (incluido StrictMode en desarrollo)
export function refreshApi(): Promise<RefreshResponse> {
  if (activeRefreshPromise) {
    return activeRefreshPromise;
  }

  activeRefreshPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        credentials: 'include',
      });

      const data = await handleResponse<RefreshResponse>(response);
      setAccessToken(data.accessToken);
      sessionUpdateListeners.forEach((l) => l(data.user));
      return data;
    } catch (err) {
      bumpAuthEpoch();
      setAccessToken(null);
      sessionExpiredListeners.forEach((l) => l());
      throw err;
    } finally {
      activeRefreshPromise = null;
    }
  })();

  return activeRefreshPromise;
}

// Fix 5: Si la revocación en el servidor falla, no se presenta como exitoso ni se oculta el fallo.
// No limpia el token en memoria si el servidor o red fallaron.
export async function logoutApi(): Promise<void> {
  const currentToken = getAccessToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  };
  if (currentToken) {
    headers['Authorization'] = `Bearer ${currentToken}`;
  }

  const response = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: 'POST',
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    await handleResponse(response);
  }

  bumpAuthEpoch();
  setAccessToken(null);
  sessionExpiredListeners.forEach((l) => l());
}

// Fix 6: Mecanismo centralizado para llamadas autenticadas a la API.
// Ante un 401 por token vencido, renueva una sola vez y reintenta la solicitud una sola vez.
export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set('X-Requested-With', 'XMLHttpRequest');

  const currentToken = getAccessToken();
  if (currentToken) {
    headers.set('Authorization', `Bearer ${currentToken}`);
  }

  let response = await fetch(input, {
    ...init,
    headers,
    credentials: 'include',
  });

  // Si recibimos 401 y teníamos un token, intentamos renovar una única vez y reintentar
  if (response.status === 401 && currentToken) {
    try {
      const refreshResult = await refreshApi();
      headers.set('Authorization', `Bearer ${refreshResult.accessToken}`);

      // Reintento único con el nuevo token
      response = await fetch(input, {
        ...init,
        headers,
        credentials: 'include',
      });
    } catch (refreshErr) {
      // Si la renovación falla, mantenemos la respuesta 401 original
      return response;
    }
  }

  return response;
}

export async function getMeApi(): Promise<{ user: User }> {
  const response = await authenticatedFetch(`${API_BASE_URL}/auth/me`, {
    method: 'GET',
  });

  return handleResponse<{ user: User }>(response);
}
