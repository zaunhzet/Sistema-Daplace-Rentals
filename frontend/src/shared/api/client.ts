export class ApiError extends Error {
  public statusCode: number;
  public code?: string;
  public details?: unknown;
  public requestId?: string;

  constructor(message: string, statusCode: number, code?: string, details?: unknown, requestId?: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
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
  const baseUrl = getApiBaseUrl();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${baseUrl}${normalizedEndpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error de conexión';
    throw new ApiError(
      `No se pudo conectar con el servidor backend (${errorMsg}). Verifique que el servicio de API esté activo en el puerto 3000.`,
      503,
      'NETWORK_ERROR'
    );
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
      errorObj?.details,
      errorObj?.requestId
    );
  }

  return data as T;
}
