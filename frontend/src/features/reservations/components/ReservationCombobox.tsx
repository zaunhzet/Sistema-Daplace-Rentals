import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Loader2, Check, AlertCircle, X, ChevronDown } from 'lucide-react';
import type { Reservation } from '../types';
import { reservationService } from '../services/reservationService';
import { formatDisplayDate, formatNights } from '../../../shared/utils/stayFormatters';

export interface ReservationComboboxProps {
  id?: string;
  name?: string;
  value: string; // reservationId
  onChange: (reservationId: string, reservation?: Reservation) => void;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  label?: string;
  error?: string;
  helperText?: string;
  initialReservation?: Reservation | null;
  filterEstado?: string | string[];
  className?: string;
}

export const ReservationCombobox: React.FC<ReservationComboboxProps> = ({
  id = 'reservation-combobox',
  name = 'reservationId',
  value,
  onChange,
  disabled = false,
  required = false,
  placeholder = 'Buscar por RSV-XXXXXX, huésped, propiedad o pegar UUID...',
  label = 'RESERVA VINCULADA',
  error,
  helperText,
  initialReservation,
  filterEstado,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<Reservation[]>([]);
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(
    initialReservation || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLUListElement>(null);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const activeRequestIdRef = useRef<number>(0);

  // Sincronizar selección actual cuando cambia `value` externamente
  useEffect(() => {
    if (!value) {
      setSelectedReservation(null);
      return;
    }

    if (selectedReservation && selectedReservation.id === value) {
      return;
    }

    if (initialReservation && initialReservation.id === value) {
      setSelectedReservation(initialReservation);
      return;
    }

    let isCancelled = false;
    reservationService
      .getReservationById(value)
      .then((res) => {
        if (!isCancelled && res) {
          setSelectedReservation(res);
        }
      })
      .catch(() => {
        // Fallback silencioso si el ID no existe o no tiene permiso
      });

    return () => {
      isCancelled = true;
    };
  }, [value, initialReservation, selectedReservation]);

  const fetchResults = useCallback(
    async (query: string) => {
      const requestId = ++activeRequestIdRef.current;
      setIsLoading(true);
      setFetchError(null);

      try {
        const paginated = await reservationService.getReservationsPaginated({
          search: query.trim() || undefined,
          page: 1,
          pageSize: 25,
        });

        if (requestId !== activeRequestIdRef.current) return;

        let filtered = paginated.data;
        if (filterEstado) {
          const estados = Array.isArray(filterEstado) ? filterEstado : [filterEstado];
          filtered = filtered.filter((r) => estados.includes(r.estado));
        }

        setResults(filtered);
        setHighlightedIndex(filtered.length > 0 ? 0 : -1);
      } catch (err: unknown) {
        if (requestId !== activeRequestIdRef.current) return;
        setFetchError(err instanceof Error ? err.message : 'Error al consultar reservas');
        setResults([]);
        setHighlightedIndex(-1);
      } finally {
        if (requestId === activeRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [filterEstado]
  );

  // Debounced search al escribir
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const text = e.target.value;
    setSearchTerm(text);

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void fetchResults(text);
    }, 300);
  };

  const handleOpenDropdown = () => {
    if (disabled) return;
    setIsOpen(true);
    // Cargar primeras reservas si aún no hay resultados
    if (results.length === 0 && !isLoading) {
      void fetchResults(searchTerm);
    }
    setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  };

  const handleSelect = (reservation: Reservation) => {
    setSelectedReservation(reservation);
    onChange(reservation.id, reservation);
    setIsOpen(false);
    setSearchTerm('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedReservation(null);
    onChange('', undefined);
    setSearchTerm('');
    setIsOpen(false);
  };

  // Click outside para cerrar
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Navegación por teclado accesible
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        handleOpenDropdown();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightedIndex >= 0 && highlightedIndex < results.length) {
          handleSelect(results[highlightedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        break;
      default:
        break;
    }
  };

  // Scroll sincronizado para el elemento activo
  useEffect(() => {
    if (isOpen && highlightedIndex >= 0 && listboxRef.current) {
      const activeElement = listboxRef.current.children[highlightedIndex] as HTMLElement;
      if (activeElement && typeof activeElement.scrollIntoView === 'function') {
        activeElement.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex, isOpen]);

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-semibold text-stone-700 mb-1 flex items-center justify-between"
        >
          <span>
            {label} {required && <span className="text-rose-500">*</span>}
          </span>
          {selectedReservation && (
            <span className="text-[11px] font-normal text-stone-400">
              Selección confirmada
            </span>
          )}
        </label>
      )}

      {/* Vista cuando ya existe una selección activa y el dropdown está cerrado */}
      {!isOpen && selectedReservation ? (
        <div
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenDropdown();
            }
          }}
          onClick={handleOpenDropdown}
          className={`flex items-center justify-between rounded-xl border p-2.5 sm:p-3 text-xs transition-colors cursor-pointer ${
            error
              ? 'border-rose-300 bg-rose-50/50'
              : 'border-stone-200 bg-stone-50/80 hover:border-stone-300 hover:bg-stone-100/80'
          } ${disabled ? 'opacity-60 cursor-not-allowed pointer-events-none' : ''}`}
          role="button"
          aria-haspopup="listbox"
          aria-expanded={false}
          aria-label={`Reserva seleccionada: ${selectedReservation.codigo || selectedReservation.id}`}
        >
          <div className="flex items-center gap-2.5 truncate mr-2">
            <span className="rounded-md bg-[#183b32] px-2 py-0.5 font-mono text-[11px] font-bold text-white shrink-0 shadow-2xs">
              {selectedReservation.codigo || selectedReservation.id.slice(0, 8)}
            </span>
            <div className="truncate text-stone-800">
              <span className="font-semibold text-stone-900">{selectedReservation.huespedNombre}</span>
              <span className="text-stone-400 mx-1.5">•</span>
              <span className="text-stone-600">{selectedReservation.propiedadNombre}</span>
              <span className="text-stone-400 mx-1.5">•</span>
              <span className="text-stone-500 font-mono text-[11px]">
                {formatDisplayDate(selectedReservation.ingreso)} ({formatNights(selectedReservation.noches)})
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {!disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-full p-1 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors"
                title="Quitar selección"
                aria-label="Quitar selección de reserva"
              >
                <X size={14} />
              </button>
            )}
            <ChevronDown size={14} className="text-stone-400" />
          </div>
        </div>
      ) : (
        /* Modo input de búsqueda desplegable */
        <div className="relative">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-3 text-stone-400 pointer-events-none" />
            <input
              ref={inputRef}
              id={id}
              name={name}
              type="text"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isOpen}
              aria-controls={`${id}-listbox`}
              aria-activedescendant={
                highlightedIndex >= 0 ? `${id}-option-${highlightedIndex}` : undefined
              }
              value={searchTerm}
              onChange={handleInputChange}
              onFocus={handleOpenDropdown}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder={placeholder}
              className={`w-full rounded-xl border bg-white pl-8 pr-8 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:outline-hidden transition-all ${
                error
                  ? 'border-rose-400 ring-1 ring-rose-300'
                  : 'border-stone-200 focus:border-[#183b32] focus:ring-1 focus:ring-[#183b32]'
              } ${disabled ? 'bg-stone-100 text-stone-400 cursor-not-allowed' : ''}`}
            />
            {isLoading ? (
              <Loader2 size={14} className="absolute right-3 animate-spin text-stone-400" />
            ) : isOpen ? (
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="absolute right-2 p-1 text-stone-400 hover:text-stone-600 cursor-pointer"
                aria-label="Cerrar opciones"
              >
                <ChevronDown size={14} className="rotate-180 transition-transform" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleOpenDropdown}
                className="absolute right-2 p-1 text-stone-400 hover:text-stone-600 cursor-pointer"
                aria-label="Abrir opciones"
              >
                <ChevronDown size={14} />
              </button>
            )}
          </div>

          {/* Menú desplegable */}
          {isOpen && (
            <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-2xl border border-stone-200 bg-white p-1.5 shadow-xl">
              {isLoading && results.length === 0 && (
                <div className="flex items-center justify-center gap-2 p-4 text-xs text-stone-500">
                  <Loader2 size={14} className="animate-spin text-[#183b32]" />
                  <span>Consultando reservas en el backend...</span>
                </div>
              )}

              {fetchError && (
                <div className="flex items-center gap-2 p-3 text-xs text-rose-600 bg-rose-50 rounded-xl">
                  <AlertCircle size={14} className="shrink-0" />
                  <span className="truncate">{fetchError}</span>
                  <button
                    type="button"
                    onClick={() => void fetchResults(searchTerm)}
                    className="ml-auto underline font-semibold text-rose-700 shrink-0"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {!isLoading && !fetchError && results.length === 0 && (
                <div className="p-4 text-center text-xs text-stone-500">
                  No se encontraron reservas con el criterio ingresado.
                </div>
              )}

              {results.length > 0 && (
                <ul
                  ref={listboxRef}
                  id={`${id}-listbox`}
                  role="listbox"
                  aria-label="Resultados de reservas"
                  className="space-y-1"
                >
                  {results.map((r, index) => {
                    const isSelected = selectedReservation?.id === r.id;
                    const isHighlighted = index === highlightedIndex;

                    return (
                      <li
                        key={r.id}
                        id={`${id}-option-${index}`}
                        role="option"
                        aria-selected={isSelected}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        onClick={() => handleSelect(r)}
                        className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs cursor-pointer transition-colors ${
                          isHighlighted ? 'bg-stone-100 text-stone-900' : 'text-stone-700'
                        } ${isSelected ? 'font-semibold bg-emerald-50 text-emerald-950' : ''}`}
                      >
                        <div className="flex flex-col gap-0.5 truncate mr-2">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-[#183b32] px-1.5 py-0.5 font-mono text-[10px] font-bold text-white shadow-2xs">
                              {r.codigo || r.id.slice(0, 8)}
                            </span>
                            <span className="font-semibold text-stone-900 truncate">
                              {r.huespedNombre}
                            </span>
                            <span className="text-[10px] text-stone-400 truncate">
                              ({r.propiedadNombre})
                            </span>
                          </div>
                          <div className="font-mono text-[10px] text-stone-500 pl-1">
                            {formatDisplayDate(r.ingreso)} → {formatDisplayDate(r.salida)} ({formatNights(r.noches)}) • {r.estado}
                          </div>
                        </div>

                        {isSelected && (
                          <Check size={14} className="text-[#183b32] shrink-0" aria-hidden="true" />
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-[11px] text-rose-600">{error}</p>}
      {helperText && !error && <p className="mt-1 text-[11px] text-stone-500">{helperText}</p>}
    </div>
  );
};
