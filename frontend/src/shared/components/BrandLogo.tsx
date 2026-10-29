import React, { useState } from 'react';

/**
 * Ruta centralizada para el archivo del logo corporativo oficial cuando sea suministrado.
 * Si se define una ruta válida (ej. '/brand-logo.svg' o '/brand-logo.png'), BrandLogo
 * renderizará automáticamente la imagen corporativa en lugar del monograma fallback.
 */
export const BRAND_LOGO_SRC: string | undefined = undefined;

export interface BrandLogoProps {
  /** Ruta opcional de la imagen corporativa. Si no se provee, utiliza BRAND_LOGO_SRC */
  src?: string;
  /** Tamaño del contenedor del monograma/logo: 'sm' | 'md' | 'lg' */
  size?: 'sm' | 'md' | 'lg';
  /** Si debe mostrarse la tipografía de marca 'daplace rentals' al lado del logo */
  showText?: boolean;
  /** Subtítulo descriptivo secundario (ej. 'Panel Operativo' o 'Alquileres Temporales') */
  subtitle?: string;
  /** Tema visual: 'dark' (para fondos oscuros como Sidebar) o 'light' (para fondos claros) */
  theme?: 'dark' | 'light';
  /** Clases CSS adicionales para el contenedor */
  className?: string;
}

export const BrandLogo: React.FC<BrandLogoProps> = ({
  src = BRAND_LOGO_SRC,
  size = 'md',
  showText = true,
  subtitle,
  theme = 'dark',
  className = '',
}) => {
  const [imageError, setImageError] = useState<boolean>(false);

  // Mapeo de dimensiones del contenedor gráfico
  const sizeMap = {
    sm: 'size-7 text-xs rounded-lg',
    md: 'size-9 text-sm rounded-xl',
    lg: 'size-10 text-base rounded-xl',
  };

  const isDark = theme === 'dark';

  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      {/* Contenedor del Logo Corporativo o Monograma Fallback */}
      <div
        className={`grid place-items-center shrink-0 font-bold tracking-tight shadow-2xs select-none overflow-hidden transition-all ${sizeMap[size]} ${
          isDark
            ? 'bg-[#183b32] text-[#FEFCF6] border border-white/10'
            : 'bg-[#183b32] text-[#FEFCF6]'
        }`}
      >
        {src && !imageError ? (
          <img
            src={src}
            alt="DAPLACE RENTALS"
            className="size-full object-contain p-1"
            onError={() => setImageError(true)}
          />
        ) : (
          <span aria-label="Logo DAPLACE" className="leading-none">
            D
          </span>
        )}
      </div>

      {/* Tipografía de Marca */}
      {showText && (
        <div className="min-w-0 leading-tight">
          <p
            className={`truncate font-semibold tracking-[-0.02em] ${
              size === 'sm' ? 'text-xs' : 'text-sm'
            } ${isDark ? 'text-[#FEFCF6]' : 'text-[#162A2C]'}`}
          >
            daplace{' '}
            <span
              className={`font-normal ${
                isDark ? 'text-[#D6E0E2]/75' : 'text-[#5E6C5B]'
              }`}
            >
              rentals
            </span>
          </p>
          {subtitle && (
            <p
              className={`truncate text-[10px] font-medium uppercase tracking-[0.12em] ${
                isDark ? 'text-[#D6E0E2]/60' : 'text-stone-500'
              }`}
            >
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
};
