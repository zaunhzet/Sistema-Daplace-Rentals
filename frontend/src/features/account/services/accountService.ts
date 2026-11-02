import { authenticatedFetch, API_BASE_URL } from '../../auth/authClient';

export interface AccountProfile {
  id: string;
  email: string;
  nombre: string;
  cargo: string | null;
  rol: string;
  usuarioId: string | null;
}

export interface UpdateEmailDto {
  nuevoEmail: string;
  passwordActual: string;
}

export interface UpdatePasswordDto {
  passwordActual: string;
  nuevoPassword: string;
}

export class AccountService {
  public async getProfile(): Promise<AccountProfile> {
    const res = await authenticatedFetch(`${API_BASE_URL}/api/cuenta/perfil`, {
      method: 'GET',
    });

    if (!res.ok) {
      const err = await this.parseError(res);
      throw new Error(err);
    }

    const data = await res.json();
    return data.user;
  }

  public async updateEmail(dto: UpdateEmailDto): Promise<{ user: AccountProfile; message: string }> {
    const res = await authenticatedFetch(`${API_BASE_URL}/api/cuenta/email`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });

    if (!res.ok) {
      const err = await this.parseError(res);
      throw new Error(err);
    }

    return await res.json();
  }

  public async updatePassword(dto: UpdatePasswordDto): Promise<{ message: string }> {
    const res = await authenticatedFetch(`${API_BASE_URL}/api/cuenta/password`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dto),
    });

    if (!res.ok) {
      const err = await this.parseError(res);
      throw new Error(err);
    }

    return await res.json();
  }

  private async parseError(res: Response): Promise<string> {
    try {
      const data = await res.json();
      if (data?.error?.message) {
        return data.error.message;
      }
    } catch {
      // no json
    }
    return `Error en la operación (${res.status}): ${res.statusText || 'Error desconocido'}`;
  }
}

export const accountService = new AccountService();
