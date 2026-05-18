# IoT Monitor Backend

Backend API para sistema IoT industrial (DLC — embotelladoras). Expone endpoints REST consumidos por dashboard Flutter, workers y servicios ML.

## Stack Tecnologico

| Capa | Tecnologia |
|------|------------|
| Framework | NestJS 11 |
| ORM | TypeORM 0.3 |
| Base de datos | SQL Server (mssql) |
| Auth | JWT (Passport) + Refresh tokens + Rate limiting |
| Push | FCM (best-effort) |
| Email | SMTP opcional |
| Realtime | WebSockets (Socket.IO) + polling fallback |
| Cache | In-memory (Redis recomendado para produccion multi-instancia) |

## Arquitectura

```
AppModule
├── AuthModule (login, refresh, logout, JWT strategy, rate limiting)
├── MonitoringModule (devices, sensors, readings, alerts, thresholds, diagnostics)
│   ├── SensorQueryService — consultas de dispositivos, sensores, lecturas, alertas
│   ├── SensorThresholdService — CRUD de umbrales, perfiles, historial
│   ├── SensorMetricsService — metricas, agregaciones, lecturas historicas
│   ├── SensorDiagnosticService — endpoints de debug y diagnostico
│   ├── AlertMaintenanceService — TTL cleanup, auto-resolve via SP
│   └── DevToolsService — operaciones destructivas de desarrollo
├── NotificationsModule (unread, mark-read, push FCM, email SMTP)
├── IntelligenceModule (predicciones ML, eventos ML, decisiones)
├── CrmModule (dashboard CRM, perfiles de dispositivo)
├── RealtimeModule (WebSocket gateway + poller)
├── ProvisioningModule (registro de dispositivos, API keys, sensores)
├── EventsModule (event bus Redis, DLQ, idempotencia)
├── MqttModule (publicacion de alertas via MQTT)
└── AdminUsersModule (CRUD de usuarios)
```

**Principios SOLID aplicados:** cada servicio tiene una unica responsabilidad (SRP). Los God Classes han sido refactorizados en sub-servicios especializados. Ver `docs/ARCHITECTURE.md` para detalles.

## Requisitos previos

- Node.js 18+ y npm
- SQL Server accesible (Docker recomendado) con puerto expuesto
- Usuario con permisos para crear bases de datos

## Instalacion rapida

1. **Clonar y dependencias:**
   ```bash
   git clone <repo-url>
   cd iot_monitor_backend
   npm install
   ```

2. **Configurar variables de entorno:**
   ```bash
   cp .env.example .env
   # Editar .env con credenciales reales
   ```

3. **Crear base de datos:**
   ```bash
   sqlcmd -S localhost,1434 -U sa -P "<TU_PASSWORD>" -i iot_schema.sql
   ```

4. **Ejecutar:**
   ```bash
   # Desarrollo con recarga automatica
   npm run start:dev
   
   # Produccion
   npm run build
   npm run start:prod
   ```

El backend escucha en `http://localhost:3000` (o el puerto definido en `PORT`).

## Variables de entorno

Ver `.env.example` para lista completa. Las mas importantes:

| Variable | Descripcion | Ejemplo |
|----------|-------------|---------|
| `DB_HOST` | Servidor SQL Server | `localhost` |
| `DB_PORT` | Puerto SQL Server | `1434` |
| `DB_USER` | Usuario BD | `sa` |
| `DB_PASSWORD` | Contrasena BD | `TuPassword` |
| `DB_NAME` | Nombre BD | `iot_monitoring_system` |
| `JWT_SECRET` | Secret JWT (min 32 chars) | `tu-secret-largo-aqui` |
| `REFRESH_TOKEN_SECRET` | Secret refresh tokens | `otro-secret-largo` |
| `CORS_ORIGINS` | Origenes permitidos (prod) | `https://app.tudominio.com` |
| `FCM_SERVER_KEY` | Clave FCM (opcional) | `AAAA...` |
| `INTERNAL_API_KEY` | Key para endpoints servicio-a-servicio | `internal-api-key` |

> **Seguridad:** `.env` esta en `.gitignore`. NUNCA commitear credenciales reales.

## Endpoints principales

### Auth (`/auth`)

| Metodo | Endpoint | Descripcion | Roles |
|--------|----------|-------------|-------|
| POST | `/auth/login` | Login JWT + cookies | — |
| POST | `/auth/refresh` | Refresh token rotation | — |
| POST | `/auth/logout` | Logout + revocacion | — |

### Monitoring (`/monitoring`)

