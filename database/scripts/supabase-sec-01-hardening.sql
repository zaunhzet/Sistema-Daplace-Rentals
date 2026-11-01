-- ==============================================================================
-- DAPLACE RENTALS — SUPABASE-SEC-01-FIX: Script de Endurecimiento de Seguridad
-- Versión: 1.0.0
-- Fecha: 2026-11-01
-- Rol de Ejecución Requerido: postgres (Database Owner / Superusuario)
-- Proyecto Supabase Objetivo: bdfeiiqcswdxzrqoykwp
--
-- DESCRIPCIÓN:
-- Este script implementa la defensa en profundidad (Defense-in-Depth) sobre el
-- esquema 'public' de PostgreSQL en Supabase para Daplace Rentals:
-- 1. Revoca privilegios de acceso (DML/DDL) a roles públicos ('anon', 'authenticated').
-- 2. Revoca privilegios predeterminados futuros sobre tablas y secuencias creadas por 'postgres'.
-- 3. Habilita Row Level Security (RLS) en las 18 tablas (Default Deny sin políticas públicas).
-- 4. NO modifica 'supabase_admin' (evita error 42501 por falta de pertenencia).
-- 5. NO revoca rutinas indiscriminadamente (preserva funciones de la extensión btree_gist).
-- 6. NO modifica permisos globales de USAGE sobre 'public' para no romper servicios administrados.
-- 7. Preserva el 100% del acceso de 'postgres' (Table Owner bypasses RLS nativamente).
--
-- MODO DE REPRODUCCIÓN EN FUTURAS INSTALACIONES:
-- Tras aplicar todas las migraciones de Prisma ('npx prisma migrate deploy'):
--   psql "$DIRECT_DATABASE_URL" -f database/scripts/supabase-sec-01-hardening.sql
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- PASO 1: Revocar permisos actuales sobre las 18 tablas existentes a roles públicos
-- ------------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- PASO 2: Revocar permisos actuales sobre todas las secuencias a roles públicos
-- ------------------------------------------------------------------------------
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- PASO 3: Endurecer privilegios predeterminados para futuros objetos de 'postgres'
-- ------------------------------------------------------------------------------
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- ------------------------------------------------------------------------------
-- PASO 4: Activar Row Level Security (RLS) en las 18 tablas (Default Deny)
-- ------------------------------------------------------------------------------
-- Tabla técnica de migraciones Prisma
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

-- Tablas de Dominio de Daplace Rentals (17 tablas)
ALTER TABLE public.auditoria_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.avisos_reserva ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_reserva ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidencias_pago ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.garantias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.huespedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.movimientos_garantia ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones_internas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ordenes_trabajo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propiedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sustentos_gasto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

COMMIT;
