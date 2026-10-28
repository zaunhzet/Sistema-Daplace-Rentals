import React, { useState, useEffect, useCallback } from 'react';
import type {
  CreateGuestDto,
  Guest,
  GuestFilterParams,
  GuestWithReservations,
} from '../types';
import { guestService } from '../services/guestService';
import { GuestFilters } from '../components/GuestFilters';
import { GuestList } from '../components/GuestList';
import { GuestFormModal } from '../components/GuestFormModal';
import { GuestDetailModal } from '../components/GuestDetailModal';

export const GuestsPage: React.FC = () => {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Filters state
  const [filters, setFilters] = useState<GuestFilterParams>({ search: '' });

  // Modal states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [guestToEdit, setGuestToEdit] = useState<Guest | null>(null);

  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedGuest, setSelectedGuest] = useState<GuestWithReservations | null>(null);

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
      const data = await guestService.getGuests(filters);
      setGuests(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        showError(err.message);
      } else {
        showError('Error al consultar lista de huéspedes.');
      }
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle Form Submit
  const handleFormSubmit = async (dto: CreateGuestDto, guestId?: string) => {
    if (guestId) {
      await guestService.updateGuest(guestId, dto);
      showSuccess(`Huésped "${dto.nombreCompleto}" actualizado con éxito.`);
    } else {
      const created = await guestService.createGuest(dto);
      showSuccess(`Huésped "${created.nombreCompleto}" registrado exitosamente con código ${created.id}.`);
    }
    await loadData();
  };

  // Handle View Detail
  const handleViewDetail = async (guestId: string) => {
    try {
      const fullGuest = await guestService.getGuestById(guestId);
      if (fullGuest) {
        setSelectedGuest(fullGuest);
        setIsDetailOpen(true);
      } else {
        showError('No se encontró el detalle del huésped.');
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        showError(err.message);
      } else {
        showError('Error al consultar detalle del huésped.');
      }
    }
  };

  // Metrics
  const totalCount = guests.length;
  const conTelefonoCount = guests.filter((g) => !!g.telefono).length;
  const conEmailCount = guests.filter((g) => !!g.email).length;
  const conDocumentoCount = guests.filter((g) => !!g.numeroDocumento).length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
            <span>Operaciones</span>
            <span aria-hidden="true">/</span>
            <span className="text-[#183b32]">Módulo HU-04 & RF04</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
            Gestión de Huéspedes
          </h1>
          <p className="mt-1 text-sm text-stone-500">
            Directorio de huéspedes, validación de contacto y consulta de reservas relacionadas.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={() => {
              setGuestToEdit(null);
              setIsFormOpen(true);
            }}
            className="inline-flex items-center gap-2 rounded-xl bg-[#183b32] px-4 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#122e27] cursor-pointer"
          >
            <span>+</span> Registrar Huésped
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>✓</span>
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
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
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
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Total Huéspedes</p>
          <p className="mt-1 text-2xl font-bold text-stone-900">{totalCount}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Con Teléfono</p>
          <p className="mt-1 text-2xl font-bold text-emerald-800">{conTelefonoCount}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700">Con Correo</p>
          <p className="mt-1 text-2xl font-bold text-sky-800">{conEmailCount}</p>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">Documentados</p>
          <p className="mt-1 text-2xl font-bold text-stone-700">{conDocumentoCount}</p>
        </div>
      </div>

      {/* Filter Component */}
      <GuestFilters
        filters={filters}
        onFilterChange={setFilters}
        onReset={() => setFilters({ search: '' })}
      />

      {/* List Component */}
      {loading ? (
        <div className="rounded-3xl border border-stone-200 bg-white p-12 text-center text-sm text-stone-500">
          Cargando huéspedes...
        </div>
      ) : (
        <GuestList
          guests={guests}
          onViewDetail={handleViewDetail}
          onEdit={(guest) => {
            setGuestToEdit(guest);
            setIsFormOpen(true);
          }}
          onCreateNew={() => {
            setGuestToEdit(null);
            setIsFormOpen(true);
          }}
        />
      )}

      {/* Modals */}
      <GuestFormModal
        isOpen={isFormOpen}
        guestToEdit={guestToEdit}
        onClose={() => {
          setIsFormOpen(false);
          setGuestToEdit(null);
        }}
        onSubmit={handleFormSubmit}
      />

      <GuestDetailModal
        guest={selectedGuest}
        isOpen={isDetailOpen}
        onClose={() => {
          setIsDetailOpen(false);
          setSelectedGuest(null);
        }}
        onEdit={(guest) => {
          setGuestToEdit(guest);
          setIsFormOpen(true);
        }}
      />
    </div>
  );
};
