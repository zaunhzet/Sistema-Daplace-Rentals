import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router';
import {
  CalendarCheck,
  CheckCircle,
  AlertCircle,
  Building,
  Users,
  Calendar,
  Clock,
  ArrowRight,
  ShieldCheck,
  RotateCcw,
} from 'lucide-react';
import { publicBookingService } from '../services/publicBookingService';
import { calculateNights } from '../../reservations/services/reservationService';
import type {
  PublicProperty,
  PublicBookingResult,
  PublicAvailabilityCheck,
} from '../types';

export const PublicBookingRequestPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const initialPropId = searchParams.get('propiedadId') || '';

  const [properties, setProperties] = useState<PublicProperty[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(initialPropId);
  const [selectedProperty, setSelectedProperty] = useState<PublicProperty | null>(null);

  // Form fields
  const [ingreso, setIngreso] = useState<string>('');
  const [salida, setSalida] = useState<string>('');
  const [huespedNombre, setHuespedNombre] = useState<string>('');
  const [huespedEmail, setHuespedEmail] = useState<string>('');
  const [huespedTelefono, setHuespedTelefono] = useState<string>('');
  const [huespedDocumento, setHuespedDocumento] = useState<string>('');
  const [observaciones, setObservaciones] = useState<string>('');

  // Availability check state
  const [checkingAvail, setCheckingAvail] = useState<boolean>(false);
  const [availResult, setAvailResult] = useState<PublicAvailabilityCheck | null>(null);

  // Form submission state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<PublicBookingResult | null>(null);

  // Load public catalog properties for the dropdown
  useEffect(() => {
    let isMounted = true;
    publicBookingService
      .getPublicCatalog()
      .then((data) => {
        if (isMounted) {
          setProperties(data);
          if (initialPropId && data.some((p) => p.id === initialPropId)) {
            setSelectedPropertyId(initialPropId);
          } else if (data.length > 0 && !selectedPropertyId) {
            setSelectedPropertyId(data[0].id);
          }
        }
      })
      .catch(() => {
        if (isMounted) setSubmissionError('No se pudo cargar la lista de propiedades disponibles.');
      });

    return () => {
      isMounted = false;
    };
  }, [initialPropId]);

  // Sync selectedProperty entity
  useEffect(() => {
    const found = properties.find((p) => p.id === selectedPropertyId) || null;
    setSelectedProperty(found);
    setAvailResult(null); // Reset previous check if property changes
  }, [selectedPropertyId, properties]);

  // Check availability when dates change
  const handleCheckAvailability = useCallback(async () => {
    if (!selectedPropertyId || !ingreso || !salida) {
      setAvailResult(null);
      return;
    }

    try {
      setCheckingAvail(true);
      const res = await publicBookingService.checkPublicAvailability(selectedPropertyId, ingreso, salida);
      setAvailResult(res);
    } catch {
      setAvailResult({
        disponible: false,
        motivo: 'No fue posible validar la disponibilidad.',
      });
    } finally {
      setCheckingAvail(false);
    }
  }, [selectedPropertyId, ingreso, salida]);

  // Auto-check availability when property and valid dates are present
  useEffect(() => {
    if (selectedPropertyId && ingreso && salida && ingreso < salida) {
      handleCheckAvailability();
    } else {
      setAvailResult(null);
    }
  }, [selectedPropertyId, ingreso, salida, handleCheckAvailability]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmissionError(null);

    // Front validations
    if (!selectedPropertyId) {
      setSubmissionError('Debe seleccionar una propiedad del catálogo.');
      return;
    }

    if (!ingreso || !salida) {
      setSubmissionError('Debe seleccionar las fechas de llegada y salida.');
      return;
    }

    if (salida <= ingreso) {
      setSubmissionError('La fecha de salida debe ser posterior a la fecha de llegada (mínimo 1 noche).');
      return;
    }

    if (huespedNombre.trim().length < 3) {
      setSubmissionError('Por favor ingrese su nombre y apellido completo (mínimo 3 caracteres).');
      return;
    }

    if (!huespedEmail.trim() && !huespedTelefono.trim()) {
      setSubmissionError('Debe ingresar al menos un medio de contacto (correo electrónico o teléfono).');
      return;
    }

    try {
      setSubmitting(true);
      const result = await publicBookingService.submitPublicBookingRequest({
        propiedadId: selectedPropertyId,
        ingreso,
        salida,
        huespedNombre: huespedNombre.trim(),
        huespedEmail: huespedEmail.trim() || undefined,
        huespedTelefono: huespedTelefono.trim() || undefined,
        huespedDocumento: huespedDocumento.trim() || undefined,
        observaciones: observaciones.trim() || undefined,
      });

      setBookingResult(result);
    } catch (err: unknown) {
      if (err instanceof Error) {
        setSubmissionError(err.message);
      } else {
        setSubmissionError('Ocurrió un error inesperado al registrar su solicitud.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResetForm = () => {
    setBookingResult(null);
    setSubmissionError(null);
    setIngreso('');
    setSalida('');
    setAvailResult(null);
    setObservaciones('');
  };

  const nights = ingreso && salida && ingreso < salida ? calculateNights(ingreso, salida) : 0;
  const estimatedTotal = selectedProperty && nights > 0 ? nights * selectedProperty.precioBaseNoche : 0;

  // Render Confirmation Screen when request is successfully registered
  if (bookingResult) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-10 shadow-xs text-center space-y-6">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-emerald-100 text-emerald-800">
            <CheckCircle size={32} aria-hidden="true" />
          </div>

          <div className="space-y-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
              <Clock size={13} aria-hidden="true" />
              <span>ESTADO: SOLICITADA (PENDIENTE DE CONFIRMACIÓN)</span>
            </span>
            <h1 className="text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
              ¡Solicitud de Reserva Recibida!
            </h1>
            <p className="text-xs text-stone-500 max-w-md mx-auto">
              Tu solicitud fue registrada bajo el identificador único{' '}
              <strong className="font-mono text-stone-800 font-bold">{bookingResult.reservaId}</strong>.
            </p>
          </div>

          {/* Details Summary Card */}
          <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-5 text-left text-xs space-y-3">
            <h2 className="font-bold text-stone-900 uppercase tracking-wider text-[11px] border-b border-stone-200 pb-2">
              Resumen de la Solicitud
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-stone-500 block">Propiedad solicitada:</span>
                <span className="font-semibold text-stone-900">{bookingResult.propiedadNombre}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Titular:</span>
                <span className="font-semibold text-stone-900">{bookingResult.huespedNombre}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Fecha de Llegada (Check-in):</span>
                <span className="font-semibold text-stone-900">{bookingResult.ingreso}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Fecha de Salida (Check-out):</span>
                <span className="font-semibold text-stone-900">{bookingResult.salida}</span>
              </div>
              <div>
                <span className="text-stone-500 block">Estancia total:</span>
                <span className="font-semibold text-stone-900">{bookingResult.noches} noches</span>
              </div>
              <div>
                <span className="text-stone-500 block">Presupuesto estimado:</span>
                <span className="font-bold text-emerald-900 text-sm">
                  {bookingResult.moneda} {bookingResult.montoEstimado?.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Governance Notice */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-xs text-amber-950 text-left leading-relaxed">
            <p className="font-semibold text-amber-900 flex items-center gap-1.5 mb-1">
              <ShieldCheck size={16} className="text-amber-800" aria-hidden="true" />
              <span>Aviso Importante sobre tu Solicitud (HU-02)</span>
            </p>
            <p className="text-amber-900/90">{bookingResult.avisoConfirmacion}</p>
          </div>

          {/* Action Buttons */}
          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleResetForm}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer transition-colors"
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>Registrar otra solicitud</span>
            </button>

            <Link
              to="/catalogo"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#162A2C] px-5 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#243f42] cursor-pointer transition-colors"
            >
              <span>Volver al Catálogo</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
          <Link to="/catalogo" className="hover:underline text-stone-600">
            Catálogo
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-[#183b32]">Solicitud de Reserva (HU-02)</span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900 sm:text-3xl">
          Solicitar Reserva de Alojamiento
        </h1>
        <p className="mt-1 text-xs text-stone-500 max-w-2xl leading-relaxed">
          Selecciona tu estancia y completa tus datos. Verificamos la disponibilidad en el calendario operativo en tiempo real.
        </p>
      </div>

      {/* Main Form & Preview Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Form Container (2 cols) */}
        <div className="lg:col-span-2 rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-xs">
          {submissionError && (
            <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-900 flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-700" aria-hidden="true" />
              <span>{submissionError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Step 1: Select Property */}
            <div className="space-y-2">
              <label htmlFor="pub-propiedad" className="block text-xs font-bold uppercase tracking-wider text-stone-700">
                1. Selecciona el Inmueble <span className="text-red-500">*</span>
              </label>
              <select
                id="pub-propiedad"
                value={selectedPropertyId}
                onChange={(e) => setSelectedPropertyId(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs text-stone-900 focus:border-[#162A2C] focus:outline-hidden focus:ring-2 focus:ring-[#5E6C5B]/20"
                required
              >
                <option value="">-- Seleccione una propiedad publicada --</option>
                {properties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} — {p.moneda} {p.precioBaseNoche}/noche (Hasta {p.capacidadHuespedes} personas)
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Dates of stay */}
            <div className="space-y-2">
              <span className="block text-xs font-bold uppercase tracking-wider text-stone-700">
                2. Fechas de Estancia [Llegada, Salida) <span className="text-red-500">*</span>
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pub-ingreso" className="block text-[11px] font-medium text-stone-600 mb-1">
                    Fecha de Llegada (Check-in)
                  </label>
                  <input
                    id="pub-ingreso"
                    type="date"
                    value={ingreso}
                    onChange={(e) => setIngreso(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs text-stone-900 focus:border-[#162A2C] focus:outline-hidden"
                    required
                  />
                </div>
                <div>
                  <label htmlFor="pub-salida" className="block text-[11px] font-medium text-stone-600 mb-1">
                    Fecha de Salida (Check-out)
                  </label>
                  <input
                    id="pub-salida"
                    type="date"
                    value={salida}
                    onChange={(e) => setSalida(e.target.value)}
                    className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs text-stone-900 focus:border-[#162A2C] focus:outline-hidden"
                    required
                  />
                </div>
              </div>

              {/* Live Availability Badge */}
              {checkingAvail && (
                <p className="text-[11px] text-stone-500 animate-pulse pt-1">
                  Verificando disponibilidad en el calendario operativo...
                </p>
              )}

              {availResult && (
                <div
                  className={`mt-2 rounded-xl p-3 text-xs flex items-center gap-2 ${
                    availResult.disponible
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-900 font-medium'
                      : 'border border-red-200 bg-red-50 text-red-900 font-medium'
                  }`}
                >
                  {availResult.disponible ? (
                    <>
                      <CheckCircle size={16} className="shrink-0 text-emerald-700" aria-hidden="true" />
                      <span>
                        ¡Fechas disponibles! Estancia de <strong>{availResult.noches} noches</strong> ({availResult.moneda} {availResult.precioEstimado}).
                      </span>
                    </>
                  ) : (
                    <>
                      <AlertCircle size={16} className="shrink-0 text-red-700" aria-hidden="true" />
                      <span>{availResult.motivo || 'Las fechas seleccionadas presentan solape con otra reserva.'}</span>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Step 3: Guest Personal Contact Details */}
            <div className="space-y-4 pt-4 border-t border-stone-100">
              <span className="block text-xs font-bold uppercase tracking-wider text-stone-700">
                3. Datos del Huésped Titular <span className="text-red-500">*</span>
              </span>

              <div>
                <label htmlFor="pub-huesped-nombre" className="block text-[11px] font-medium text-stone-600 mb-1">
                  Nombre y Apellidos Completos <span className="text-red-500">*</span>
                </label>
                <input
                  id="pub-huesped-nombre"
                  type="text"
                  value={huespedNombre}
                  onChange={(e) => setHuespedNombre(e.target.value)}
                  placeholder="Ej. Roberto Sánchez Gómez"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs text-stone-900 focus:border-[#162A2C] focus:outline-hidden"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pub-huesped-email" className="block text-[11px] font-medium text-stone-600 mb-1">
                    Correo Electrónico
                  </label>
                  <input
                    id="pub-huesped-email"
                    type="email"
                    value={huespedEmail}
                    onChange={(e) => setHuespedEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs text-stone-900 focus:border-[#162A2C] focus:outline-hidden"
                  />
                  <span className="text-[10px] text-stone-400">Requerido si no indica teléfono.</span>
                </div>

                <div>
                  <label htmlFor="pub-huesped-telefono" className="block text-[11px] font-medium text-stone-600 mb-1">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    id="pub-huesped-telefono"
                    type="tel"
                    value={huespedTelefono}
                    onChange={(e) => setHuespedTelefono(e.target.value)}
                    placeholder="+51 987 654 321"
                    className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs text-stone-900 focus:border-[#162A2C] focus:outline-hidden"
                  />
                  <span className="text-[10px] text-stone-400">Requerido si no indica correo.</span>
                </div>
              </div>

              <div>
                <label htmlFor="pub-huesped-doc" className="block text-[11px] font-medium text-stone-600 mb-1">
                  Documento de Identidad (DNI, Pasaporte o CE) <span className="text-stone-400 text-[10px]">(Opcional)</span>
                </label>
                <input
                  id="pub-huesped-doc"
                  type="text"
                  value={huespedDocumento}
                  onChange={(e) => setHuespedDocumento(e.target.value)}
                  placeholder="Número de documento para el check-in"
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs text-stone-900 focus:border-[#162A2C] focus:outline-hidden"
                />
              </div>

              <div>
                <label htmlFor="pub-observaciones" className="block text-[11px] font-medium text-stone-600 mb-1">
                  Observaciones o Peticiones Especiales <span className="text-stone-400 text-[10px]">(Opcional)</span>
                </label>
                <textarea
                  id="pub-observaciones"
                  rows={2}
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  placeholder="Hora estimada de llegada, estacionamiento, cama cuna, etc."
                  className="w-full rounded-xl border border-stone-300 px-3.5 py-2 text-xs text-stone-900 focus:border-[#162A2C] focus:outline-hidden"
                />
              </div>
            </div>

            {/* Submit CTA */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={submitting || (availResult !== null && !availResult.disponible)}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#162A2C] px-6 py-3 text-xs font-bold uppercase tracking-wider text-white shadow-xs hover:bg-[#243f42] active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all"
              >
                <CalendarCheck size={16} aria-hidden="true" />
                <span>{submitting ? 'Registrando Solicitud...' : 'Enviar Solicitud de Reserva'}</span>
              </button>
              <p className="mt-2 text-center text-[10px] text-stone-400">
                Al enviar esta solicitud no se realiza ningún cobro automático. Quedará registrada para validación operativa.
              </p>
            </div>
          </form>
        </div>

        {/* Stay Preview Sidebar (1 col) */}
        <aside aria-label="Resumen de la estancia" className="space-y-4">
          <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xs space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-stone-700 border-b border-stone-100 pb-2">
              Resumen de la Estancia
            </h2>

            {selectedProperty ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[11px] text-stone-400 block">Alojamiento:</span>
                  <p className="font-bold text-stone-900 leading-snug">{selectedProperty.nombre}</p>
                  <p className="text-[11px] text-stone-500 mt-0.5">{selectedProperty.direccion}</p>
                </div>

                <div className="flex items-center justify-between text-stone-600 pt-2 border-t border-stone-100">
                  <span className="flex items-center gap-1.5">
                    <Users size={14} className="text-[#5E6C5B]" aria-hidden="true" />
                    <span>Capacidad:</span>
                  </span>
                  <span className="font-semibold">{selectedProperty.capacidadHuespedes} personas</span>
                </div>

                <div className="flex items-center justify-between text-stone-600">
                  <span className="flex items-center gap-1.5">
                    <Building size={14} className="text-[#5E6C5B]" aria-hidden="true" />
                    <span>Tarifa base:</span>
                  </span>
                  <span className="font-semibold">{selectedProperty.moneda} {selectedProperty.precioBaseNoche} / noche</span>
                </div>

                {nights > 0 && (
                  <>
                    <div className="flex items-center justify-between text-stone-600 pt-2 border-t border-stone-100">
                      <span className="flex items-center gap-1.5">
                        <Calendar size={14} className="text-[#5E6C5B]" aria-hidden="true" />
                        <span>Noches:</span>
                      </span>
                      <span className="font-semibold">{nights} noche{nights > 1 ? 's' : ''}</span>
                    </div>

                    <div className="flex items-center justify-between text-stone-900 pt-2 border-t border-stone-200">
                      <span className="font-bold">Total referencial:</span>
                      <span className="font-bold text-sm text-emerald-800">
                        {selectedProperty.moneda} {estimatedTotal.toFixed(2)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="text-xs text-stone-400 italic">Seleccione una propiedad para ver el detalle de tarifas.</p>
            )}
          </div>

          <div className="rounded-2xl border border-stone-200 bg-[#FEFCF6] p-4 text-[11px] text-stone-600 space-y-1.5">
            <p className="font-bold text-stone-800 flex items-center gap-1">
              <ShieldCheck size={14} className="text-[#5E6C5B]" aria-hidden="true" />
              <span>Garantía de Transparencia</span>
            </p>
            <p className="leading-relaxed">
              DAPLACE protege tus datos. No compartimos tu información personal con terceros y las reservas son revisadas por operadores calificados.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
};
