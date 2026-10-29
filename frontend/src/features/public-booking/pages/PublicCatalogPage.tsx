import React, { useState, useEffect, useCallback } from 'react';
import { Search, Building, RefreshCw } from 'lucide-react';
import { publicBookingService } from '../services/publicBookingService';
import { PropertyCard } from '../components/PropertyCard';
import type { PublicProperty } from '../types';

export const PublicCatalogPage: React.FC = () => {
  const [properties, setProperties] = useState<PublicProperty[]>([]);
  const [search, setSearch] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await publicBookingService.getPublicCatalog(search);
      setProperties(data);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Ocurrió un error al cargar el catálogo de propiedades.');
      }
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadCatalog();
    }, 200);
    return () => clearTimeout(timer);
  }, [loadCatalog]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Hero Section */}
      <section className="rounded-3xl bg-[#162A2C] px-6 py-10 sm:px-12 sm:py-14 text-white shadow-sm relative overflow-hidden">
        <div className="relative z-10 max-w-2xl space-y-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-[#B9CDB4]">
            Catálogo Oficial (HU-01)
          </span>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl text-[#FEFCF6]">
            Alojamientos temporales en Lima
          </h1>
          <p className="text-sm leading-relaxed text-[#D6E0E2]/85">
            Explora nuestros departamentos y suites completamente equipados en Miraflores, Barranco y San Isidro. Consulta disponibilidad en tiempo real y registra tu solicitud preliminar de reserva.
          </p>
        </div>

        {/* Decorative background shape */}
        <div className="absolute -right-12 -bottom-12 size-64 rounded-full bg-[#5E6C5B]/20 pointer-events-none" />
      </section>

      {/* Search and Filters Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search Input */}
        <div className="relative w-full sm:max-w-md">
          <Search
            size={17}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id="public-catalog-search"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre o distrito (ej. Miraflores, Barranco)..."
            className="w-full rounded-2xl border border-stone-300 bg-white pl-10 pr-4 py-2.5 text-xs text-stone-900 placeholder:text-stone-400 focus:border-[#162A2C] focus:outline-hidden focus:ring-2 focus:ring-[#5E6C5B]/20 transition-all shadow-xs"
          />
        </div>

        {/* Status / Counter */}
        <div className="flex items-center gap-3 text-xs text-stone-500 self-end sm:self-auto">
          <span>
            Mostrando <strong>{properties.length}</strong> {properties.length === 1 ? 'inmueble verificado' : 'inmuebles verificados'}
          </span>
          <button
            type="button"
            onClick={() => loadCatalog()}
            className="p-1.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
            title="Refrescar catálogo"
            aria-label="Refrescar catálogo"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-900">
          {error}
        </div>
      )}

      {/* Loading Skeleton or Cards Grid */}
      {loading && properties.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((n) => (
            <div key={n} className="h-80 rounded-3xl bg-stone-200/60 animate-pulse" />
          ))}
        </div>
      ) : properties.length === 0 ? (
        /* Empty State */
        <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-12 text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-stone-100 text-stone-500 mb-4">
            <Building size={22} aria-hidden="true" />
          </div>
          <h2 className="text-base font-bold text-stone-900">No se encontraron alojamientos</h2>
          <p className="mt-1 text-xs text-stone-500 max-w-sm mx-auto leading-relaxed">
            {search
              ? 'No hay propiedades publicadas que coincidan con los términos de búsqueda.'
              : 'En este momento no hay propiedades con estado de publicación activa.'}
          </p>
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="mt-4 inline-flex text-xs font-semibold text-[#5E6C5B] hover:underline cursor-pointer"
            >
              Limpiar búsqueda
            </button>
          )}
        </div>
      ) : (
        /* Property Cards Grid */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
    </div>
  );
};
