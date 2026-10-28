# Base de datos local

PostgreSQL de desarrollo se define en `../compose.yaml`. La configuración es solo para una instancia local y usa credenciales de ejemplo.

1. Crear `.env` desde `../.env.example` y revisar `DATABASE_URL`.
2. Iniciar PostgreSQL con `npm run db:up` desde la raíz.
3. Validar conexión en `http://127.0.0.1:3000/health/ready` cuando el backend esté corriendo.
4. Ejecutar primero `npm run db:validate`; luego revisar y aplicar migraciones con el script adecuado.
5. `npm run db:down` detiene el contenedor, pero conserva el volumen.

No ejecutar reset ni borrar volúmenes. Antes de migrar, comprobar que la URL corresponde a la base local esperada. En esta etapa el esquema no contiene entidades de negocio y la migración inicial está vacía intencionalmente.
