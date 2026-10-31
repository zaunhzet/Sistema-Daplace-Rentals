import React, { useEffect, useState } from 'react';
import {
  Wrench,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Plus,
  RefreshCw,
  UserCheck,
  Building,
  FileCheck2,
  X,
  Loader2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { maintenanceService } from '../services/maintenanceService';
import type {
  CheckoutInspectionDto,
  CreateOrderDto,
  EstadoOrdenTrabajo,
  MaintenanceOrder,
  PrioridadTrabajo,
  TipoTrabajoMantenimiento,
} from '../types';

export const MaintenancePage: React.FC = () => {
  const [orders, setOrders] = useState<MaintenanceOrder[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState<string>('TODAS');

  // Modal Nueva Orden
  const [isOrderModalOpen, setIsOrderModalOpen] = useState<boolean>(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState<boolean>(false);
  const [orderModalError, setOrderModalError] = useState<string | null>(null);
  const [orderFormData, setOrderFormData] = useState<CreateOrderDto>({
    propiedadId: 'prop-01',
    titulo: '',
    descripcion: '',
    tipo: 'LIMPIEZA',
    prioridad: 'MEDIA',
    costoEstimado: 100,
    cambiarEstadoPropiedad: false,
  });

  // Modal Check-out (HU-10)
  const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState<boolean>(false);
  const [isSubmittingCheckout, setIsSubmittingCheckout] = useState<boolean>(false);
  const [checkoutModalError, setCheckoutModalError] = useState<string | null>(null);
  const [checkoutFormData, setCheckoutFormData] = useState<CheckoutInspectionDto>({
    reservaId: 'res-mock-101',
    conforme: true,
    observaciones: '',
    generarOrdenMantenimiento: true,
    tipoTrabajo: 'LIMPIEZA',
    prioridad: 'MEDIA',
    descripcionTrabajo: 'Limpieza y preparación para nuevo huésped',
  });

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await maintenanceService.getOrders({
        estado: filtroEstado !== 'TODAS' ? filtroEstado : undefined,
      });
      setOrders(data);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar las órdenes de trabajo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [filtroEstado]);

  const handleStatusChange = async (order: MaintenanceOrder, nuevoEstado: EstadoOrdenTrabajo) => {
    try {
      setActionLoadingId(order.id);
      setError(null);
      const updated = await maintenanceService.updateOrderStatus(order.id, {
        estado: nuevoEstado,
        restablecerPropiedadOperativa: nuevoEstado === 'COMPLETADA',
      });
      setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
      setSuccessMessage(`Orden "${order.titulo}" actualizada a ${nuevoEstado}.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Error al actualizar el estado de la orden');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderFormData.titulo.trim() || orderFormData.titulo.trim().length < 3) {
      setOrderModalError('El título debe tener al menos 3 caracteres.');
      return;
    }
    if (!orderFormData.descripcion.trim() || orderFormData.descripcion.trim().length < 5) {
      setOrderModalError('La descripción debe tener al menos 5 caracteres.');
      return;
    }

    try {
      setIsSubmittingOrder(true);
      setOrderModalError(null);
      const created = await maintenanceService.createOrder(orderFormData);
      setOrders((prev) => [created, ...prev]);
      setIsOrderModalOpen(false);
      setOrderFormData({
        propiedadId: 'prop-01',
        titulo: '',
        descripcion: '',
        tipo: 'LIMPIEZA',
        prioridad: 'MEDIA',
        costoEstimado: 100,
        cambiarEstadoPropiedad: false,
      });
      setSuccessMessage(`Orden de trabajo "${created.titulo}" registrada con éxito.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setOrderModalError(err?.message || 'No fue posible crear la orden de trabajo');
    } finally {
      setIsSubmittingOrder(false);
    }
  };

  const handleCheckoutSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmittingCheckout(true);
      setCheckoutModalError(null);
      const res = await maintenanceService.registerCheckout(checkoutFormData);
      await loadOrders();
      setIsCheckoutModalOpen(false);
      setSuccessMessage(
        `Salida de reserva ${res.reservaId.slice(0, 8)} registrada como ${
          res.conforme ? 'CONFORME' : 'CON INCIDENCIAS'
        }.`
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setCheckoutModalError(err?.message || 'Error al procesar el check-out');
    } finally {
      setIsSubmittingCheckout(false);
    }
  };

  // KPIs
  const totalPendientes = orders.filter((o) => o.estado === 'PENDIENTE').length;
  const totalEnProgreso = orders.filter((o) => o.estado === 'EN_PROGRESO').length;
  const totalCompletadas = orders.filter((o) => o.estado === 'COMPLETADA').length;

  return (
    <div className="space-y-6">
      {/* 1. Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
              Mantenimiento y Salidas
            </h1>
            <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600 border border-stone-200">
              HU-10 • HU-14 • HU-16 • HU-17
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Control de check-outs, inspecciones de campo, órdenes de acondicionamiento y asignación a operarios.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={loadOrders}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-xs transition hover:bg-stone-50 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refrescar</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setCheckoutModalError(null);
              setIsCheckoutModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 shadow-xs transition hover:bg-amber-100 cursor-pointer"
            title="Registrar inspección física de salida del huésped"
          >
            <FileCheck2 size={15} className="text-amber-700" />
            <span>Check-out Huésped (HU-10)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setOrderModalError(null);
              setIsOrderModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#183b32] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#122e27] cursor-pointer"
          >
            <Plus size={15} />
            <span>Nueva Orden</span>
          </button>
        </div>
      </div>

      {/* Alertas */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle size={16} className="shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 2. Tarjetas KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500">Pendientes</span>
            <span className="rounded-full bg-amber-100 p-1.5 text-amber-700">
              <Clock size={16} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-stone-900">{totalPendientes}</div>
          <p className="mt-0.5 text-[11px] text-stone-400">Trabajos por iniciar o asignar</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500">En Progreso</span>
            <span className="rounded-full bg-indigo-100 p-1.5 text-indigo-700">
              <Wrench size={16} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-stone-900">{totalEnProgreso}</div>
          <p className="mt-0.5 text-[11px] text-stone-400">Operarios en campo trabajando</p>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-stone-500">Completadas</span>
            <span className="rounded-full bg-emerald-100 p-1.5 text-emerald-700">
              <CheckCircle2 size={16} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-bold text-stone-900">{totalCompletadas}</div>
          <p className="mt-0.5 text-[11px] text-stone-400">Inmuebles acondicionados y operativos</p>
        </div>
      </div>

      {/* 3. Tabla y Filtros de Órdenes */}
      <div className="rounded-xl border border-stone-200 bg-white shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-200/80 bg-stone-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-stone-700">
              Órdenes de Trabajo ({orders.length})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-xs text-stone-500">Estado:</label>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs text-stone-800 focus:outline-hidden cursor-pointer"
            >
              <option value="TODAS">Todas las órdenes</option>
              <option value="PENDIENTE">Pendientes</option>
              <option value="EN_PROGRESO">En Progreso</option>
              <option value="COMPLETADA">Completadas</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-stone-400">
            <Loader2 size={28} className="animate-spin text-[#183b32]" />
            <p className="mt-2 text-xs font-medium">Cargando órdenes de trabajo...</p>
          </div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-stone-500">
            <Wrench size={36} className="mx-auto text-stone-300 mb-2" />
            <p className="text-sm font-semibold">No hay órdenes de trabajo activas</p>
            <p className="text-xs text-stone-400 mt-1">
              Las órdenes se generan automáticamente en el check-out o manualmente cuando se requiera.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-600">
              <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Orden & Trabajo</th>
                  <th className="px-4 py-3">Inmueble</th>
                  <th className="px-4 py-3">Tipo / Prioridad</th>
                  <th className="px-4 py-3">Asignado a (HU-14)</th>
                  <th className="px-4 py-3">Estado (HU-16)</th>
                  <th className="px-4 py-3">Costo Est. / Real</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {orders.map((o) => {
                  const isBusy = actionLoadingId === o.id;

                  return (
                    <tr key={o.id} className="hover:bg-stone-50/75 transition">
                      <td className="px-4 py-3.5">
                        <div className="font-semibold text-stone-900">{o.titulo}</div>
                        <div className="text-[11px] text-stone-500 line-clamp-1">{o.descripcion}</div>
                        {o.reservaId && (
                          <div className="text-[10px] text-stone-400 font-mono mt-0.5">
                            Check-out Reserva: {o.reservaId.slice(0, 8)}...
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-stone-800 font-medium">
                          <Building size={13} className="text-stone-400 shrink-0" />
                          <span>{o.propiedadNombre}</span>
                        </div>
                        {o.propiedadEstadoOperativo && (
                          <span
                            className={`inline-block mt-0.5 rounded px-1.5 py-0.2 text-[9px] font-semibold ${
                              o.propiedadEstadoOperativo === 'EN_MANTENIMIENTO'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {o.propiedadEstadoOperativo}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1 items-start">
                          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-700">
                            {o.tipo}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                              o.prioridad === 'URGENTE' || o.prioridad === 'ALTA'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-stone-100 text-stone-600'
                            }`}
                          >
                            {o.prioridad}
                          </span>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        {o.asignadoA ? (
                          <div className="flex items-center gap-1.5 text-stone-800">
                            <UserCheck size={14} className="text-emerald-600 shrink-0" />
                            <div>
                              <div className="font-medium text-[11px]">{o.asignadoA.nombre}</div>
                              <div className="text-[10px] text-stone-400">{o.asignadoA.email}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-[11px] text-amber-600 font-medium italic">
                            Sin asignar
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <select
                          value={o.estado}
                          onChange={(e) => handleStatusChange(o, e.target.value as EstadoOrdenTrabajo)}
                          disabled={isBusy}
                          className={`rounded-lg border px-2 py-1 text-[11px] font-semibold cursor-pointer disabled:opacity-50 ${
                            o.estado === 'COMPLETADA'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : o.estado === 'EN_PROGRESO'
                              ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                              : 'border-amber-200 bg-amber-50 text-amber-800'
                          }`}
                        >
                          <option value="PENDIENTE">PENDIENTE</option>
                          <option value="EN_PROGRESO">EN PROGRESO</option>
                          <option value="COMPLETADA">COMPLETADA</option>
                          <option value="CANCELADA">CANCELADA</option>
                        </select>
                      </td>

                      <td className="px-4 py-3.5 font-mono text-[11px]">
                        <div>Est: S/ {o.costoEstimado ? o.costoEstimado.toFixed(2) : '—'}</div>
                        {o.costoReal !== null && o.costoReal !== undefined && (
                          <div className="text-emerald-700 font-bold">
                            Real: S/ {o.costoReal.toFixed(2)}
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        {o.estado !== 'COMPLETADA' && (
                          <button
                            type="button"
                            onClick={() => handleStatusChange(o, 'COMPLETADA')}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 cursor-pointer"
                            title="Completar trabajo y restablecer propiedad"
                          >
                            {isBusy ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : (
                              <>
                                <CheckCircle2 size={12} />
                                <span>Finalizar</span>
                              </>
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 4. Modal Nueva Orden de Trabajo */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-emerald-50 p-2 text-[#183b32]">
                  <Wrench size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Nueva Orden de Trabajo</h3>
                  <p className="text-[11px] text-stone-400">HU-14: Asignación y programación de tareas</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOrderModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {orderModalError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                <AlertCircle size={15} className="shrink-0 text-rose-600" />
                <span>{orderModalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateOrderSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Título de la Tarea *
                </label>
                <input
                  type="text"
                  required
                  value={orderFormData.titulo}
                  onChange={(e) => setOrderFormData({ ...orderFormData, titulo: e.target.value })}
                  placeholder="Ej. Resane de pared y pintura"
                  className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-900 focus:border-[#183b32] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Descripción Detallada *
                </label>
                <textarea
                  required
                  rows={2}
                  value={orderFormData.descripcion}
                  onChange={(e) => setOrderFormData({ ...orderFormData, descripcion: e.target.value })}
                  placeholder="Detalla los trabajos necesarios..."
                  className="w-full rounded-lg border border-stone-300 p-2.5 text-xs text-stone-900 focus:border-[#183b32] focus:outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Tipo</label>
                  <select
                    value={orderFormData.tipo}
                    onChange={(e) =>
                      setOrderFormData({ ...orderFormData, tipo: e.target.value as TipoTrabajoMantenimiento })
                    }
                    className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-900 cursor-pointer"
                  >
                    <option value="LIMPIEZA">LIMPIEZA</option>
                    <option value="REPARACION">REPARACIÓN</option>
                    <option value="INSPECCION">INSPECCIÓN</option>
                    <option value="PINTURA">PINTURA</option>
                    <option value="OTRO">OTRO</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">Prioridad</label>
                  <select
                    value={orderFormData.prioridad}
                    onChange={(e) =>
                      setOrderFormData({ ...orderFormData, prioridad: e.target.value as PrioridadTrabajo })
                    }
                    className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-900 cursor-pointer"
                  >
                    <option value="BAJA">BAJA</option>
                    <option value="MEDIA">MEDIA</option>
                    <option value="ALTA">ALTA</option>
                    <option value="URGENTE">URGENTE</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Costo Estimado (S/)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={orderFormData.costoEstimado || ''}
                  onChange={(e) =>
                    setOrderFormData({ ...orderFormData, costoEstimado: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-900 focus:border-[#183b32] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-cambiar-estado"
                  checked={orderFormData.cambiarEstadoPropiedad}
                  onChange={(e) =>
                    setOrderFormData({ ...orderFormData, cambiarEstadoPropiedad: e.target.checked })
                  }
                  className="size-4 rounded border-stone-300 text-[#183b32] focus:ring-0 cursor-pointer"
                />
                <label htmlFor="chk-cambiar-estado" className="text-xs text-stone-700 cursor-pointer">
                  Poner inmueble temporalmente <span className="font-semibold text-amber-800">EN MANTENIMIENTO</span>
                </label>
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOrderModalOpen(false)}
                  disabled={isSubmittingOrder}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOrder}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#183b32] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#122e27] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingOrder && <Loader2 size={13} className="animate-spin" />}
                  <span>Crear Orden</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. Modal Check-out Huésped (HU-10) */}
      {isCheckoutModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-amber-50 p-2 text-amber-800">
                  <FileCheck2 size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Inspección de Check-out</h3>
                  <p className="text-[11px] text-stone-400">HU-10: Registro de salida y necesidad de acondicionamiento</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {checkoutModalError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                <AlertCircle size={15} className="shrink-0 text-rose-600" />
                <span>{checkoutModalError}</span>
              </div>
            )}

            <form onSubmit={handleCheckoutSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Reserva a Liquidar Salida
                </label>
                <input
                  type="text"
                  required
                  value={checkoutFormData.reservaId}
                  onChange={(e) =>
                    setCheckoutFormData({ ...checkoutFormData, reservaId: e.target.value })
                  }
                  placeholder="ID de Reserva Confirmada"
                  className="w-full rounded-lg border border-stone-300 px-3 py-1.5 text-xs text-stone-900 font-mono focus:border-[#183b32] focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                  Resultado de la Inspección Física
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCheckoutFormData({
                        ...checkoutFormData,
                        conforme: true,
                        descripcionTrabajo: 'Limpieza regular tras check-out',
                      })
                    }
                    className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold transition cursor-pointer ${
                      checkoutFormData.conforme
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <Sparkles size={14} className={checkoutFormData.conforme ? 'text-emerald-600' : ''} />
                    <span>Conforme (Sin daños)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCheckoutFormData({
                        ...checkoutFormData,
                        conforme: false,
                        descripcionTrabajo: 'Reparación por incidencias reportadas en salida',
                      })
                    }
                    className={`flex items-center justify-center gap-1.5 rounded-lg border p-2 text-xs font-semibold transition cursor-pointer ${
                      !checkoutFormData.conforme
                        ? 'border-rose-300 bg-rose-50 text-rose-800'
                        : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
                    }`}
                  >
                    <AlertTriangle size={14} className={!checkoutFormData.conforme ? 'text-rose-600' : ''} />
                    <span>Con Incidencias / Daños</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Observaciones de Salida
                </label>
                <textarea
                  rows={2}
                  value={checkoutFormData.observaciones || ''}
                  onChange={(e) =>
                    setCheckoutFormData({ ...checkoutFormData, observaciones: e.target.value })
                  }
                  placeholder="Detalles sobre entrega de llaves, limpieza, estado de enseres..."
                  className="w-full rounded-lg border border-stone-300 p-2.5 text-xs text-stone-900 focus:border-[#183b32] focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chk-generar-orden"
                  checked={checkoutFormData.generarOrdenMantenimiento}
                  onChange={(e) =>
                    setCheckoutFormData({
                      ...checkoutFormData,
                      generarOrdenMantenimiento: e.target.checked,
                    })
                  }
                  className="size-4 rounded border-stone-300 text-[#183b32] focus:ring-0 cursor-pointer"
                />
                <label htmlFor="chk-generar-orden" className="text-xs text-stone-700 cursor-pointer">
                  Generar orden de acondicionamiento post-salida automáticamente
                </label>
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCheckoutModalOpen(false)}
                  disabled={isSubmittingCheckout}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingCheckout}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#183b32] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#122e27] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingCheckout && <Loader2 size={13} className="animate-spin" />}
                  <span>Registrar Check-out</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
