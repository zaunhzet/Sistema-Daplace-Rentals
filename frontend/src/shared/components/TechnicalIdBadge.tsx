import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface TechnicalIdBadgeProps {
  id: string;
  code?: string;
  className?: string;
  badgeClassName?: string;
  showCopyButton?: boolean;
}

/**
 * Muestra prioritariamente el código legible comercial (ej. RSV-000001, PRP-000001, PRO-000001).
 * Oculta el UUID gigante de la interfaz principal y ofrece una acción secundaria discreta
 * para copiar el ID técnico cuando sea estrictamente necesario.
 */
export const TechnicalIdBadge: React.FC<TechnicalIdBadgeProps> = ({
  id,
  code,
  className = '',
  badgeClassName = 'bg-[#183b32] text-white',
  showCopyButton = true,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback silencioso si no hay acceso a portapapeles
    }
  };

  const displayText = code || id;

  return (
    <div className={`inline-flex items-center gap-1.5 ${className}`}>
      <span
        className={`rounded-md px-2 py-0.5 font-mono text-xs font-bold tracking-wide shadow-2xs ${badgeClassName}`}
        title={code ? `Código comercial: ${code} (ID técnico: ${id})` : `ID técnico: ${id}`}
      >
        {displayText}
      </span>
      {showCopyButton && (
        <button
          type="button"
          onClick={handleCopy}
          className="rounded p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700 transition-colors cursor-pointer"
          title={copied ? '¡ID técnico copiado!' : `Copiar ID técnico (${id})`}
          aria-label={`Copiar ID técnico: ${id}`}
        >
          {copied ? (
            <Check size={12} className="text-emerald-600 animate-in fade-in duration-150" />
          ) : (
            <Copy size={12} />
          )}
        </button>
      )}
    </div>
  );
};
