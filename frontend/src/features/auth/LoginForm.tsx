import { useState, type FormEvent } from 'react';
import { useNavigate, NavLink } from 'react-router';
import { useAuth } from './AuthContext';
import daplaceIcon from '../../assets/daplace-icon.png';

export function LoginForm() {
  const navigate = useNavigate();
  const { login } = useAuth();

  // Estados del formulario
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Estados de validación visual
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const [submitted, setSubmitted] = useState(false);

  // Reglas de validación en el cliente
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailEmpty = email.trim() === '';
  const isEmailInvalid = !isEmailEmpty && !emailRegex.test(email);
  const emailError =
    (touched.email || submitted) &&
    (isEmailEmpty
      ? 'Ingrese un correo electrónico.'
      : isEmailInvalid
      ? 'Formato de correo no válido (ej. usuario@daplace.pe).'
      : null);

  // Se elimina el mínimo de cuatro caracteres como supuesto de seguridad
  const isPasswordEmpty = password === '';
  const passwordError =
    (touched.password || submitted) &&
    (isPasswordEmpty ? 'Ingrese su contraseña.' : null);

  // Handler de envío con llamada real al backend y protección de doble envío
  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    setSubmitted(true);
    setApiError(null);

    if (isEmailEmpty || isEmailInvalid || isPasswordEmpty) {
      return;
    }

    setIsLoading(true);

    try {
      // No recortamos ni alteramos la contraseña antes de verificarla
      await login(email.trim(), password);
      navigate('/propiedades');
    } catch (err: any) {
      setApiError(err?.message || 'Credenciales inválidas. Por favor verifique sus datos.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-[#f7f7f5] items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-6">
        <div className="flex items-center justify-between">
          <NavLink
            to="/propiedades"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-900 transition-colors"
          >
            &larr; Volver al panel de gestión
          </NavLink>
        </div>
        {/* Tarjeta Principal de Inicio de Sesión */}
        <div className="rounded-3xl border border-stone-200/80 bg-white p-7 shadow-sm sm:p-9">
          {/* Cabecera / Identidad Corporativa Oficial */}
          <div className="text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-2xl border border-stone-200/80 bg-white p-2.5 shadow-xs">
              <img
                src={daplaceIcon}
                alt="Isotipo Daplace Rentals"
                className="size-full object-contain"
              />
            </div>
            <h1 className="mt-4 text-2xl font-semibold tracking-tight text-stone-900">
              Iniciar Sesión
            </h1>
            <p className="mt-1 text-xs text-stone-500">
              Daplace Rentals &bull; Gobernanza y Estandarización Transaccional
            </p>
          </div>

          {/* Alerta de Error del Servidor */}
          {apiError && (
            <div
              role="alert"
              aria-live="polite"
              className="mt-6 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-rose-900 shadow-xs"
            >
              <svg
                className="mt-0.5 size-5 shrink-0 text-rose-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="text-xs leading-5">
                <p className="font-semibold text-rose-950">Error de autenticación</p>
                <p className="mt-0.5 text-rose-800">{apiError}</p>
              </div>
            </div>
          )}

          {/* Formulario */}
          <form className="mt-7 space-y-5" onSubmit={handleSubmit} noValidate>
            {/* Campo: Correo Electrónico */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold uppercase tracking-wider text-stone-700"
              >
                Correo Electrónico
              </label>
              <div className="mt-1.5">
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="username"
                  disabled={isLoading}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  placeholder="usuario@daplace.pe"
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? 'email-error' : undefined}
                  className={`block w-full rounded-xl border px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 transition-colors focus:outline-none disabled:bg-stone-50 disabled:text-stone-400 ${
                    emailError
                      ? 'border-rose-400 bg-rose-50/30 focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                      : 'border-stone-300 bg-white focus:border-[#183b32] focus:ring-2 focus:ring-[#183b32]/10'
                  }`}
                />
              </div>
              {emailError && (
                <p
                  id="email-error"
                  className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600"
                  role="alert"
                >
                  <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{emailError}</span>
                </p>
              )}
            </div>

            {/* Campo: Contraseña */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-stone-700"
                >
                  Contraseña
                </label>
              </div>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  disabled={isLoading}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                  placeholder="••••••••"
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? 'password-error' : undefined}
                  className={`block w-full rounded-xl border px-3.5 py-2.5 pr-10 text-sm text-stone-900 placeholder:text-stone-400 transition-colors focus:outline-none disabled:bg-stone-50 disabled:text-stone-400 ${
                    passwordError
                      ? 'border-rose-400 bg-rose-50/30 focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                      : 'border-stone-300 bg-white focus:border-[#183b32] focus:ring-2 focus:ring-[#183b32]/10'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  disabled={isLoading}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-stone-400 hover:text-stone-600 focus:outline-none disabled:opacity-50"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? (
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18"
                      />
                    </svg>
                  ) : (
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                      />
                    </svg>
                  )}
                </button>
              </div>
              {passwordError && (
                <p
                  id="password-error"
                  className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600"
                  role="alert"
                >
                  <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                  <span>{passwordError}</span>
                </p>
              )}
            </div>

            {/* Botón Principal: Enviar con bloqueo de doble envío y estado de carga */}
            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-[#183b32] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#122e27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183b32] disabled:cursor-not-allowed disabled:opacity-75"
            >
              {isLoading ? (
                <>
                  <svg
                    className="size-4 animate-spin text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Iniciando sesión...</span>
                </>
              ) : (
                <span>Iniciar Sesión</span>
              )}
            </button>
          </form>
        </div>

        {/* Nota técnica al pie */}
        <p className="text-center text-xs text-stone-400">
          Daplace Rentals &bull; Arquitectura transaccional de gobernanza de datos
        </p>
      </div>
    </div>
  );
}
