import { useState, type FormEvent } from 'react';
import { useNavigate, NavLink } from 'react-router';
import { useAuth } from './AuthContext';
import { USUARIOS_DEMO_PREDEFINIDOS, type DemoUser, type UserRole } from './types';
import daplaceIcon from '../../assets/daplace-icon.png';

export function LoginForm() {
  const navigate = useNavigate();
  const { loginDemo } = useAuth();

  // Estados del formulario
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Estados de validación visual
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
    email: false,
    password: false,
  });
  const [submitted, setSubmitted] = useState(false);

  // Reglas de validación
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const isEmailEmpty = email.trim() === '';
  const isEmailInvalid = !isEmailEmpty && !emailRegex.test(email);
  const emailError = (touched.email || submitted) && (
    isEmailEmpty ? 'Ingrese un correo electrónico.' : isEmailInvalid ? 'Formato de correo no válido (ej. usuario@daplace.pe).' : null
  );

  const isPasswordEmpty = password.trim() === '';
  const isPasswordTooShort = !isPasswordEmpty && password.length < 4;
  const passwordError = (touched.password || submitted) && (
    isPasswordEmpty ? 'Ingrese una contraseña demo.' : isPasswordTooShort ? 'La contraseña debe contener al menos 4 caracteres.' : null
  );

  // Función para resolver automáticamente el rol preestablecido a partir del correo
  const resolverRolPorCorreo = (correo: string): { rol: UserRole; cargo: string; nombre: string } => {
    const lower = correo.trim().toLowerCase();

    // 1. Coincidencia con cuentas preestablecidas
    const preestablecido = USUARIOS_DEMO_PREDEFINIDOS.find(
      (u) => u.correo.toLowerCase() === lower
    );
    if (preestablecido) {
      return { rol: preestablecido.rol, cargo: preestablecido.cargo, nombre: preestablecido.nombre };
    }

    // Nombre derivado del prefijo del correo
    const nombreDerivado = correo.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

    // 2. Asignación automática por correo para futuros registros
    if (lower.includes('admin')) {
      return { rol: 'ADMINISTRADOR', cargo: 'Administrador General', nombre: nombreDerivado };
    }
    if (lower.includes('propietario') || lower.includes('owner') || lower.includes('host')) {
      return { rol: 'PROPIETARIO', cargo: 'Propietario de Inmuebles', nombre: nombreDerivado };
    }
    if (lower.includes('cliente') || lower.includes('huesped') || lower.includes('guest')) {
      return { rol: 'CLIENTE', cargo: 'Cliente / Huésped', nombre: nombreDerivado };
    }

    // Perfil operativo por defecto
    return { rol: 'OPERADOR', cargo: 'Operador de Turno', nombre: nombreDerivado };
  };

  // Handler de envío de formulario con credenciales manuales
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);

    if (isEmailEmpty || isEmailInvalid || isPasswordEmpty || isPasswordTooShort) {
      return;
    }

    // Asignación automática del rol preestablecido según el correo ingresado
    const { rol, cargo, nombre } = resolverRolPorCorreo(email);

    const userToLogin: DemoUser = {
      nombre,
      correo: email.trim(),
      rol,
      cargo,
    };

    // Establece la sesión simulada únicamente en el estado de React y navega al dashboard
    loginDemo(userToLogin);
    navigate('/');
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
        
        {/* Banner de Aviso Explícito de Modo DEMO */}
        <div
          role="region"
          aria-label="Aviso de demostración"
          className="rounded-2xl border border-amber-300/60 bg-amber-50/90 p-4 text-amber-950 shadow-sm"
        >
          <div className="flex items-start gap-3">
            <svg
              className="mt-0.5 size-5 shrink-0 text-amber-700"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="text-xs leading-5">
              <p className="font-semibold uppercase tracking-wider text-amber-900">
                Acceso de Demostración (HU-08)
              </p>
              <p className="mt-1 text-amber-800">
                Este formulario opera exclusivamente en <strong>modo demostración simulado</strong>.
                No se conecta con un backend real ni autentica credenciales reales. No ingrese contraseñas personales.
              </p>
            </div>
          </div>
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

          {/* Formulario */}
          <form className="mt-8 space-y-5" onSubmit={handleSubmit} noValidate>
            
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, email: true }))}
                  placeholder="ej. demo@daplace.pe"
                  aria-invalid={Boolean(emailError)}
                  aria-describedby={emailError ? 'email-error' : undefined}
                  className={`block w-full rounded-xl border px-3.5 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 transition-colors focus:outline-none ${
                    emailError
                      ? 'border-rose-400 bg-rose-50/30 focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                      : 'border-stone-300 bg-white focus:border-[#183b32] focus:ring-2 focus:ring-[#183b32]/10'
                  }`}
                />
              </div>
              {emailError && (
                <p id="email-error" className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600" role="alert">
                  <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{emailError}</span>
                </p>
              )}
            </div>

            {/* Campo: Contraseña Simutada */}
            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-stone-700"
                >
                  Contraseña Demo
                </label>
                <span className="text-[11px] text-stone-400">
                  (Simulada, no se almacena)
                </span>
              </div>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
                  placeholder="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;"
                  aria-invalid={Boolean(passwordError)}
                  aria-describedby={passwordError ? 'password-error' : undefined}
                  className={`block w-full rounded-xl border px-3.5 py-2.5 pr-10 text-sm text-stone-900 placeholder:text-stone-400 transition-colors focus:outline-none ${
                    passwordError
                      ? 'border-rose-400 bg-rose-50/30 focus:border-rose-600 focus:ring-2 focus:ring-rose-200'
                      : 'border-stone-300 bg-white focus:border-[#183b32] focus:ring-2 focus:ring-[#183b32]/10'
                  }`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-stone-400 hover:text-stone-600 focus:outline-none"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? (
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
              {passwordError && (
                <p id="password-error" className="mt-1.5 flex items-center gap-1.5 text-xs text-rose-600" role="alert">
                  <svg className="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>{passwordError}</span>
                </p>
              )}
            </div>

            {/* Botón Principal: Enviar con validación */}
            <button
              type="submit"
              className="mt-2 flex w-full items-center justify-center rounded-xl bg-[#183b32] px-4 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:bg-[#122e27] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#183b32]"
            >
              Iniciar Sesión
            </button>
          </form>

          {/* Cuentas sugeridas con rol preestablecido */}
          <div className="mt-7 border-t border-stone-100 pt-5">
            <p className="text-center text-[11px] font-medium uppercase tracking-wider text-stone-400">
              Cuentas de prueba con rol preasignado:
            </p>
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {USUARIOS_DEMO_PREDEFINIDOS.map((u) => (
                <button
                  key={u.correo}
                  type="button"
                  onClick={() => {
                    setEmail(u.correo);
                    setPassword('demo1234');
                  }}
                  className="rounded-lg border border-stone-200 bg-stone-50/80 px-2 py-2 text-center text-[11px] font-medium text-stone-700 transition hover:border-stone-300 hover:bg-stone-100 focus:outline-none focus:ring-1 focus:ring-[#183b32]"
                  title={`Autocompletar ${u.correo} (${u.cargo})`}
                >
                  <span className="block truncate font-semibold text-stone-900">{u.rol}</span>
                  <span className="block truncate text-[10px] text-stone-500">{u.nombre.split(' ')[0]}</span>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Nota técnica al pie */}
        <p className="text-center text-xs text-stone-400">
          Daplace Rentals &bull; Arquitectura transaccional de gobernanza de datos
        </p>
      </div>
    </div>
  );
}
