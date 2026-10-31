import React, { useEffect, useState } from 'react';
import {
  Users,
  UserPlus,
  Shield,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
  RefreshCw,
  KeyRound,
  X,
  Phone,
  Briefcase,
  Mail,
  User as UserIcon,
} from 'lucide-react';
import { staffService } from '../services/staffService';
import type { CreateStaffDto, StaffRole, StaffUser } from '../types';
import { useAuth } from '../../auth/AuthContext';

export const StaffPage: React.FC = () => {
  const { session } = useAuth();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal de creación
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [formData, setFormData] = useState<CreateStaffDto>({
    nombre: '',
    email: '',
    password: '',
    rol: 'OPERADOR',
    cargo: '',
    telefono: '',
  });

  const loadStaffUsers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await staffService.getStaffUsers();
      setUsers(data);
    } catch (err: any) {
      setError(err?.message || 'Error al cargar el personal administrativo');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStaffUsers();
  }, []);

  const handleToggleStatus = async (user: StaffUser) => {
    if (user.id === session.user?.id) {
      setError('Por seguridad, no puedes desactivar tu propia cuenta activa.');
      return;
    }

    const nuevoEstado = !user.isActive;
    const confirmMessage = nuevoEstado
      ? `¿Deseas activar la cuenta de ${user.nombre}? Tendrá acceso nuevamente al sistema.`
      : `¿Estás seguro de desactivar la cuenta de ${user.nombre}? Sus sesiones activas serán revocadas inmediatamente.`;

    if (!window.confirm(confirmMessage)) return;

    try {
      setActionLoadingId(user.id);
      setError(null);
      const updated = await staffService.updateStaffStatus(user.id, nuevoEstado);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
      setSuccessMessage(`La cuenta de ${user.nombre} ha sido ${nuevoEstado ? 'activada' : 'desactivada'} correctamente.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Error al actualizar el estado de la cuenta');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleChangeRole = async (user: StaffUser, newRole: StaffRole) => {
    if (user.rol === newRole) return;
    try {
      setActionLoadingId(user.id);
      setError(null);
      const updated = await staffService.updateStaffRole(user.id, newRole);
      setUsers((prev) => prev.map((u) => (u.id === user.id ? updated : u)));
      setSuccessMessage(`Rol de ${user.nombre} actualizado a ${newRole}.`);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setError(err?.message || 'Error al cambiar el rol del usuario');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.nombre.trim() || formData.nombre.trim().length < 2) {
      setModalError('El nombre completo debe tener al menos 2 caracteres.');
      return;
    }
    if (!formData.email.trim() || !formData.email.includes('@')) {
      setModalError('Ingrese un correo electrónico válido.');
      return;
    }
    if (!formData.password || formData.password.length < 8) {
      setModalError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    try {
      setIsSubmitting(true);
      setModalError(null);
      const created = await staffService.createStaffUser(formData);
      setUsers((prev) => [created, ...prev]);
      setIsModalOpen(false);
      setFormData({
        nombre: '',
        email: '',
        password: '',
        rol: 'OPERADOR',
        cargo: '',
        telefono: '',
      });
      setSuccessMessage(`Colaborador ${created.nombre} registrado con éxito con rol ${created.rol}.`);
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setModalError(err?.message || 'No fue posible registrar la cuenta');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-stone-900">
              Personal y Cuentas Internas
            </h1>
            <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600 border border-stone-200">
              HU-19
            </span>
          </div>
          <p className="mt-1 text-sm text-stone-500">
            Administración segura de colaboradores, roles internos y vinculación de identidad transaccional.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={loadStaffUsers}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-xs transition hover:bg-stone-50 disabled:opacity-50 cursor-pointer"
            title="Refrescar lista"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refrescar</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setModalError(null);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#183b32] px-3.5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-[#122e27] cursor-pointer"
          >
            <UserPlus size={15} />
            <span>Nuevo Colaborador</span>
          </button>
        </div>
      </div>

      {/* Alertas informativas */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <AlertCircle size={16} className="shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
          <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* 2. Tabla de Cuentas */}
      <div className="rounded-xl border border-stone-200 bg-white shadow-xs overflow-hidden">
        <div className="p-4 border-b border-stone-200/80 bg-stone-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-semibold text-stone-700">
            <Users size={16} className="text-[#183b32]" />
            <span>Colaboradores Registrados ({users.length})</span>
          </div>
          <span className="text-[11px] text-stone-400">
            Roles autorizados: ADMINISTRADOR y OPERADOR
          </span>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-stone-400">
            <Loader2 size={28} className="animate-spin text-[#183b32]" />
            <p className="mt-2 text-xs font-medium">Cargando cuentas internas...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-stone-500">
            <Users size={36} className="mx-auto text-stone-300 mb-2" />
            <p className="text-sm font-semibold">No se encontraron cuentas internas</p>
            <p className="text-xs text-stone-400 mt-1">
              Comienza dando de alta al primer operador del sistema.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-stone-600">
              <thead className="border-b border-stone-200 bg-stone-50 text-[11px] font-semibold text-stone-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Colaborador</th>
                  <th className="px-4 py-3">Rol Interno</th>
                  <th className="px-4 py-3">Vínculo Dominio</th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Fecha Alta</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {users.map((u) => {
                  const isCurrentAuthUser = u.id === session.user?.id;
                  const isBusy = actionLoadingId === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-stone-50/75 transition">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="size-8 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-stone-700 font-bold text-xs uppercase">
                            {u.nombre.slice(0, 2)}
                          </div>
                          <div>
                            <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                              <span>{u.nombre}</span>
                              {isCurrentAuthUser && (
                                <span className="rounded-full bg-stone-100 px-1.5 py-0.2 text-[10px] font-medium text-stone-600 border border-stone-200">
                                  Tú
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-stone-400 font-mono">{u.email}</div>
                            {u.cargo && (
                              <div className="text-[10px] text-stone-500 mt-0.5">{u.cargo}</div>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <select
                            value={u.rol}
                            onChange={(e) => handleChangeRole(u, e.target.value as StaffRole)}
                            disabled={isBusy || isCurrentAuthUser}
                            className={`rounded-lg border px-2 py-1 text-xs font-semibold cursor-pointer disabled:opacity-60 ${
                              u.rol === 'ADMINISTRADOR'
                                ? 'border-indigo-200 bg-indigo-50 text-indigo-700'
                                : 'border-amber-200 bg-amber-50 text-amber-800'
                            }`}
                          >
                            <option value="OPERADOR">OPERADOR</option>
                            <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                          </select>
                        </div>
                      </td>

                      <td className="px-4 py-3.5">
                        {u.usuario ? (
                          <div className="flex items-center gap-1.5 text-emerald-700">
                            <ShieldCheck size={14} className="shrink-0 text-emerald-600" />
                            <div>
                              <span className="font-mono text-[11px]">Usuario ID: {u.usuario.id.slice(0, 8)}...</span>
                              <div className="text-[10px] text-stone-400">
                                Rol DB: {u.usuario.rol} • {u.usuario.activo ? 'Activo' : 'Inactivo'}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-amber-600 text-[11px]">
                            <Shield size={14} />
                            <span>Sin vínculo transaccional</span>
                          </div>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        {u.isActive ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                            <span className="size-1.5 rounded-full bg-emerald-500" />
                            Activo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700 border border-rose-200">
                            <span className="size-1.5 rounded-full bg-rose-500" />
                            Inactivo
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3.5 text-stone-400 text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString('es-PE')}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(u)}
                          disabled={isBusy || isCurrentAuthUser}
                          title={isCurrentAuthUser ? 'No puedes desactivar tu propia cuenta' : ''}
                          className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                            u.isActive
                              ? 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
                              : 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                          }`}
                        >
                          {isBusy ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : u.isActive ? (
                            <>
                              <XCircle size={13} />
                              <span>Desactivar</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 size={13} />
                              <span>Activar</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Modal de Registro de Colaborador */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-stone-100">
              <div className="flex items-center gap-2">
                <div className="rounded-lg bg-emerald-50 p-2 text-[#183b32]">
                  <UserPlus size={18} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Alta de Cuenta Interna</h3>
                  <p className="text-[11px] text-stone-400">HU-19: Creación con vínculo a actor transaccional</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700 cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            {modalError && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
                <AlertCircle size={15} className="shrink-0 text-rose-600" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Nombre Completo *
                </label>
                <div className="relative">
                  <UserIcon size={14} className="absolute left-2.5 top-2.5 text-stone-400" />
                  <input
                    type="text"
                    required
                    value={formData.nombre}
                    onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
                    placeholder="Ej. Sofía Valdivia"
                    className="w-full rounded-lg border border-stone-300 pl-8 pr-3 py-1.5 text-xs text-stone-900 focus:border-[#183b32] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Correo Electrónico *
                </label>
                <div className="relative">
                  <Mail size={14} className="absolute left-2.5 top-2.5 text-stone-400" />
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="sofia.operaciones@daplace.pe"
                    className="w-full rounded-lg border border-stone-300 pl-8 pr-3 py-1.5 text-xs text-stone-900 focus:border-[#183b32] focus:outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Contraseña Inicial * (mínimo 8 caracteres)
                </label>
                <div className="relative">
                  <KeyRound size={14} className="absolute left-2.5 top-2.5 text-stone-400" />
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full rounded-lg border border-stone-300 pl-8 pr-3 py-1.5 text-xs text-stone-900 focus:border-[#183b32] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Rol Interno *
                  </label>
                  <select
                    value={formData.rol}
                    onChange={(e) => setFormData({ ...formData, rol: e.target.value as StaffRole })}
                    className="w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs text-stone-900 focus:border-[#183b32] focus:outline-hidden cursor-pointer"
                  >
                    <option value="OPERADOR">OPERADOR</option>
                    <option value="ADMINISTRADOR">ADMINISTRADOR</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-stone-700 mb-1">
                    Teléfono (opcional)
                  </label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-2.5 top-2.5 text-stone-400" />
                    <input
                      type="tel"
                      value={formData.telefono || ''}
                      onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
                      placeholder="+51 987 654 321"
                      className="w-full rounded-lg border border-stone-300 pl-8 pr-3 py-1.5 text-xs text-stone-900 focus:border-[#183b32] focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 mb-1">
                  Cargo / Puesto (opcional)
                </label>
                <div className="relative">
                  <Briefcase size={14} className="absolute left-2.5 top-2.5 text-stone-400" />
                  <input
                    type="text"
                    value={formData.cargo || ''}
                    onChange={(e) => setFormData({ ...formData, cargo: e.target.value })}
                    placeholder="Ej. Coordinador de Turno Mañana"
                    className="w-full rounded-lg border border-stone-300 pl-8 pr-3 py-1.5 text-xs text-stone-900 focus:border-[#183b32] focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-stone-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#183b32] px-4 py-1.5 text-xs font-semibold text-white hover:bg-[#122e27] disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting && <Loader2 size={13} className="animate-spin" />}
                  <span>Registrar Cuenta</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