| Metodo | Endpoint | Descripcion | Roles |
|--------|----------|-------------|-------|
| GET | `/monitoring/devices` | Lista dispositivos con sensores | admin, operator, viewer |
| GET | `/monitoring/devices/:id` | Detalle de dispositivo | admin, operator, viewer |
| GET | `/monitoring/readings/latest` | Ultimas lecturas por sensor | admin, operator, viewer |
| GET | `/monitoring/sensors/:id/readings` | Historial de lecturas | admin, operator, viewer |
| GET | `/monitoring/alerts/active` | Alertas activas/ack | admin, operator, viewer |
| GET | `/monitoring/predictions` | Predicciones ML | admin, operator, viewer |
| GET | `/monitoring/ml-events/active` | Eventos ML activos | admin, operator, viewer |
| GET | `/monitoring/sensors/:id/thresholds` | Umbrales del sensor | admin, operator, viewer |
| POST | `/monitoring/sensors/:id/readings` | Insertar lectura (SP) | admin |
| GET | `/monitoring/sensors/:id/state` | Estado computado del sensor | admin, operator, viewer |

### CRM (`/crm`)

| Metodo | Endpoint | Descripcion | Roles |
|--------|----------|-------------|-------|
| GET | `/crm/devices` | Lista paginada de dispositivos | admin, operator, viewer |
| GET | `/crm/devices/:id/profile` | Perfil del dispositivo | admin, operator, viewer |
| GET | `/crm/devices/:id/profile-full` | Perfil completo con KPIs | admin, operator, viewer |
| GET | `/crm/dashboard` | Dashboard global con KPIs | admin, operator, viewer |
| GET | `/crm/alerts` | Lista de alertas con filtros | admin, operator, viewer |
| POST | `/crm/alerts/:id/acknowledge` | Reconocer alerta | admin, operator |
| POST | `/crm/alerts/:id/resolve` | Resolver alerta | admin, operator |

### Notifications (`/notifications`)

| Metodo | Endpoint | Descripcion | Roles |
|--------|----------|-------------|-------|
| GET | `/notifications/unread` | Notificaciones no leidas | admin, operator, viewer |
| POST | `/notifications/mark-read` | Marcar como leidas | admin, operator, viewer |
| POST | `/notifications/internal/trigger-push` | Trigger push interno (API key) | — |

### Provisioning (`/devices`)

| Metodo | Endpoint | Descripcion | Roles |
|--------|----------|-------------|-------|
| POST | `/devices/create` | Crear dispositivo | admin |
| POST | `/devices/:uuid/prepare-activation` | Generar codigo de activacion | admin |
| POST | `/devices/activate` | Activar dispositivo | — |
| POST | `/devices/:uuid/sensors/define` | Definir sensor | admin |
| POST | `/devices/sensors/:id/publish` | Publicar sensor | admin |

## Seguridad

- **JWT** con access tokens (15 min TTL) y refresh tokens con rotacion
- **Rate limiting** en login (5 intentos/IP/15 min)
- **CORS** restringido en produccion (requiere `Origin` header)
- **Validacion global** de DTOs con `ValidationPipe` (`whitelist: true`)
- **SQL Injection** mitigado via TypeORM queries parametrizadas y stored procedures
- **Secrets** validados al arranque (min 32 chars para JWT)
- **Endpoints internos** protegidos por `INTERNAL_API_KEY` (servicio-a-servicio)

Ver `docs/SECURITY.md` para politica completa y reporte de vulnerabilidades.

## Tests

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Cobertura
npm run test:cov

# Verificacion de tipos
npx tsc --noEmit
```

## Scripts utiles

```bash
# Lint
npm run lint

# Formatear codigo
npm run format

# Build produccion
npm run build
```

## Documentacion tecnica

- [Arquitectura](docs/ARCHITECTURE.md) — diagrama de modulos, flujo de datos, decisiones tecnicas
- [Contribuir](docs/CONTRIBUTING.md) — estandares de codigo, convenciones de commits, checklist PR
- [Seguridad](docs/SECURITY.md) — politica de reporte de vulnerabilidades
- [Changelog](docs/CHANGELOG.md) — historial de cambios notables

## Decisiones tecnicas clave

- **TypeORM `synchronize: false`**: esquema gestionado por scripts SQL, no auto-migraciones
- **Vistas SQL**: `v_devices_with_sensors`, `v_latest_sensor_readings`, `v_active_alerts` simplifican joins complejos
- **SSOT notificaciones**: `dbo.alert_notifications` evita que la UI deduzca unread desde multiples tablas
- **Stored procedures**: `sp_insert_reading_and_check_threshold` centraliza logica de evaluacion de umbrales en BD
- **In-memory cache**: para dashboard KPIs y badges (30-60s TTL). Migrar a Redis para produccion multi-instancia

## Limitaciones conocidas

- Cache en memoria (no distribuido). Para multi-instancia usar Redis.
- Realtime via polling; WebSockets disponibles pero no obligatorios.
- Emails criticos requieren configuracion SMTP completa; sin ella se registran como `[EMAIL PENDING]`.

## Licencia

MIT
