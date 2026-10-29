import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../shared/database.js';

import type { PrismaClient } from '../generated/prisma/client.js';

dotenv.config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

export async function seedDatabase(target?: PrismaClient | string) {
  let prisma: PrismaClient;
  let shouldClose = false;
  let closeFn: (() => Promise<void>) | undefined;

  if (target && typeof target === 'object' && '$queryRaw' in target) {
    prisma = target as PrismaClient;
  } else {
    const isTestEnv = process.env.NODE_ENV === 'test';
    if (!target && isTestEnv) {
      throw new Error(
        'OPERACIÓN ABORTADA POR SEGURIDAD: En entorno de test, seedDatabase debe recibir explícitamente la instancia de Prisma de prueba o DATABASE_TEST_URL.'
      );
    }

    const url = typeof target === 'string' ? target : process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL es obligatoria para sembrar la base de datos.');

    // Validar host local
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    const allowedHosts = ['localhost', '127.0.0.1', '::1'];
    if (!allowedHosts.includes(host)) {
      throw new Error(`OPERACIÓN ABORTADA: No se permite sembrar en un host remoto "${host}".`);
    }

    const db = createDatabase(url);
    prisma = db.prisma;
    shouldClose = true;
    closeFn = () => db.close();
  }

  try {
    console.log('--- Starting DAPLACE Synthetic Seed ---');

  // 1. Usuarios / Propietarios
  const usuariosData = [
    {
      id: 'usr-101',
      nombre: 'Inversiones San Isidro S.A.C.',
      email: 'contacto@sanisidro-inversiones.example.invalid',
      telefono: '+51 1 422 9900',
      rol: 'PROPIETARIO' as const,
      activo: true,
    },
    {
      id: 'usr-102',
      nombre: 'Carlos Eduardo Méndez',
      email: 'carlos.mendez@propietarios.example.invalid',
      telefono: '+51 987 111 222',
      rol: 'PROPIETARIO' as const,
      activo: true,
    },
    {
      id: 'usr-103',
      nombre: 'María Elena Alarcón',
      email: 'maria.alarcon@propietarios.example.invalid',
      telefono: '+51 998 333 444',
      rol: 'PROPIETARIO' as const,
      activo: true,
    },
    {
      id: 'usr-104',
      nombre: 'Grupo Inmobiliario del Sur',
      email: 'administracion@inmodelsur.example.invalid',
      telefono: '+51 1 244 5566',
      rol: 'PROPIETARIO' as const,
      activo: true,
    },
    {
      id: 'usr-admin',
      nombre: 'Administrador Sistema DAPLACE',
      email: 'admin@daplace.example.invalid',
      telefono: '+51 900 000 000',
      rol: 'ADMIN' as const,
      activo: true,
    },
    {
      id: 'usr-operador',
      nombre: 'Operador Operativo DAPLACE',
      email: 'operador@daplace.example.invalid',
      telefono: '+51 900 000 001',
      rol: 'OPERADOR' as const,
      activo: true,
    },
  ];

  for (const u of usuariosData) {
    await prisma.usuario.upsert({
      where: { id: u.id },
      update: { nombre: u.nombre, email: u.email, telefono: u.telefono, rol: u.rol, activo: u.activo },
      create: u,
    });
  }
  console.log(`✓ Seeded ${usuariosData.length} usuarios.`);

  // 2. Propiedades
  const propiedadesData = [
    {
      id: 'prop-01',
      nombre: 'Departamento Miraflores Malecón Balta',
      propietarioId: 'usr-102',
      direccion: 'Malecón Balta 740, Dpto 802, Miraflores, Lima',
      estadoOperativo: 'OPERATIVA' as const,
      estadoPublicacion: 'PUBLICADA' as const,
      activa: true,
      capacidadHuespedes: 4,
      precioBaseNoche: 280.0,
      moneda: 'PEN',
    },
    {
      id: 'prop-02',
      nombre: 'Suite Boutique Barranco Tradicional',
      propietarioId: 'usr-103',
      direccion: 'Av. Pedro de Osma 215, Barranco, Lima',
      estadoOperativo: 'OPERATIVA' as const,
      estadoPublicacion: 'PUBLICADA' as const,
      activa: true,
      capacidadHuespedes: 2,
      precioBaseNoche: 220.0,
      moneda: 'PEN',
    },
    {
      id: 'prop-03',
      nombre: 'Loft Ejecutivo San Isidro Golf',
      propietarioId: 'usr-101',
      direccion: 'Av. Coronel Portillo 450, San Isidro, Lima',
      estadoOperativo: 'EN_MANTENIMIENTO' as const,
      estadoPublicacion: 'PAUSADA' as const,
      activa: true,
      capacidadHuespedes: 2,
      precioBaseNoche: 350.0,
      moneda: 'PEN',
    },
    {
      id: 'prop-04',
      nombre: 'Casa de Playa Punta Hermosa',
      propietarioId: 'usr-102',
      direccion: 'Calle Los Pulpos Mz C Lote 4, Punta Hermosa',
      estadoOperativo: 'OPERATIVA' as const,
      estadoPublicacion: 'BORRADOR' as const,
      activa: true,
      capacidadHuespedes: 8,
      precioBaseNoche: 650.0,
      moneda: 'PEN',
    },
    {
      id: 'prop-05',
      nombre: 'Estudio Centro Financiero',
      propietarioId: 'usr-104',
      direccion: 'Calle Las Begonias 320, Int 101, San Isidro, Lima',
      estadoOperativo: 'INACTIVA' as const,
      estadoPublicacion: 'PAUSADA' as const,
      activa: false,
      capacidadHuespedes: 2,
      precioBaseNoche: 180.0,
      moneda: 'PEN',
    },
  ];

  for (const p of propiedadesData) {
    await prisma.propiedad.upsert({
      where: { id: p.id },
      update: {
        nombre: p.nombre,
        propietarioId: p.propietarioId,
        direccion: p.direccion,
        estadoOperativo: p.estadoOperativo,
        estadoPublicacion: p.estadoPublicacion,
        activa: p.activa,
        capacidadHuespedes: p.capacidadHuespedes,
        precioBaseNoche: p.precioBaseNoche,
        moneda: p.moneda,
      },
      create: p,
    });
  }
  console.log(`✓ Seeded ${propiedadesData.length} propiedades.`);

  // 3. Huéspedes
  const huespedesData = [
    {
      id: 'hue-01',
      nombreCompleto: 'Alejandro Silva Rivas',
      telefono: '+51 987 000 111',
      email: 'alejandro.silva@example.invalid',
      tipoDocumento: 'DNI' as const,
      numeroDocumento: '44556677',
      nacionalidad: 'Peruana',
      notas: 'Cliente corporativo frecuente. Prefiere piso alto.',
    },
    {
      id: 'hue-02',
      nombreCompleto: 'Sophie Martin',
      telefono: '+33 600 112 233',
      email: 'sophie.martin@example.invalid',
      tipoDocumento: 'PASAPORTE' as const,
      numeroDocumento: 'FR998877',
      nacionalidad: 'Francesa',
      notas: 'Llegada en vuelo nocturno.',
    },
    {
      id: 'hue-03',
      nombreCompleto: 'Diego Fernando Rojas',
      telefono: '+51 999 444 333',
      email: 'diego.rojas@example.invalid',
      tipoDocumento: 'DNI' as const,
      numeroDocumento: '71223344',
      nacionalidad: 'Peruana',
      notas: 'Solicitó estacionamiento adicional.',
    },
    {
      id: 'hue-04',
      nombreCompleto: 'Camila Vega Benavides',
      telefono: '+56 9 8877 6655',
      email: 'camila.vega@example.invalid',
      tipoDocumento: 'PASAPORTE' as const,
      numeroDocumento: 'CL554433',
      nacionalidad: 'Chilena',
      notas: 'Registro inicial por consulta telefónica.',
    },
  ];

  for (const h of huespedesData) {
    await prisma.huesped.upsert({
      where: { id: h.id },
      update: {
        nombreCompleto: h.nombreCompleto,
        telefono: h.telefono,
        email: h.email,
        tipoDocumento: h.tipoDocumento,
        numeroDocumento: h.numeroDocumento,
        nacionalidad: h.nacionalidad,
        notas: h.notas,
      },
      create: h,
    });
  }
  console.log(`✓ Seeded ${huespedesData.length} huéspedes.`);

  // 4. Reservas
  const reservasData = [
    {
      id: 'res-01',
      propiedadId: 'prop-01',
      huespedId: 'hue-01',
      ingreso: new Date('2026-11-10T00:00:00Z'),
      salida: new Date('2026-11-15T00:00:00Z'),
      noches: 5,
      estado: 'CONFIRMADA' as const,
      montoAcordado: 1400.0,
      moneda: 'PEN',
      origen: 'WEB' as const,
      notas: 'Cliente corporativo frecuente. Prefiere piso alto.',
    },
    {
      id: 'res-02',
      propiedadId: 'prop-03',
      huespedId: 'hue-02',
      ingreso: new Date('2026-11-18T00:00:00Z'),
      salida: new Date('2026-11-22T00:00:00Z'),
      noches: 4,
      estado: 'COMPLETADA' as const,
      montoAcordado: 1400.0,
      moneda: 'PEN',
      origen: 'AIRBNB' as const,
      referenciaCanal: 'HM-998877',
      notas: 'Llegada en vuelo nocturno.',
    },
    {
      id: 'res-03',
      propiedadId: 'prop-01',
      huespedId: 'hue-03',
      ingreso: new Date('2026-10-15T00:00:00Z'),
      salida: new Date('2026-10-18T00:00:00Z'),
      noches: 3,
      estado: 'COMPLETADA' as const,
      montoAcordado: 840.0,
      moneda: 'PEN',
      origen: 'DIRECTO' as const,
      notas: 'Solicitó estacionamiento adicional.',
    },
    {
      id: 'res-04',
      propiedadId: 'prop-02',
      huespedId: 'hue-01',
      ingreso: new Date('2026-12-01T00:00:00Z'),
      salida: new Date('2026-12-05T00:00:00Z'),
      noches: 4,
      estado: 'SOLICITADA' as const,
      montoAcordado: 880.0,
      moneda: 'PEN',
      origen: 'WEB' as const,
      notas: 'Solicitud web en espera de confirmación.',
    },
    {
      id: 'res-05',
      propiedadId: 'prop-01',
      huespedId: 'hue-04',
      ingreso: new Date('2026-11-20T00:00:00Z'),
      salida: new Date('2026-11-25T00:00:00Z'),
      noches: 5,
      estado: 'CANCELADA' as const,
      montoAcordado: 1400.0,
      moneda: 'PEN',
      origen: 'WEB' as const,
      notas: 'Cancelación previa para probar liberación de disponibilidad.',
      motivoCancelacion: 'Cancelada a petición del huésped por cambio de itinerario.',
    },
    {
      id: 'res-06',
      propiedadId: 'prop-01',
      huespedId: 'hue-02',
      ingreso: new Date('2026-11-15T00:00:00Z'),
      salida: new Date('2026-11-18T00:00:00Z'),
      noches: 3,
      estado: 'CONFIRMADA' as const,
      montoAcordado: 840.0,
      moneda: 'PEN',
      origen: 'DIRECTO' as const,
      notas: 'Reserva consecutiva: entra el día exacto que sale res-01 (2026-11-15).',
    },
  ];

  for (const r of reservasData) {
    await prisma.reserva.upsert({
      where: { id: r.id },
      update: {
        propiedadId: r.propiedadId,
        huespedId: r.huespedId,
        ingreso: r.ingreso,
        salida: r.salida,
        noches: r.noches,
        estado: r.estado,
        montoAcordado: r.montoAcordado,
        moneda: r.moneda,
        origen: r.origen,
        referenciaCanal: r.referenciaCanal,
        notas: r.notas,
        motivoCancelacion: r.motivoCancelacion,
      },
      create: r,
    });
  }
  console.log(`✓ Seeded ${reservasData.length} reservas.`);

  // 5. Auditoría inicial
  await prisma.auditoriaEvento.create({
    data: {
      entidad: 'Sistema',
      entidadId: 'seed-initial',
      accion: 'SEED_EJECUTADO',
      actor: 'SYSTEM_DEV',
      detalles: {
        usuarios: usuariosData.length,
        propiedades: propiedadesData.length,
        huespedes: huespedesData.length,
        reservas: reservasData.length,
      },
    },
  });
  console.log('✓ Recorded audit event.');

  console.log('--- Seed Completed Successfully ---');
  } finally {
    if (shouldClose && closeFn) {
      await closeFn();
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seedDatabase().catch((err) => {
    console.error('Seed error:', err);
    process.exitCode = 1;
  });
}
