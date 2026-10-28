import type {
  CreateGuestDto,
  Guest,
  GuestFilterParams,
  GuestValidationResult,
  GuestWithReservations,
  ReservaRelacionada,
  UpdateGuestDto,
} from '../types';
import { INITIAL_GUESTS_MOCK } from './mockGuests';

export function validateGuest(dto: Partial<CreateGuestDto>): GuestValidationResult {
  const errors: Record<string, string> = {};

  const nombre = dto.nombreCompleto?.trim() || '';
  if (nombre.length < 3) {
    errors.nombreCompleto = 'El nombre completo es obligatorio (mínimo 3 caracteres).';
  }

  const telefono = dto.telefono?.trim() || '';
  const email = dto.email?.trim() || '';

  // Regla RF04: Al menos un medio de contacto obligatorio
  if (!telefono && !email) {
    errors.contacto = 'Debe registrar al menos un medio de contacto (teléfono o correo electrónico).';
  }

  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.email = 'El formato del correo electrónico no es válido.';
    }
  }

  if (telefono && telefono.length < 6) {
    errors.telefono = 'El teléfono debe contener al menos 6 dígitos o caracteres.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export type ReservationProvider = (guestId: string) => Promise<ReservaRelacionada[]>;

export interface IGuestService {
  getGuests(filters?: GuestFilterParams): Promise<Guest[]>;
  getGuestById(id: string): Promise<GuestWithReservations | null>;
  createGuest(dto: CreateGuestDto): Promise<Guest>;
  updateGuest(id: string, dto: UpdateGuestDto): Promise<Guest>;
  setReservationProvider(provider: ReservationProvider | null): void;
  reset(): void;
}

class MockGuestService implements IGuestService {
  private guests: GuestWithReservations[] = [];
  private reservationProvider: ReservationProvider | null = null;

  constructor() {
    this.reset();
  }

  public reset(): void {
    this.guests = JSON.parse(JSON.stringify(INITIAL_GUESTS_MOCK));
  }

  public setReservationProvider(provider: ReservationProvider | null): void {
    this.reservationProvider = provider;
  }

  public async getGuests(filters?: GuestFilterParams): Promise<Guest[]> {
    let result = [...this.guests];

    if (filters?.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(
        (g) =>
          g.nombreCompleto.toLowerCase().includes(q) ||
          g.email.toLowerCase().includes(q) ||
          g.telefono.toLowerCase().includes(q) ||
          (g.numeroDocumento && g.numeroDocumento.toLowerCase().includes(q)) ||
          g.id.toLowerCase().includes(q)
      );
    }

    // Return without detailed reservations in list view to avoid payload bloat
    return result.map(({ reservasRelacionadas: _, ...guest }) => guest);
  }

  public async getGuestById(id: string): Promise<GuestWithReservations | null> {
    const guest = this.guests.find((g) => g.id === id);
    if (!guest) return null;

    let reservas: ReservaRelacionada[] = [];
    if (this.reservationProvider) {
      try {
        reservas = await this.reservationProvider(id);
      } catch {
        reservas = [];
      }
    } else {
      reservas = guest.reservasRelacionadas || [];
    }

    return {
      ...JSON.parse(JSON.stringify(guest)),
      reservasRelacionadas: reservas,
    };
  }

  public async createGuest(dto: CreateGuestDto): Promise<Guest> {
    const validation = validateGuest(dto);
    if (!validation.isValid) {
      const errorMsg = Object.values(validation.errors).join(' ');
      throw new Error(`Error de validación: ${errorMsg}`);
    }

    const newId = `hue-${String(this.guests.length + 1).padStart(2, '0')}`;
    const now = new Date().toISOString();

    const newGuest: GuestWithReservations = {
      id: newId,
      nombreCompleto: dto.nombreCompleto.trim(),
      telefono: dto.telefono ? dto.telefono.trim() : '',
      email: dto.email ? dto.email.trim() : '',
      tipoDocumento: dto.tipoDocumento,
      numeroDocumento: dto.numeroDocumento ? dto.numeroDocumento.trim() : undefined,
      nacionalidad: dto.nacionalidad ? dto.nacionalidad.trim() : undefined,
      notas: dto.notas ? dto.notas.trim() : undefined,
      creadoEn: now,
      actualizadoEn: now,
      reservasRelacionadas: [],
    };

    this.guests.unshift(newGuest);
    const { reservasRelacionadas: _, ...guest } = newGuest;
    return guest;
  }

  public async updateGuest(id: string, dto: UpdateGuestDto): Promise<Guest> {
    const index = this.guests.findIndex((g) => g.id === id);
    if (index === -1) {
      throw new Error(`Huésped no encontrado con ID: ${id}`);
    }

    const current = this.guests[index];

    // Validate if mandatory contact or name is invalid
    const candidateName = dto.nombreCompleto !== undefined ? dto.nombreCompleto : current.nombreCompleto;
    const candidatePhone = dto.telefono !== undefined ? dto.telefono : current.telefono;
    const candidateEmail = dto.email !== undefined ? dto.email : current.email;

    const validation = validateGuest({
      nombreCompleto: candidateName,
      telefono: candidatePhone,
      email: candidateEmail,
    });

    if (!validation.isValid) {
      const errorMsg = Object.values(validation.errors).join(' ');
      throw new Error(`Error de validación: ${errorMsg}`);
    }

    const updated: GuestWithReservations = {
      ...current,
      nombreCompleto: candidateName.trim(),
      telefono: candidatePhone.trim(),
      email: candidateEmail.trim(),
      tipoDocumento: dto.tipoDocumento !== undefined ? dto.tipoDocumento : current.tipoDocumento,
      numeroDocumento:
        dto.numeroDocumento !== undefined
          ? dto.numeroDocumento.trim() || undefined
          : current.numeroDocumento,
      nacionalidad:
        dto.nacionalidad !== undefined ? dto.nacionalidad.trim() || undefined : current.nacionalidad,
      notas: dto.notas !== undefined ? dto.notas.trim() || undefined : current.notas,
      actualizadoEn: new Date().toISOString(),
    };

    this.guests[index] = updated;
    const { reservasRelacionadas: _, ...guest } = updated;
    return guest;
  }
}

export const guestService: IGuestService = new MockGuestService();
