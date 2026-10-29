import React from 'react';
import { Link } from 'react-router';
import { Building, MapPin, Users, CalendarCheck, ShieldCheck } from 'lucide-react';
import type { PublicProperty } from '../types';

interface PropertyCardProps {
  property: PublicProperty;
}

export const PropertyCard: React.FC<PropertyCardProps> = ({ property }) => {
  return (
    <article className="group flex flex-col rounded-3xl border border-stone-200/90 bg-white shadow-xs hover:shadow-md transition-all duration-200 overflow-hidden">
      {/* Visual Header / Property Badge */}
      <div className="relative h-44 bg-gradient-to-br from-[#162A2C] to-[#243f42] p-5 flex flex-col justify-between text-white">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold tracking-wide backdrop-blur-xs text-[#FEFCF6]">
            <ShieldCheck size={13} className="text-[#B9CDB4]" aria-hidden="true" />
            <span>Verificado</span>
          </span>

          <span className="rounded-full bg-[#5E6C5B]/80 px-2.5 py-1 text-[11px] font-bold text-[#FEFCF6]">
            {property.moneda} {property.precioBaseNoche} / noche
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div className="grid size-9 place-items-center rounded-xl bg-white/10 text-white">
            <Building size={18} aria-hidden="true" />
          </div>
          <span className="font-mono text-xs opacity-75">ID: {property.id}</span>
        </div>
      </div>

      {/* Property Details */}
      <div className="flex-1 p-5 flex flex-col justify-between space-y-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight text-stone-900 group-hover:text-[#183b32] transition-colors line-clamp-1">
            {property.nombre}
          </h2>

          <div className="mt-2 flex items-start gap-1.5 text-xs text-stone-500">
            <MapPin size={14} className="shrink-0 text-stone-400 mt-0.5" aria-hidden="true" />
            <span className="line-clamp-2 leading-relaxed">{property.direccion}</span>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="pt-3 border-t border-stone-100 flex items-center justify-between text-xs text-stone-600">
          <div className="flex items-center gap-1.5">
            <Users size={15} className="text-[#5E6C5B]" aria-hidden="true" />
            <span>Hasta <strong>{property.capacidadHuespedes}</strong> huéspedes</span>
          </div>

          <div className="text-right">
            <span className="text-[11px] text-stone-400 block">Tarifa referencial</span>
            <span className="font-bold text-stone-800">{property.moneda} {property.precioBaseNoche}</span>
          </div>
        </div>

        {/* Action Button */}
        <Link
          to={`/solicitar-reserva?propiedadId=${property.id}`}
          className="mt-2 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#162A2C] px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-[#243f42] active:scale-[0.99] transition-all cursor-pointer"
        >
          <CalendarCheck size={14} aria-hidden="true" />
          <span>Consultar Disponibilidad</span>
        </Link>
      </div>
    </article>
  );
};
