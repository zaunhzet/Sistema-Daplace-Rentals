import React, { useState, useEffect } from 'react';
import { X, Check, AlertCircle } from 'lucide-react';
import type { CreateExpenseDto, Expense, UpdateExpenseDto } from '../types';
import type { Property } from '../../properties';
import { validateExpensePayload } from '../services/expenseService';

interface ExpenseFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitCreate: (dto: CreateExpenseDto) => Promise<void>;
  onSubmitUpdate: (id: string, dto: UpdateExpenseDto) => Promise<void>;
  expenseToEdit: Expense | null;
  properties: Property[];
}

const COMMON_CATEGORIES = [
  'Mantenimiento',
  'Limpieza',
  'Lavandería y Blancos',
  'Servicios Básicos (Luz/Agua/Gas)',
  'Telecomunicaciones e Internet',
  'Suministros y Amenities',
  'Reparaciones y Cerrajería',
  'Administración',
  'Otros Gastos Operativos',
];

const COMMON_PAYERS = ['DAPLACE', 'PROPIETARIO', 'OPERADOR', 'HUESPED', 'OTRO'];

export const ExpenseFormModal: React.FC<ExpenseFormModalProps> = ({
  isOpen,
  onClose,
  onSubmitCreate,
  onSubmitUpdate,
  expenseToEdit,
  properties,
}) => {
  const isEditing = Boolean(expenseToEdit);

  const [propiedadId, setPropiedadId] = useState<string>('');
  const [fechaGasto, setFechaGasto] = useState<string>('');
  const [periodoMes, setPeriodoMes] = useState<number>(new Date().getMonth() + 1);
  const [periodoAnio, setPeriodoAnio] = useState<number>(new Date().getFullYear());
  const [titulo, setTitulo] = useState<string>('');
  const [categoria, setCategoria] = useState<string>('Mantenimiento');
  const [monto, setMonto] = useState<string>('');
  const [pagadoPor, setPagadoPor] = useState<string>('DAPLACE');
  const [repartido, setRepartido] = useState<string>('');
  const [usoRucDaplace, setUsoRucDaplace] = useState<string>('null'); // 'true' | 'false' | 'null'
  const [notas, setNotas] = useState<string>('');

  // Sustento opcional al crear
  const [sustentoNombre, setSustentoNombre] = useState<string>('');
  const [sustentoUrl, setSustentoUrl] = useState<string>('');

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    if (expenseToEdit) {
      setPropiedadId(expenseToEdit.propiedadId);
      setFechaGasto(expenseToEdit.fechaGasto);
      setPeriodoMes(expenseToEdit.periodoMes);
      setPeriodoAnio(expenseToEdit.periodoAnio);
      setTitulo(expenseToEdit.titulo);
      setCategoria(expenseToEdit.categoria);
      setMonto(expenseToEdit.monto);
      setPagadoPor(expenseToEdit.pagadoPor);
      setRepartido(expenseToEdit.repartido || '');
      setUsoRucDaplace(
        expenseToEdit.usoRucDaplace === true ? 'true' : expenseToEdit.usoRucDaplace === false ? 'false' : 'null'
      );
      setNotas(expenseToEdit.notas || '');
      setSustentoNombre('');
      setSustentoUrl('');
    } else {
      const today = new Date();
      const dateStr = today.toISOString().slice(0, 10);
      setPropiedadId(properties[0]?.id || '');
      setFechaGasto(dateStr);
      setPeriodoMes(today.getMonth() + 1);
      setPeriodoAnio(today.getFullYear());
      setTitulo('');
      setCategoria('Mantenimiento');
      setMonto('');
      setPagadoPor('DAPLACE');
      setRepartido('');
      setUsoRucDaplace('null');
      setNotas('');
      setSustentoNombre('');
      setSustentoUrl('');
    }
    setFormErrors({});
    setGlobalError(null);
  }, [expenseToEdit, properties, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    setGlobalError(null);

    const rucValue = usoRucDaplace === 'true' ? true : usoRucDaplace === 'false' ? false : null;

    if (isEditing && expenseToEdit) {
      const dto: UpdateExpenseDto = {
        propiedadId,
        fechaGasto,
        periodoMes,
        periodoAnio,
        titulo: titulo.trim(),
        categoria: categoria.trim(),
        monto: monto.trim(),
        pagadoPor: pagadoPor.trim(),
        repartido: repartido.trim() || null,
        usoRucDaplace: rucValue,
        notas: notas.trim() || null,
      };

      setSubmitting(true);
      try {
        await onSubmitUpdate(expenseToEdit.id, dto);
        onClose();
      } catch (err: unknown) {
        setGlobalError(err instanceof Error ? err.message : 'Error al actualizar el gasto.');
      } finally {
        setSubmitting(false);
      }
    } else {
      const dto: CreateExpenseDto = {
        propiedadId,
        fechaGasto,
        periodoMes,
        periodoAnio,
        titulo: titulo.trim(),
        categoria: categoria.trim(),
        monto: monto.trim(),
        moneda: 'PEN',
        pagadoPor: pagadoPor.trim(),
        repartido: repartido.trim() || undefined,
        usoRucDaplace: rucValue,
        notas: notas.trim() || undefined,
        idempotencyKey: `idem-gas-${Date.now()}`,
        sustentos:
          sustentoNombre.trim() && sustentoUrl.trim()
            ? [
                {
                  tipo: 'COMPROBANTE',
                  nombreArchivo: sustentoNombre.trim(),
                  url: sustentoUrl.trim(),
                  origen: sustentoUrl.includes('drive.google.com') ? 'DRIVE' : 'MANUAL',
                },
              ]
            : undefined,
      };

      const val = validateExpensePayload(dto);
      if (!val.isValid) {
        setFormErrors(val.errors);
        return;
      }

      setSubmitting(true);
      try {
        await onSubmitCreate(dto);
        onClose();
      } catch (err: unknown) {
        setGlobalError(err instanceof Error ? err.message : 'Error al registrar el gasto.');
      } finally {
        setSubmitting(false);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-xs">
      <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white shadow-xl border border-stone-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-stone-100 px-6 py-4">
          <div>
            <h2 className="text-base font-bold text-stone-900">
              {isEditing ? 'Editar Gasto Operativo' : 'Registrar Nuevo Gasto'}
            </h2>
            <p className="text-xs text-stone-500 mt-0.5">
              {isEditing
                ? 'Modifique los datos registrados con trazabilidad de auditoría.'
                : 'Complete los datos del gasto conforme a los encabezados de DAPLACE (Anexo A.2).'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {globalError && (
            <div className="flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-800 border border-rose-200">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{globalError}</span>
            </div>
          )}

          {/* Propiedad */}
          <div>
            <label htmlFor="form-propiedad-id" className="block text-xs font-semibold text-stone-700 mb-1">
              Inmueble / Propiedad <span className="text-rose-500">*</span>
            </label>
            <select
              id="form-propiedad-id"
              value={propiedadId}
              onChange={(e) => setPropiedadId(e.target.value)}
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:outline-hidden"
              required
            >
              <option value="">Seleccione una propiedad...</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
            {formErrors.propiedadId && (
              <p className="mt-1 text-[11px] text-rose-600">{formErrors.propiedadId}</p>
            )}
          </div>

          {/* Fechas y Periodo */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="form-fecha-gasto" className="block text-xs font-semibold text-stone-700 mb-1">
                Fecha del comprobante <span className="text-rose-500">*</span>
              </label>
              <input
                id="form-fecha-gasto"
                type="date"
                value={fechaGasto}
                onChange={(e) => setFechaGasto(e.target.value)}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:outline-hidden"
                required
              />
              {formErrors.fechaGasto && (
                <p className="mt-1 text-[11px] text-rose-600">{formErrors.fechaGasto}</p>
              )}
            </div>

            <div>
              <label htmlFor="form-periodo-mes" className="block text-xs font-semibold text-stone-700 mb-1">
                Mes del periodo <span className="text-rose-500">*</span>
              </label>
              <select
                id="form-periodo-mes"
                value={periodoMes}
                onChange={(e) => setPeriodoMes(Number(e.target.value))}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:outline-hidden"
                required
              >
                {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                  <option key={m} value={m}>
                    {m.toString().padStart(2, '0')} — {['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Setiembre', 'Octubre', 'Noviembre', 'Diciembre'][m - 1]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="form-periodo-anio" className="block text-xs font-semibold text-stone-700 mb-1">
                Año del periodo <span className="text-rose-500">*</span>
              </label>
              <input
                id="form-periodo-anio"
                type="number"
                min="2020"
                max="2035"
                value={periodoAnio}
                onChange={(e) => setPeriodoAnio(Number(e.target.value))}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:outline-hidden"
                required
              />
            </div>
          </div>

          {/* Título */}
          <div>
            <label htmlFor="form-titulo" className="block text-xs font-semibold text-stone-700 mb-1">
              Título del gasto <span className="text-rose-500">*</span>
            </label>
            <input
              id="form-titulo"
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="Ej: Cambio de cerradura inteligente, compra de blancos, internet..."
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
              required
            />
            {formErrors.titulo && <p className="mt-1 text-[11px] text-rose-600">{formErrors.titulo}</p>}
          </div>

          {/* Categoría y Monto */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="form-categoria" className="block text-xs font-semibold text-stone-700 mb-1">
                Categoría <span className="text-rose-500">*</span>
              </label>
              <input
                id="form-categoria"
                type="text"
                list="common-categories-list"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                placeholder="Seleccione o escriba categoría"
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:outline-hidden"
                required
              />
              <datalist id="common-categories-list">
                {COMMON_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
              {formErrors.categoria && (
                <p className="mt-1 text-[11px] text-rose-600">{formErrors.categoria}</p>
              )}
            </div>

            <div>
              <label htmlFor="form-monto" className="block text-xs font-semibold text-stone-700 mb-1">
                Monto en Soles (S/) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-xs font-bold text-stone-400">S/</span>
                <input
                  id="form-monto"
                  type="text"
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-stone-300 bg-white pl-8 pr-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:outline-hidden font-mono"
                  required
                />
              </div>
              {formErrors.monto && <p className="mt-1 text-[11px] text-rose-600">{formErrors.monto}</p>}
            </div>
          </div>

          {/* Pagado por y RUC DAPLACE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="form-pagado-por" className="block text-xs font-semibold text-stone-700 mb-1">
                Pagado por <span className="text-rose-500">*</span>
              </label>
              <input
                id="form-pagado-por"
                type="text"
                list="common-payers-list"
                value={pagadoPor}
                onChange={(e) => setPagadoPor(e.target.value)}
                placeholder="DAPLACE, PROPIETARIO, etc."
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:outline-hidden"
                required
              />
              <datalist id="common-payers-list">
                {COMMON_PAYERS.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
              {formErrors.pagadoPor && (
                <p className="mt-1 text-[11px] text-rose-600">{formErrors.pagadoPor}</p>
              )}
            </div>

            <div>
              <label htmlFor="form-ruc-daplace" className="block text-xs font-semibold text-stone-700 mb-1">
                ¿Se utilizó el RUC de DAPLACE?
              </label>
              <select
                id="form-ruc-daplace"
                value={usoRucDaplace}
                onChange={(e) => setUsoRucDaplace(e.target.value)}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 focus:border-[#183b32] focus:outline-hidden"
              >
                <option value="null">Sin información</option>
                <option value="true">Sí (Con RUC DAPLACE)</option>
                <option value="false">No (Sin RUC)</option>
              </select>
            </div>
          </div>

          {/* Repartido (semántica pendiente) */}
          <div>
            <label htmlFor="form-repartido" className="block text-xs font-semibold text-stone-700 mb-1">
              Repartido <span className="text-[10px] text-amber-600 font-normal">(Información textual pendiente de liquidación)</span>
            </label>
            <input
              id="form-repartido"
              type="text"
              value={repartido}
              onChange={(e) => setRepartido(e.target.value)}
              placeholder="Ej: Sí, No, Pendiente de liquidación..."
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
            />
          </div>

          {/* Notas */}
          <div>
            <label htmlFor="form-notas" className="block text-xs font-semibold text-stone-700 mb-1">
              Notas u observaciones adicionales
            </label>
            <textarea
              id="form-notas"
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Detalles sobre el gasto, compras o contexto..."
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden resize-none"
            />
          </div>

          {/* Sustento inicial (solo en modo creación) */}
          {!isEditing && (
            <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 space-y-2">
              <span className="block text-[11px] font-bold text-stone-600 uppercase tracking-wider">
                Vincular sustento o comprobante (Opcional)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={sustentoNombre}
                  onChange={(e) => setSustentoNombre(e.target.value)}
                  placeholder="Nombre de archivo (ej: Factura-001.pdf)"
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
                />
                <input
                  type="url"
                  value={sustentoUrl}
                  onChange={(e) => setSustentoUrl(e.target.value)}
                  placeholder="URL enlace (Google Drive / HTTP)"
                  className="w-full rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs text-stone-800 placeholder-stone-400 focus:border-[#183b32] focus:outline-hidden"
                />
              </div>
            </div>
          )}

          {/* Botones */}
          <div className="flex items-center justify-end gap-2 pt-4 border-t border-stone-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 rounded-lg bg-[#183b32] px-4 py-2 text-xs font-semibold text-white hover:bg-[#122c25] transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>{submitting ? 'Guardando...' : isEditing ? 'Guardar Cambios' : 'Registrar Gasto'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
