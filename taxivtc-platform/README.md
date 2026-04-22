# TaxiVTC Platform

Aplicación full-stack para operación de taxi/VTC con tres superficies:
- pasajero: presupuesto, solicitud, seguimiento y pago
- conductor: disponibilidad, mapa operativo, aceptación y gestión de viajes
- admin: mapa en vivo, conductores, viajes, licencias y reglas de precio

## Requisitos

- Node.js 20+
- PostgreSQL
- variable `JWT_SECRET`
- `node_modules` fuera de placeholders de iCloud si el proyecto vive en `Desktop`

## Variables de entorno

Usa [.env.example](/Users/jorge/Desktop/taxiapp/taxivtc-platform/.env.example) como base.

Variables mínimas:
- `DATABASE_URL`
- `JWT_SECRET`
- `PORT`
- `ALLOWED_ORIGINS`

## Desarrollo

1. Instala dependencias:
   `npm install`
2. Genera cliente Prisma:
   `npx prisma generate`
3. Ejecuta migraciones o sincroniza esquema según tu entorno
4. Arranca la app:
   `npm run dev`

## Verificación

- Typecheck:
  `npm run lint`
- Build frontend:
  `npm run build`
- Healthcheck:
  `GET /api/health`

## Checklist de salida

- configurar `ALLOWED_ORIGINS` para el dominio real
- usar PostgreSQL gestionado en vez de SQLite local/dev artifacts
- reconstruir `node_modules` en una ruta no sincronizada por iCloud
- revisar `npm audit` y actualizar dependencias vulnerables
- desplegar detrás de proxy TLS con `TRUST_PROXY=true`
