import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Building2,
  Calendar,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  RefreshCw,
  ShieldAlert,
  Wallet,
} from 'lucide-react';
import { reportService } from '../services/reportService';
import type { LiquidationReport } from '../types';
import { propertyService } from '../../properties';
import type { Property } from '../../properties/types';

const MESES = [
  { value: 1, label: 'Enero' },
  { value: 2, label: 'Febrero' },
  { value: 3, label: 'Marzo' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Mayo' },
  { value: 6, label: 'Junio' },
  { value: 7, label: 'Julio' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Septiembre' },
  { value: 10, label: 'Octubre' },
  { value: 11, label: 'Noviembre' },
  { value: 12, label: 'Diciembre' },
];

const ANIOS = [2025, 2026, 2027];

export const ReportsPage: React.FC = () => {
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropiedadId, setSelectedPropiedadId] = useState<string>('');
  const [selectedMes, setSelectedMes] = useState<number>(10);
  const [selectedAnio, setSelectedAnio] = useState<number>(2026);

  const [report, setReport] = useState<LiquidationReport | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'ingresos' | 'gastos' | 'garantias'>('ingresos');

  // Cargar lista de propiedades para el selector
  useEffect(() => {
    async function loadProperties() {
      try {
        const props = await propertyService.getProperties({ soloActivas: true });
        setProperties(props);
        if (props.length > 0) {
          setSelectedPropiedadId(props[0].id);
        }
      } catch (err: any) {
        setError(err.message || 'Error al cargar propiedades');
      }
    }
    loadProperties();
  }, []);

  // Cargar liquidación cuando se seleccione una propiedad o cambie el período
  const fetchReport = async (propId: string, mes: number, anio: number) => {
    if (!propId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await reportService.getLiquidacion({
        propiedadId: propId,
        mes,
        anio,
      });
      setReport(data);
    } catch (err: any) {
      setError(err.message || 'No fue posible cargar el reporte de liquidación');
      setReport(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedPropiedadId) {
      fetchReport(selectedPropiedadId, selectedMes, selectedAnio);
    }
  }, [selectedPropiedadId, selectedMes, selectedAnio]);

  // Manejador de descarga de CSV (HU-12)
  const handleExportCsv = async () => {
    if (!selectedPropiedadId) return;
    setExporting(true);
    try {
      const { blob, filename } = await reportService.downloadLiquidacionCsv({
        propiedadId: selectedPropiedadId,
        mes: selectedMes,
        anio: selectedAnio,
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Error al exportar liquidación a CSV');
    } finally {
      setExporting(false);
    }
  };

  const formatMoney = (amount: number, currency = 'PEN') => {
    return `${currency} ${amount.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return (
    <div className="space-y-6 p-6">
      {/* Encabezado */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <BarChart3 className="h-7 w-7 text-indigo-600" />
            Liquidaciones y Reportes Financieros
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Cálculo contable exacto de ingresos conciliados y deducción de gastos operativos por propiedad y período.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchReport(selectedPropiedadId, selectedMes, selectedAnio)}
            disabled={loading || !selectedPropiedadId}
            className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
            title="Recargar reporte"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
          <button
            onClick={handleExportCsv}
            disabled={exporting || loading || !report}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            {exporting ? 'Generando CSV...' : 'Descargar Liquidación (CSV)'}
          </button>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="grid grid-cols-1 gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:grid-cols-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Inmueble / Propiedad
          </label>
          <div className="relative mt-1">
            <Building2 className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <select
              value={selectedPropiedadId}
              onChange={(e) => setSelectedPropiedadId(e.target.value)}
              className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {properties.length === 0 ? (
                <option value="">No hay propiedades disponibles</option>
              ) : (
                properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} {p.propietarioNombre ? `(${p.propietarioNombre})` : ''}
                  </option>
                ))
              )}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Mes de Liquidación
          </label>
          <div className="relative mt-1">
            <Calendar className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <select
              value={selectedMes}
              onChange={(e) => setSelectedMes(Number(e.target.value))}
              className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {MESES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Año Fiscal
          </label>
          <div className="relative mt-1">
            <Calendar className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <select
              value={selectedAnio}
              onChange={(e) => setSelectedAnio(Number(e.target.value))}
              className="block w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {ANIOS.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Manejo de Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <ShieldAlert className="h-5 w-5 flex-shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {/* Estado de Carga */}
      {loading && (
        <div className="flex min-h-[250px] items-center justify-center rounded-xl border border-gray-200 bg-white p-8">
          <div className="flex flex-col items-center gap-2">
            <RefreshCw className="h-8 w-8 animate-spin text-indigo-600" />
            <p className="text-sm text-gray-500">Consolidando liquidación contable...</p>
          </div>
        </div>
      )}

      {/* Contenido del Reporte */}
      {!loading && report && (
        <div className="space-y-6">
          {/* Tarjetas KPI Financieras */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* KPI 1: Ingresos Conciliados */}
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                  Ingresos Conciliados
                </span>
                <span className="rounded-full bg-emerald-100 p-1.5 text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-emerald-950">
                {formatMoney(report.resumen.totalIngresos, report.moneda)}
              </p>
              <p className="mt-1 text-xs text-emerald-700">
                {report.resumen.cantidadPagosConciliados} pago(s) conciliado(s)
              </p>
            </div>

            {/* KPI 2: Gastos Aprobados */}
            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-rose-800">
                  Gastos Deducibles
                </span>
                <span className="rounded-full bg-rose-100 p-1.5 text-rose-700">
                  <Wallet className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-rose-950">
                {formatMoney(report.resumen.totalGastos, report.moneda)}
              </p>
              <p className="mt-1 text-xs text-rose-700">
                {report.resumen.cantidadGastosAprobados} gasto(s) aprobado(s)
              </p>
            </div>

            {/* KPI 3: Balance Neto Propietario */}
            <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-indigo-800">
                  Balance Neto a Transferir
                </span>
                <span className="rounded-full bg-indigo-100 p-1.5 text-indigo-700">
                  <FileSpreadsheet className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-indigo-950">
                {formatMoney(report.resumen.balanceNeto, report.moneda)}
              </p>
              <p className="mt-1 text-xs text-indigo-700">
                Ingresos Conciliados - Gastos Deducibles
              </p>
            </div>

            {/* KPI 4: Garantías en Custodia (Aisladas) */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-800">
                  Garantías en Custodia
                </span>
                <span className="rounded-full bg-amber-100 p-1.5 text-amber-700">
                  <ShieldAlert className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-amber-950">
                {formatMoney(report.resumen.garantiasEnCustodia, report.moneda)}
              </p>
              <p className="mt-1 text-xs font-medium text-amber-700">
                Fondos en custodia — No computable como ingreso
              </p>
            </div>
          </div>

          {/* Información del Inmueble y Período */}
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 border-b border-gray-100 pb-4 sm:flex-row sm:items-center">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{report.propiedad.nombre}</h2>
                <p className="text-xs text-gray-500">{report.propiedad.direccion}</p>
              </div>
              <div className="text-right">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-800">
                  Propietario: {report.propiedad.propietarioNombre}
                </span>
                <p className="mt-1 text-xs text-gray-500">Período: {report.periodo.etiqueta}</p>
              </div>
            </div>

            {/* Pestañas de Detalle */}
            <div className="mt-4 border-b border-gray-200">
              <nav className="-mb-px flex space-x-8">
                <button
                  onClick={() => setActiveTab('ingresos')}
                  className={`border-b-2 py-3 text-sm font-medium ${
                    activeTab === 'ingresos'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  Ingresos Conciliados ({report.ingresos.length})
                </button>
                <button
                  onClick={() => setActiveTab('gastos')}
                  className={`border-b-2 py-3 text-sm font-medium ${
                    activeTab === 'gastos'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  Gastos Deducibles ({report.gastos.length})
                </button>
                <button
                  onClick={() => setActiveTab('garantias')}
                  className={`border-b-2 py-3 text-sm font-medium ${
                    activeTab === 'garantias'
                      ? 'border-indigo-600 text-indigo-600'
                      : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                  }`}
                >
                  Garantías en Custodia ({report.garantias.length})
                </button>
              </nav>
            </div>

            {/* Tabla: Ingresos Conciliados */}
            {activeTab === 'ingresos' && (
              <div className="mt-4 overflow-x-auto">
                {report.ingresos.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">
                    No se registran pagos conciliados en este período.
                  </p>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        <th className="px-4 py-3">Fecha Pago</th>
                        <th className="px-4 py-3">ID Reserva</th>
                        <th className="px-4 py-3">Concepto</th>
                        <th className="px-4 py-3">Método</th>
                        <th className="px-4 py-3">Referencia</th>
                        <th className="px-4 py-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {report.ingresos.map((item) => (
                        <tr key={item.pagoId} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">{item.fechaPago}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">{item.reservaId}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-800 font-medium">{item.concepto}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600">{item.metodoPago}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">{item.referenciaOperacion}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-emerald-700">
                            {formatMoney(item.monto, report.moneda)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tabla: Gastos Deducibles */}
            {activeTab === 'gastos' && (
              <div className="mt-4 overflow-x-auto">
                {report.gastos.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">
                    No se registran gastos aprobados en este período.
                  </p>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        <th className="px-4 py-3">Fecha Gasto</th>
                        <th className="px-4 py-3">Categoría</th>
                        <th className="px-4 py-3">Título / Concepto</th>
                        <th className="px-4 py-3">Pagado Por</th>
                        <th className="px-4 py-3 text-right">Monto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {report.gastos.map((item) => (
                        <tr key={item.gastoId} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-3 text-gray-700">{item.fechaGasto}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                              {item.categoria}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-medium text-gray-800">{item.titulo}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-gray-600">{item.pagadoPor}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-rose-700">
                            {formatMoney(item.monto, report.moneda)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {/* Tabla: Garantías en Custodia */}
            {activeTab === 'garantias' && (
              <div className="mt-4 overflow-x-auto">
                {report.garantias.length === 0 ? (
                  <p className="py-8 text-center text-sm text-gray-400">
                    No hay garantías retenidas en custodia para las reservas de este período.
                  </p>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                        <th className="px-4 py-3">ID Garantía</th>
                        <th className="px-4 py-3">ID Reserva</th>
                        <th className="px-4 py-3">Estado Custodia</th>
                        <th className="px-4 py-3 text-right">Monto en Depósito</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {report.garantias.map((item) => (
                        <tr key={item.garantiaId} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">{item.garantiaId}</td>
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-500">{item.reservaId}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                              {item.estado}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-amber-800">
                            {formatMoney(item.monto, report.moneda)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
