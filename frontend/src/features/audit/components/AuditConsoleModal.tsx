import React, { useEffect, useState } from 'react';
import {
  Filter,
  RefreshCw,
  Search,
  Shield,
  X,
  ChevronLeft,
  ChevronRight,
  Code,
} from 'lucide-react';
import { auditService } from '../services/auditService';
import type { AuditEvent } from '../types';

interface AuditConsoleModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const ENTIDADES = ['TODAS', 'Reserva', 'Pago', 'Gasto', 'Propiedad', 'Usuario', 'Garantia'];

export const AuditConsoleModal: React.FC<AuditConsoleModalProps> = ({ isOpen, onClose }) => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [selectedEntidad, setSelectedEntidad] = useState<string>('TODAS');
  const [search, setSearch] = useState<string>('');
  const [desde, setDesde] = useState<string>('');
  const [hasta, setHasta] = useState<string>('');

  // Detalle expandido
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const fetchEvents = async (targetPage = page) => {
    setLoading(true);
    setError(null);
    try {
      const res = await auditService.getAuditEvents({
        entidad: selectedEntidad !== 'TODAS' ? selectedEntidad : undefined,
        search: search.trim() || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
        page: targetPage,
        limit: 15,
      });
      setEvents(res.data);
      setTotal(res.meta.total);
      setPage(res.meta.page);
      setTotalPages(res.meta.totalPages);
    } catch (err: any) {
      setError(err.message || 'Error al consultar la bitácora de auditoría');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchEvents(1);
    }
  }, [isOpen, selectedEntidad]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="relative flex max-h-[90vh] w-full max-w-5xl flex-col rounded-2xl bg-white shadow-2xl">
        {/* Cabecera del Modal */}
        <div className="flex items-center justify-between border-b border-stone-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-700">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-stone-900">Bitácora Central de Auditoría</h2>
              <p className="text-xs text-stone-500">
                Trazabilidad inmutable de mutaciones operativas y financieras (HU-20)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Barra de Filtros */}
        <div className="grid grid-cols-1 gap-3 border-b border-stone-100 bg-stone-50/70 p-4 sm:grid-cols-4">
          <div>
            <label className="block text-[11px] font-semibold uppercase text-stone-500">Entidad</label>
            <select
              value={selectedEntidad}
              onChange={(e) => {
                setSelectedEntidad(e.target.value);
                setPage(1);
              }}
              className="mt-1 block w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-800 focus:border-indigo-500 focus:outline-none"
            >
              {ENTIDADES.map((ent) => (
                <option key={ent} value={ent}>
                  {ent}
                </option>
              ))}
            </select>
          </div>

          <div className="sm:col-span-2">
            <label className="block text-[11px] font-semibold uppercase text-stone-500">Buscar (ID, Actor, Motivo)</label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                placeholder="Ej. res-01, admin@daplace.pe..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchEvents(1)}
                className="block w-full rounded-lg border border-stone-300 bg-white py-1.5 pl-8 pr-3 text-xs text-stone-800 placeholder-stone-400 focus:border-indigo-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={() => fetchEvents(1)}
              disabled={loading}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Filter className="h-3.5 w-3.5" />
              Filtrar
            </button>
            <button
              onClick={() => {
                setSearch('');
                setSelectedEntidad('TODAS');
                setDesde('');
                setHasta('');
                fetchEvents(1);
              }}
              className="rounded-lg border border-stone-300 bg-white p-1.5 text-stone-600 hover:bg-stone-50"
              title="Restablecer filtros"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Manejo de Error */}
        {error && (
          <div className="mx-6 mt-4 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            {error}
          </div>
        )}

        {/* Tabla de Eventos */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading && events.length === 0 ? (
            <div className="flex min-h-[200px] items-center justify-center">
              <RefreshCw className="h-6 w-6 animate-spin text-indigo-600" />
            </div>
          ) : events.length === 0 ? (
            <p className="py-12 text-center text-sm text-stone-400">
              No se encontraron registros de auditoría con los criterios especificados.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-stone-200 text-xs">
                <thead>
                  <tr className="bg-stone-100/70 text-left font-semibold text-stone-600 uppercase tracking-wider">
                    <th className="px-3 py-2.5">Fecha y Hora</th>
                    <th className="px-3 py-2.5">Entidad</th>
                    <th className="px-3 py-2.5">ID Recurso</th>
                    <th className="px-3 py-2.5">Acción</th>
                    <th className="px-3 py-2.5">Actor</th>
                    <th className="px-3 py-2.5">Motivo</th>
                    <th className="px-3 py-2.5 text-center">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-200 bg-white">
                  {events.map((e) => (
                    <tr key={e.id} className="hover:bg-indigo-50/30">
                      <td className="whitespace-nowrap px-3 py-2 text-stone-600 font-mono">
                        {new Date(e.creadoEn).toLocaleString('es-PE')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <span className="rounded bg-stone-100 px-2 py-0.5 font-medium text-stone-700">
                          {e.entidad}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-mono text-indigo-600 font-medium">
                        {e.entidadId}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 font-semibold text-stone-800">
                        {e.accion}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-stone-600">
                        {e.actor}
                      </td>
                      <td className="px-3 py-2 text-stone-500 max-w-xs truncate">
                        {e.motivo || '—'}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-center">
                        <button
                          onClick={() => setSelectedEvent(e)}
                          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-indigo-600"
                          title="Ver payload JSON"
                        >
                          <Code className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Modal Secundario: Vista de Payload JSON del Evento */}
        {selectedEvent && (
          <div className="absolute inset-0 z-60 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[80vh] w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
              <div className="flex items-center justify-between border-b border-stone-200 pb-3">
                <span className="text-sm font-bold text-stone-900">
                  Detalles de Evento: {selectedEvent.accion}
                </span>
                <button
                  onClick={() => setSelectedEvent(null)}
                  className="rounded p-1 text-stone-400 hover:text-stone-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 space-y-2 text-xs">
                <p><strong>ID Evento:</strong> <span className="font-mono">{selectedEvent.id}</span></p>
                <p><strong>Entidad:</strong> {selectedEvent.entidad} ({selectedEvent.entidadId})</p>
                <p><strong>Actor:</strong> {selectedEvent.actor}</p>
                <p><strong>Request ID:</strong> <span className="font-mono">{selectedEvent.requestId || '—'}</span></p>
                <p><strong>Motivo:</strong> {selectedEvent.motivo || '—'}</p>
                <div>
                  <strong>Payload Detallado:</strong>
                  <pre className="mt-1 max-h-48 overflow-y-auto rounded-lg bg-stone-900 p-3 font-mono text-[11px] text-emerald-400">
                    {JSON.stringify(selectedEvent.detalles, null, 2) || '{}'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Paginador Inferior */}
        <div className="flex items-center justify-between border-t border-stone-200 bg-stone-50 px-6 py-3 text-xs text-stone-600">
          <div>
            Mostrando <strong>{events.length}</strong> de <strong>{total}</strong> eventos
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchEvents(page - 1)}
              disabled={page <= 1 || loading}
              className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Anterior
            </button>
            <span className="px-2">
              Página {page} de {totalPages}
            </span>
            <button
              onClick={() => fetchEvents(page + 1)}
              disabled={page >= totalPages || loading}
              className="flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-100 disabled:opacity-40"
            >
              Siguiente <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
