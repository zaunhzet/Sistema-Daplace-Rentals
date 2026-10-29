import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, CheckCircle, Plus } from 'lucide-react';
import type {
  CreatePropertyDto,
  Property,
  PropertyFilterParams,
  Propietario,
} from '../types';
import { propertyService } from '../services/propertyService';
import { PropertyFilters } from '../components/PropertyFilters';
import { PropertyList } from '../components/PropertyList';
import { PropertyFormModal } from '../components/PropertyFormModal';
import { PropertyDetailModal } from '../components/PropertyDetailModal';

export const PropertiesPage: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propietarios, setPropietarios] = useState<Propietario[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters state
  const [filters, setFilters] = useState<PropertyFilterParams>({
    search: '',
    estadoOperativo: 'TODOS',
    estadoPublicacion: 'TODOS',
    soloActivas: false,
  });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [propertyToEdit, setPropertyToEdit] = useState<Property | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const showSuccess = (msg: string) => {
    setSuccessMessage(msg);
    setErrorMessage(null);
    setTimeout(() => setSuccessMessage(null), 5000);
  };

  const showError = (msg: string) => {
    setErrorMessage(msg);
    setTimeout(() => setErrorMessage(null), 7000);
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [propsData, propsPropietarios] = await Promise.all([
        propertyService.getProperties(filters),
        propertyService.getPropietarios(),
      ]);
      setProperties(propsData);
      setPropietarios(propsPropietarios);
    } catch (err: unknown) {
      if (err instanceof Error) {
        showError(err.message);
      } else {
        showError('Error al cargar propiedades.');
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Form Submit (Create or Edit)
  const handleFormSubmit = async (dto: CreatePropertyDto, propertyId?: string) => {
    if (propertyId) {
      await propertyService.updateProperty(propertyId, dto);
      showSuccess(`Propiedad "${dto.nombre}" actualizada con éxito.`);
    } else {
      const created = await propertyService.createProperty(dto);
      showSuccess(`Propiedad "${created.nombre}" registrada correctamente con código ${created.id}.`);
    }
    await loadData();
  };

  // Handle Toggle Active
  const handleToggleActive = async (id: string, newActive: boolean) => {
    try {
      const updated = await propertyService.togglePropertyActive(id, newActive);
      showSuccess(
        newActive
          ? `Propiedad ${updated.id} reactivada correctamente.`
          : `Propiedad ${updated.id} desactivada lógicamente. El historial se conserva.`
      );
      if (selectedProperty && selectedProperty.id === id) {
        setSelectedProperty(updated);
      }
      await loadData();
    } catch (err: unknown) {
      if (err instanceof Error) {
        showError(err.message);
      } else {
        showError('No fue posible modificar el estado de la propiedad.');
      }
    }
  };

  // Metrics
  const totalCount = properties.length;
  const operativasCount = properties.filter((p) => p.estadoOperativo === 'OPERATIVA').length;
  const publicadasCount = properties.filter((p) => p.estadoPublicacion === 'PUBLICADA').length;
  const inactivasCount = properties.filter((p) => !p.activa || p.estadoOperativo === 'INACTIVA').length;

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
            Gestión de Propiedades
          </h1>
          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
            Catálogo y control operativo de inmuebles con vinculación de propietarios y gobernanza de datos.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => {
              setPropertyToEdit(null);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#183b32] px-3.5 py-2 text-xs sm:text-sm font-semibold text-white shadow-2xs hover:bg-[#122e27] transition-colors cursor-pointer"
          >
            <Plus size={16} aria-hidden="true" />
            <span>Registrar Propiedad</span>
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="shrink-0 text-emerald-700" aria-hidden="true" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-xs font-bold text-emerald-800 hover:text-emerald-950 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs sm:text-sm font-medium text-red-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0 text-red-700" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs font-bold text-red-800 hover:text-red-950 cursor-pointer"
          >
            Cerrar
          </button>
        </div>
      )}

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Total en Vista</p>
          <p className="mt-0.5 text-xl font-bold text-stone-900">{totalCount}</p>
        </div>
        <div className="rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">Operativas</p>
          <p className="mt-0.5 text-xl font-bold text-emerald-800">{operativasCount}</p>
        </div>
        <div className="rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-700">Publicadas</p>
          <p className="mt-0.5 text-xl font-bold text-sky-800">{publicadasCount}</p>
        </div>
        <div className="rounded-xl border border-stone-200/90 bg-white p-3 shadow-2xs">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-500">Inactivas / Pausadas</p>
          <p className="mt-0.5 text-xl font-bold text-stone-700">{inactivasCount}</p>
        </div>
      </div>

      {/* Filter Component */}
      <PropertyFilters
        filters={filters}
        onFilterChange={setFilters}
        onReset={() =>
          setFilters({
            search: '',
            estadoOperativo: 'TODOS',
            estadoPublicacion: 'TODOS',
            soloActivas: false,
          })
        }
      />

      {/* List Component */}
      {loading ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center text-sm text-stone-500">
          Cargando propiedades...
        </div>
      ) : (
        <PropertyList
          properties={properties}
          onViewDetail={(property) => {
            setSelectedProperty(property);
            setIsDetailOpen(true);
          }}
          onEdit={(property) => {
            setPropertyToEdit(property);
            setIsFormOpen(true);
          }}
          onToggleActive={handleToggleActive}
          onCreateNew={() => {
            setPropertyToEdit(null);
            setIsFormOpen(true);
          }}
        />
      )}

      {/* Modals */}
      <PropertyFormModal
        isOpen={isFormOpen}
        propertyToEdit={propertyToEdit}
        propietarios={propietarios}
        onClose={() => {
          setIsFormOpen(false);
          setPropertyToEdit(null);
        }}
        onSubmit={handleFormSubmit}
      />

      <PropertyDetailModal
        property={selectedProperty}
        propietario={
          selectedProperty
            ? propietarios.find((p) => p.id === selectedProperty.propietarioId)
            : null
        }
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedProperty(null);
        }}
        onEdit={(prop) => {
          setPropertyToEdit(prop);
          setIsFormOpen(true);
        }}
        onToggleActive={handleToggleActive}
      />
    </div>
  );
};
