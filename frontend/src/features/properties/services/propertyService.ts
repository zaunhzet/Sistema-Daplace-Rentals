import type {
  CreatePropertyDto,
  Property,
  PropertyFilterParams,
  PropertyValidationResult,
  Propietario,
  UpdatePropertyDto,
} from '../types';
import { INITIAL_PROPERTIES_MOCK, INITIAL_PROPIETARIOS_MOCK } from './mockProperties';

export function validateProperty(
  dto: Partial<CreatePropertyDto>
): PropertyValidationResult {
  const errors: Record<string, string> = {};

  if (!dto.nombre || dto.nombre.trim().length < 3) {
    errors.nombre = 'El nombre de la propiedad es obligatorio (mínimo 3 caracteres).';
  }

  if (!dto.propietarioId || dto.propietarioId.trim().length === 0) {
    errors.propietarioId = 'Debe seleccionar un propietario responsable.';
  }

  if (!dto.direccion || dto.direccion.trim().length < 5) {
    errors.direccion = 'La dirección operativa es obligatoria (mínimo 5 caracteres).';
  }

  if (dto.capacidadHuespedes !== undefined && dto.capacidadHuespedes <= 0) {
    errors.capacidadHuespedes = 'La capacidad de huéspedes debe ser mayor a 0.';
  }

  if (dto.precioBaseNoche !== undefined && dto.precioBaseNoche <= 0) {
    errors.precioBaseNoche = 'El precio base por noche debe ser mayor a 0.';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export interface IPropertyService {
  getProperties(filters?: PropertyFilterParams): Promise<Property[]>;
  getPropertyById(id: string): Promise<Property | null>;
  createProperty(dto: CreatePropertyDto): Promise<Property>;
  updateProperty(id: string, dto: UpdatePropertyDto): Promise<Property>;
  togglePropertyActive(id: string, activa: boolean): Promise<Property>;
  getPropietarios(): Promise<Propietario[]>;
  reset(): void;
}

class MockPropertyService implements IPropertyService {
  private properties: Property[] = [];
  private propietarios: Propietario[] = [];

  constructor() {
    this.reset();
  }

  public reset(): void {
    // Deep clone initial datasets to support clean test states and isolation
    this.properties = JSON.parse(JSON.stringify(INITIAL_PROPERTIES_MOCK));
    this.propietarios = JSON.parse(JSON.stringify(INITIAL_PROPIETARIOS_MOCK));
  }

  public async getPropietarios(): Promise<Propietario[]> {
    return [...this.propietarios];
  }

  public async getProperties(filters?: PropertyFilterParams): Promise<Property[]> {
    let result = [...this.properties];

    if (!filters) {
      return result;
    }

    if (filters.search && filters.search.trim() !== '') {
      const q = filters.search.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.direccion.toLowerCase().includes(q) ||
          p.propietarioNombre.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q)
      );
    }

    if (filters.estadoOperativo && filters.estadoOperativo !== 'TODOS') {
      result = result.filter((p) => p.estadoOperativo === filters.estadoOperativo);
    }

    if (filters.estadoPublicacion && filters.estadoPublicacion !== 'TODOS') {
      result = result.filter((p) => p.estadoPublicacion === filters.estadoPublicacion);
    }

    if (filters.soloActivas) {
      result = result.filter((p) => p.activa);
    }

    return result;
  }

  public async getPropertyById(id: string): Promise<Property | null> {
    const prop = this.properties.find((p) => p.id === id);
    return prop ? { ...prop } : null;
  }

  public async createProperty(dto: CreatePropertyDto): Promise<Property> {
    const validation = validateProperty(dto);
    if (!validation.isValid) {
      const errorMsg = Object.values(validation.errors).join(' ');
      throw new Error(`Error de validación: ${errorMsg}`);
    }

    const propietario = this.propietarios.find((pr) => pr.id === dto.propietarioId);
    if (!propietario) {
      throw new Error(`El propietario con ID ${dto.propietarioId} no existe.`);
    }

    const newId = `prop-${String(this.properties.length + 1).padStart(2, '0')}`;
    const now = new Date().toISOString();

    const newProperty: Property = {
      id: newId,
      nombre: dto.nombre.trim(),
      propietarioId: propietario.id,
      propietarioNombre: propietario.nombre,
      direccion: dto.direccion.trim(),
      estadoOperativo: dto.estadoOperativo || 'OPERATIVA',
      estadoPublicacion: dto.estadoPublicacion || 'BORRADOR',
      activa: true,
      capacidadHuespedes: dto.capacidadHuespedes ?? 2,
      precioBaseNoche: dto.precioBaseNoche ?? 200,
      moneda: dto.moneda || 'PEN',
      creadoEn: now,
      actualizadoEn: now,
    };

    this.properties.unshift(newProperty);
    return { ...newProperty };
  }

  public async updateProperty(id: string, dto: UpdatePropertyDto): Promise<Property> {
    const index = this.properties.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Propiedad no encontrada con ID: ${id}`);
    }

    const current = this.properties[index];

    // Validate if mandatory fields are being modified
    if (dto.nombre !== undefined && dto.nombre.trim().length < 3) {
      throw new Error('El nombre de la propiedad debe tener al menos 3 caracteres.');
    }
    if (dto.direccion !== undefined && dto.direccion.trim().length < 5) {
      throw new Error('La dirección operativa debe tener al menos 5 caracteres.');
    }

    let propietarioNombre = current.propietarioNombre;
    if (dto.propietarioId && dto.propietarioId !== current.propietarioId) {
      const propFound = this.propietarios.find((p) => p.id === dto.propietarioId);
      if (!propFound) {
        throw new Error(`El propietario con ID ${dto.propietarioId} no existe.`);
      }
      propietarioNombre = propFound.nombre;
    }

    const updated: Property = {
      ...current,
      nombre: dto.nombre !== undefined ? dto.nombre.trim() : current.nombre,
      propietarioId: dto.propietarioId ?? current.propietarioId,
      propietarioNombre,
      direccion: dto.direccion !== undefined ? dto.direccion.trim() : current.direccion,
      estadoOperativo: dto.estadoOperativo ?? current.estadoOperativo,
      estadoPublicacion: dto.estadoPublicacion ?? current.estadoPublicacion,
      activa: dto.activa !== undefined ? dto.activa : current.activa,
      capacidadHuespedes: dto.capacidadHuespedes ?? current.capacidadHuespedes,
      precioBaseNoche: dto.precioBaseNoche ?? current.precioBaseNoche,
      moneda: dto.moneda ?? current.moneda,
      actualizadoEn: new Date().toISOString(),
    };

    this.properties[index] = updated;
    return { ...updated };
  }

  /**
   * Desactiva o reactiva lógicamente una propiedad.
   * Regla de negocio: Por trazabilidad e historial financiero, no se realiza borrado físico.
   */
  public async togglePropertyActive(id: string, activa: boolean): Promise<Property> {
    const index = this.properties.findIndex((p) => p.id === id);
    if (index === -1) {
      throw new Error(`Propiedad no encontrada con ID: ${id}`);
    }

    const current = this.properties[index];
    const updated: Property = {
      ...current,
      activa,
      estadoOperativo: activa ? 'OPERATIVA' : 'INACTIVA',
      estadoPublicacion: activa ? current.estadoPublicacion : 'PAUSADA',
      actualizadoEn: new Date().toISOString(),
    };

    this.properties[index] = updated;
    return { ...updated };
  }
}

export const propertyService: IPropertyService = new MockPropertyService();
