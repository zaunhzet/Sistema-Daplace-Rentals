import React from 'react';
import { useNavigate, useLocation } from 'react-router';
import {
  AlertTriangle,
  ArrowRight,
  Info,
  ShieldAlert,
  KeyRound,
} from 'lucide-react';
import { NAVIGATION_ITEMS } from '../shared/navigation';
import type { NavigationItem } from '../shared/navigation';

interface PendingModuleViewProps {
  path?: string;
}

export const PendingModuleView: React.FC<PendingModuleViewProps> = ({ path: propPath }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const currentPath = propPath || location.pathname;

  const item = NAVIGATION_ITEMS.find((it) => it.path === currentPath) || {
    id: 'pending-route',
    name: currentPath === '/login' ? 'Acceso al Sistema' : 'Módulo en Construcción',
    path: currentPath,
    icon: currentPath === '/login' ? KeyRound : Info,
    description:
      currentPath === '/login'
        ? 'Módulo de autenticación, sesión y credenciales de operadores (RF09 / HU-08).'
        : 'Esta funcionalidad forma parte del backlog del MVP y será habilitada próximamente.',
    status: 'PENDIENTE',
    responsible: currentPath === '/login' ? 'Diego' : 'Diego',
    group: currentPath === '/login' ? 'Principal' : 'Operaciones',
  } as NavigationItem;

  const ModuleIcon = item.icon;

  const getCustomContent = () => {
    switch (currentPath) {
      case '/login':
        return {
          title: 'Acceso al Sistema y Autenticación',
          badge: 'En desarrollo por Diego (RF09 / HU-08)',
          headline: 'Gestión de Credenciales y Sesión de Operador',
          description:
            'Diego está implementando el módulo formal de autenticación con validación de credenciales seguras, roles y emisión de tokens. Durante esta fase de demostración del MVP, todas las rutas operativas de André están accesibles sin guardas de sesión.',
          alertTitle: 'Aviso de Seguridad y Modo Demostración',
          alertText:
            'Hasta que Diego integre el formulario y la validación real con el backend, este panel opera como una demostración abierta para revisión funcional de flujos. No asuma que las rutas están protegidas.',
          primaryActionText: 'Explorar Gestión de Propiedades',
          primaryActionPath: '/propiedades',
        };
      case '/dashboard':
        return {
          title: 'Dashboard Transaccional',
          badge: 'En desarrollo por Diego (RF09 / HU-08)',
          headline: 'Métricas Ejecutivas y Resumen Operativo',
          description:
            'Diego integrará aquí el panel ejecutivo con tarjetas de KPIs consolidados, gráficos de ocupación temporal e indicadores de recaudación, alimentándose directamente de los servicios financieros y de reservas compartidos.',
          alertTitle: 'Servicios de Lectura Disponibles',
          alertText:
            'El servicio financialReadService ya se encuentra implementado y listo para proveer totales conciliados segregados de ingresos y custodia de garantías.',
          primaryActionText: 'Ver Gestión de Reservas',
          primaryActionPath: '/reservas',
        };
      case '/reportes':
        return {
          title: 'Reportes de Liquidación',
          badge: 'En desarrollo por Diego (RF08, RF12 / HU-07, HU-12)',
          headline: 'Liquidaciones a Propietarios y Auditoría',
          description:
            'Módulo para emitir reportes reproducibles por propiedad y período contable, aplicando deducciones de comisión y autorizaciones de propietarios sobre ingresos conciliados.',
          alertTitle: 'Separación Patrimonial Garantizada',
          alertText:
            'La arquitectura financiera implementada garantiza que los depósitos en garantía no se computarán como ingresos de alquiler en los reportes de liquidación.',
          primaryActionText: 'Ver Pagos y Conciliación',
          primaryActionPath: '/pagos',
        };
      case '/personal':
        return {
          title: 'Personal y Cuentas',
          badge: 'En desarrollo por Diego (RF09 / HU-19)',
          headline: 'Control de Acceso y Operadores Internos',
          description:
            'Administración de cuentas internas de trabajo, asignación de roles (Administrador, Operador, Mantenimiento) y auditoría de accesos al sistema.',
          alertTitle: 'Integración Coordinada',
          alertText:
            'Este módulo se conectará con el esquema de usuarios y roles provisto por Fastify/PostgreSQL.',
          primaryActionText: 'Ir a Huéspedes',
          primaryActionPath: '/huespedes',
        };
      case '/mantenimiento':
        return {
          title: 'Mantenimiento y Salidas',
          badge: 'Módulo Colaborativo (RF07, RF13 / HU-10, HU-14)',
          headline: 'Inspecciones Post-Check-out y Órdenes de Trabajo',
          description:
            'Gestión de necesidades de mantenimiento preventivo y correctivo surgidas tras las salidas de huéspedes, con asignación de personal y retención documentada de garantías.',
          alertTitle: 'Vinculación con Garantías',
          alertText:
            'El módulo de Garantías ya soporta retenciones por daños documentados vinculables a reportes de mantenimiento.',
          primaryActionText: 'Ver Calendario Operativo',
          primaryActionPath: '/calendario',
        };
      default:
        return {
          title: `Módulo ${item.name}`,
          badge: 'Pendiente de desarrollo',
          headline: item.description,
          description:
            'Esta pantalla no simula datos inexistentes. Se habilitará cuando el responsable correspondiente complete su implementación según el backlog técnico.',
          alertTitle: 'Integración Pendiente',
          alertText:
            'Funcionalidad programada para próximas iteraciones del desarrollo transaccional.',
          primaryActionText: 'Ir a Propiedades',
          primaryActionPath: '/propiedades',
        };
    }
  };

  const content = getCustomContent();

  return (
    <div className="w-full max-w-4xl mx-auto py-2 sm:py-4">
      <div className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-8 shadow-2xs">
        {/* Header Badges */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="grid size-9 place-items-center rounded-xl bg-[#5E6C5B]/15 text-[#183b32]">
            <ModuleIcon size={20} strokeWidth={1.8} aria-hidden="true" />
          </div>
          <span className="rounded-lg bg-stone-100 px-2.5 py-1 font-mono text-[11px] font-semibold text-stone-700">
            Ruta: {currentPath}
          </span>
          <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-900 flex items-center gap-1.5">
            <AlertTriangle size={13} aria-hidden="true" />
            {content.badge}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
          {content.title}
        </h1>
        <p className="mt-1 text-sm font-medium text-stone-700">
          {content.headline}
        </p>
        <p className="mt-3 text-sm leading-relaxed text-stone-600 max-w-2xl">
          {content.description}
        </p>

        {/* Responsible & Architecture Box */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 max-w-xl">
          <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Responsable Asignado
            </span>
            <span className="mt-1 block text-base font-bold text-stone-900">
              {item.responsible}
            </span>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-stone-500">
              Grupo de Arquitectura
            </span>
            <span className="mt-1 block text-base font-bold text-stone-900">
              {item.group}
            </span>
          </div>
        </div>

        {/* Governance / Notice Banner */}
        <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950 leading-relaxed">
          <p className="font-semibold text-amber-900 flex items-center gap-1.5 mb-1">
            <ShieldAlert size={15} className="shrink-0 text-amber-800" aria-hidden="true" />
            <span>{content.alertTitle}</span>
          </p>
          <p className="text-amber-900/90">{content.alertText}</p>
        </div>

        {/* Navigation Shortcut to Active Modules */}
        <div className="mt-8 pt-6 border-t border-stone-200 flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => navigate(content.primaryActionPath)}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#162A2C] px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-[#243f42] cursor-pointer transition-colors"
          >
            <span>{content.primaryActionText}</span>
            <ArrowRight size={16} aria-hidden="true" />
          </button>

          <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-stone-500">
            <span>Módulos disponibles:</span>
            <button
              type="button"
              onClick={() => navigate('/propiedades')}
              className="font-medium text-[#5E6C5B] hover:underline cursor-pointer"
            >
              Propiedades
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => navigate('/reservas')}
              className="font-medium text-[#5E6C5B] hover:underline cursor-pointer"
            >
              Reservas
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => navigate('/pagos')}
              className="font-medium text-[#5E6C5B] hover:underline cursor-pointer"
            >
              Pagos
            </button>
            <span>·</span>
            <button
              type="button"
              onClick={() => navigate('/garantias')}
              className="font-medium text-[#5E6C5B] hover:underline cursor-pointer"
            >
              Garantías
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
