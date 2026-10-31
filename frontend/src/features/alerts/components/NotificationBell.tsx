import React, { useEffect, useRef, useState } from 'react';
import { Bell, Clock, AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { alertService } from '../services/alertService';
import type { InternalAlert } from '../types';

export const NotificationBell: React.FC = () => {
  const [alerts, setAlerts] = useState<InternalAlert[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      const res = await alertService.getAlerts(15);
      setAlerts(res.data);
      setPendingCount(res.meta.totalPendientes);
    } catch {
      // Manejo silencioso en el polling de campana
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    const interval = setInterval(fetchAlerts, 30000); // Polling suave cada 30s
    return () => clearInterval(interval);
  }, []);

  // Cierre al hacer click fuera del dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleAttend = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await alertService.attendAlert(id);
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, estado: 'ENVIADO', enviadoEn: new Date().toISOString() } : a))
      );
      setPendingCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Silencioso
    }
  };

  return (
    <div className="relative inline-block text-left" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchAlerts();
        }}
        className="relative rounded-lg p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        title="Alertas y Notificaciones de Reservas"
        aria-label="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        {pendingCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[10px] font-bold text-white shadow-xs">
            {pendingCount > 9 ? '9+' : pendingCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-2 w-80 sm:w-96 rounded-xl border border-stone-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-stone-900 text-sm">Alertas del Sistema</span>
              {pendingCount > 0 && (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-700">
                  {pendingCount} pendientes
                </span>
              )}
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-stone-400 hover:text-stone-600"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-stone-100">
            {loading && alerts.length === 0 ? (
              <p className="p-4 text-center text-xs text-stone-400">Cargando alertas...</p>
            ) : alerts.length === 0 ? (
              <p className="p-6 text-center text-xs text-stone-400">No hay alertas registradas.</p>
            ) : (
              alerts.map((alert) => {
                const isPending = alert.estado === 'PROGRAMADO' || alert.estado === 'PENDIENTE';
                const isExpiring = alert.tipoAviso === 'EXPIRACION_PROXIMA';

                return (
                  <div
                    key={alert.id}
                    className={`p-3.5 transition-colors hover:bg-stone-50 ${
                      isPending ? 'bg-amber-50/40' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        {isExpiring ? (
                          <Clock className="h-4 w-4 text-amber-600 flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                        )}
                        <span className={`text-xs font-semibold ${isExpiring ? 'text-amber-800' : 'text-rose-800'}`}>
                          {isExpiring ? 'Vencimiento Próximo' : 'Solicitud Expirada'}
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-400">
                        {new Date(alert.programadoPara).toLocaleTimeString('es-PE', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    <p className="mt-1 text-xs font-medium text-stone-800">
                      {alert.reserva.propiedadNombre}
                    </p>
                    <p className="text-xs text-stone-500">
                      Huésped: {alert.reserva.huespedNombre} • Monto: {alert.reserva.moneda} {alert.reserva.montoAcordado}
                    </p>

                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[10px] text-stone-400">
                        Reserva: {alert.reservaId}
                      </span>
                      {isPending && (
                        <button
                          onClick={(e) => handleAttend(alert.id, e)}
                          className="flex items-center gap-1 rounded bg-stone-100 px-2 py-0.5 text-[10px] font-medium text-stone-700 hover:bg-stone-200"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          Marcar atendida
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
