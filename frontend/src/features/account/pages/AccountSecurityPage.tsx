import React, { useEffect, useState } from 'react';
import {
  Shield,
  KeyRound,
  Mail,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import { accountService, type AccountProfile } from '../services/accountService';
import { useAuth } from '../../auth';
import { useNavigate } from 'react-router';

export const AccountSecurityPage: React.FC = () => {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [generalError, setGeneralError] = useState<string | null>(null);

  // Estados de formulario de cambio de correo
  const [nuevoEmail, setNuevoEmail] = useState<string>('');
  const [emailPasswordActual, setEmailPasswordActual] = useState<string>('');
  const [emailLoading, setEmailLoading] = useState<boolean>(false);
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // Estados de formulario de cambio de contraseña
  const [passwordActual, setPasswordActual] = useState<string>('');
  const [nuevoPassword, setNuevoPassword] = useState<string>('');
  const [confirmarPassword, setConfirmarPassword] = useState<string>('');
  const [passwordLoading, setPasswordLoading] = useState<boolean>(false);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setGeneralError(null);
      try {
        const data = await accountService.getProfile();
        setProfile(data);
      } catch (err: any) {
        setGeneralError(err.message || 'No fue posible cargar los datos de la cuenta.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleUpdateEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError(null);
    setEmailSuccess(null);

    if (!nuevoEmail.trim()) {
      setEmailError('Ingrese el nuevo correo electrónico.');
      return;
    }
    if (!emailPasswordActual) {
      setEmailError('Ingrese su contraseña actual para confirmar el cambio.');
      return;
    }

    setEmailLoading(true);
    try {
      const res = await accountService.updateEmail({
        nuevoEmail: nuevoEmail.trim(),
        passwordActual: emailPasswordActual,
      });
      setEmailSuccess(res.message || 'Correo actualizado exitosamente.');
      setProfile(res.user);
      setNuevoEmail('');
      setEmailPasswordActual('');
    } catch (err: any) {
      setEmailError(err.message || 'Error al actualizar el correo electrónico.');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!passwordActual) {
      setPasswordError('Ingrese su contraseña actual.');
      return;
    }
    if (!nuevoPassword) {
      setPasswordError('Ingrese la nueva contraseña.');
      return;
    }
    if (nuevoPassword !== confirmarPassword) {
      setPasswordError('Las nuevas contraseñas no coinciden.');
      return;
    }
    if (nuevoPassword.length < 8) {
      setPasswordError('La nueva contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setPasswordLoading(true);
    try {
      const res = await accountService.updatePassword({
        passwordActual,
        nuevoPassword,
      });
      setPasswordSuccess(
        res.message ||
          'Contraseña actualizada exitosamente. Sus sesiones previas han sido revocadas; por favor vuelva a iniciar sesión.'
      );
      setPasswordActual('');
      setNuevoPassword('');
      setConfirmarPassword('');
    } catch (err: any) {
      setPasswordError(err.message || 'Error al actualizar la contraseña.');
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-stone-500" />
        <span className="ml-2 text-xs font-medium text-stone-500">Cargando perfil de seguridad...</span>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 pb-12">
      {/* Encabezado */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">
          Mi Cuenta y Seguridad
        </h1>
        <p className="mt-1 text-xs text-stone-500">
          Administre sus credenciales de acceso, correo de autenticación y claves de seguridad.
        </p>
      </div>

      {generalError && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800">
          <AlertCircle className="size-4 shrink-0 text-red-600" />
          <span>{generalError}</span>
        </div>
      )}

      {/* Tarjeta de Resumen de Perfil */}
      <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-xl bg-stone-100 text-stone-700">
              <Shield className="size-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-stone-900">
                {profile?.nombre || session.user?.nombre || 'Usuario'}
              </h2>
              <p className="text-xs text-stone-500">
                {profile?.cargo ? `${profile.cargo} — ` : ''}
                Rol: <span className="font-semibold text-stone-800">{profile?.rol || session.user?.rol}</span>
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 border border-emerald-200">
            <UserCheck className="size-3.5 text-emerald-600" />
            <span>Cuenta Activa</span>
          </span>
        </div>

        <div className="mt-4 rounded-xl border border-stone-100 bg-stone-50/60 p-3 text-xs text-stone-600">
          <span className="font-medium text-stone-700">Correo de acceso actual: </span>
          <span className="font-semibold text-stone-900">{profile?.email || session.user?.email}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Formulario 1: Cambiar Correo Electrónico */}
        <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
              <Mail className="size-4 text-stone-600" />
              <h3 className="text-sm font-semibold text-stone-900">Cambiar Correo de Acceso</h3>
            </div>
            <p className="mt-2 text-xs text-stone-500">
              Actualice la dirección utilizada para iniciar sesión. Se verificará su contraseña actual.
            </p>

            <form onSubmit={handleUpdateEmail} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-700">
                  Nuevo Correo Electrónico
                </label>
                <input
                  type="email"
                  value={nuevoEmail}
                  onChange={(e) => setNuevoEmail(e.target.value)}
                  placeholder="nuevo.correo@daplace.pe"
                  required
                  className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-stone-900 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700">
                  Contraseña Actual (Confirmación)
                </label>
                <input
                  type="password"
                  value={emailPasswordActual}
                  onChange={(e) => setEmailPasswordActual(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-stone-900 focus:outline-hidden"
                />
              </div>

              {emailError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 flex items-center gap-2">
                  <AlertCircle className="size-3.5 shrink-0 text-red-600" />
                  <span>{emailError}</span>
                </div>
              )}

              {emailSuccess && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                  <span>{emailSuccess}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={emailLoading}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50 cursor-pointer"
              >
                {emailLoading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Actualizando...</span>
                  </>
                ) : (
                  <span>Actualizar Correo</span>
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Formulario 2: Cambiar Contraseña */}
        <div className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
              <KeyRound className="size-4 text-stone-600" />
              <h3 className="text-sm font-semibold text-stone-900">Cambiar Contraseña</h3>
            </div>
            <p className="mt-2 text-xs text-stone-500">
              Establezca una nueva contraseña segura (mín. 8 caracteres, mayúsculas, números y símbolos).
            </p>

            <form onSubmit={handleUpdatePassword} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-700">Contraseña Actual</label>
                <input
                  type="password"
                  value={passwordActual}
                  onChange={(e) => setPasswordActual(e.target.value)}
                  placeholder="••••••••••••"
                  required
                  className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-stone-900 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700">Nueva Contraseña</label>
                <input
                  type="password"
                  value={nuevoPassword}
                  onChange={(e) => setNuevoPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres robustos"
                  required
                  className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-stone-900 focus:outline-hidden"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-700">
                  Confirmar Nueva Contraseña
                </label>
                <input
                  type="password"
                  value={confirmarPassword}
                  onChange={(e) => setConfirmarPassword(e.target.value)}
                  placeholder="Repita la nueva contraseña"
                  required
                  className="mt-1 block w-full rounded-lg border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-stone-900 focus:outline-hidden"
                />
              </div>

              {passwordError && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-800 flex items-center gap-2">
                  <AlertCircle className="size-3.5 shrink-0 text-red-600" />
                  <span>{passwordError}</span>
                </div>
              )}

              {passwordSuccess && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600" />
                    <span>{passwordSuccess}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      navigate('/login', { replace: true });
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-emerald-900 underline hover:text-emerald-950 cursor-pointer"
                  >
                    <span>Ir a iniciar sesión</span>
                    <ArrowRight className="size-3" />
                  </button>
                </div>
              )}

              <button
                type="submit"
                disabled={passwordLoading}
                className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-stone-800 disabled:opacity-50 cursor-pointer"
              >
                {passwordLoading ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>Actualizando...</span>
                  </>
                ) : (
                  <span>Cambiar Contraseña</span>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
