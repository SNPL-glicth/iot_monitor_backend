# iot_monitor_backend
 
 ## Qué hace esta parte del sistema
 
 Este proyecto es el **backend principal** (NestJS + TypeORM + SQL Server) que expone APIs consumidas por el dashboard Flutter.
 
 En el estado actual implementa:
 
 - Autenticación JWT y roles (`admin`, `operator`, `viewer`).
 - Endpoints de monitoreo (`/monitoring/*`) sobre dispositivos, sensores, lecturas, alertas, predicciones y eventos ML.
 - Endpoints CRM (`/crm/*`) para pantallas de administración/negocio en el frontend.
 - Notificaciones (`/notifications/*`) basadas en `dbo.alert_notifications` (SSOT para unread).
 - Push notifications “best-effort” vía FCM (si hay configuración) y emails para alertas críticas (si hay configuración).
 - Módulo de inteligencia con utilidades de diagnóstico y conversión de `predictions -> ml_events` en escenarios donde existan predicciones sin evento asociado.
 
 ## Qué problema resuelve
 
 - Centraliza el acceso a datos IoT para la UI:
   - La app Flutter no consulta la BD directamente.
 - Provee un contrato HTTP estable para:
   - Estado (snapshots) y eventos (notificaciones).
   - Gestión de usuarios.
 - Simplifica la UI devolviendo payloads ya procesados/filtrados (por ejemplo, `/notifications/unread` aplica prioridad y filtros).
 
 ## Cómo funciona internamente (flujo real)
 
 ### Arranque y CORS
 
 - Entry point: `src/main.ts`.
 - Carga `.env` via `dotenv/config`.
 - Habilita:
   - `cookie-parser` + middleware CSRF.
   - interceptor global de logging HTTP.
   - CORS con lista configurable (`CORS_ORIGINS`) y defaults para dev (incluye `http://10.0.2.2:3000`).
 
 ### Notificaciones (unread / mark-read)
 
 - SSOT de notificaciones: `dbo.alert_notifications`.
 - `GET /notifications/unread`:
   - Trae notificaciones no leídas.
   - Ordena por prioridad:
     - `source='alert'` antes que `source='ml_event'`.
     - `critical` antes que `warning`.
     - `created_at` desc.
   - Filtra sensores por estado operacional (solo `NORMAL`, `WARNING`, `ALERT` o `NULL`).
 - `POST /notifications/mark-read`:
   - Actualiza `is_read=1` y `read_at` para una lista de IDs.
 
 ### Push notifications (trigger interno)
 
 - Endpoint interno: `POST /notifications/internal/trigger-push`.
 - Autenticación: header `X-Internal-Key` debe coincidir con `INTERNAL_API_KEY`.
 - Casos:
   - `type='alert'` + `alertId`: envía push/email para alerta crítica.
   - `type='decision'` + `deviceId` + `title`: envía push “custom” para una decisión.
 - Envío real:
   - Push se envía solo si `FCM_SERVER_KEY` está configurada.
   - Emails críticos se envían solo si `CRITICAL_ALERT_EMAILS` y configuración SMTP están presentes; si falta `SMTP_API_URL`, el backend registra un log `[EMAIL PENDING]`.
 
 ### Inteligencia (ML pipeline)
 
 - Existe lógica de diagnóstico/conversión en `src/intelligence/ml-pipeline.service.ts`:
   - `diagnosePipeline()` analiza cuántas predicciones tienen o no eventos asociados.
   - `convertPredictionsToEvents()` toma predicciones sin `ml_events` y crea eventos según reglas (anomalía, riesgo, severidad, umbrales, tendencia).
 
 ## Cómo se comunica con las otras partes
 
 - **SQL Server (`iot_database`)**:
   - Lee tablas y vistas (dispositivos, sensores, lecturas, alertas, predicciones, eventos ML, notificaciones, etc.).
   - Escribe:
     - `alert_notifications` (mark read).
     - `push_tokens` (registro de tokens FCM).
     - potencialmente `ml_events` (conversión de predicciones en escenarios de reparación).
 - **Frontend (`iot_monito_dashboard`)**:
   - Consume `/auth/*`, `/crm/*`, `/monitoring/*`, `/notifications/*`.
 - **Ingesta (`iot_ingest_services`)**:
   - Inserta lecturas en BD; el backend las expone en endpoints de lectura.
 - **ML (`iot_machine_learning`)**:
   - Inserta `predictions`/`ml_events`/`alert_notifications`; el backend los expone.
 - **Worker (`iot_worker`)**:
   - Puede llamar el endpoint interno de push cuando genera decisiones.
 
 ## Ventajas del enfoque actual
 
 - API central para múltiples vistas del frontend (monitoring + CRM + notificaciones).
 - Notificaciones desacopladas como tabla (soporta UX de “campanita”).
 - Push/email son opcionales y no bloquean el sistema si faltan credenciales.
 
 ## Desventajas o limitaciones actuales
 
 - Parte de la lógica de dominio está repartida (SQL + Python + Nest), y el backend incluye lógica “de reparación” del pipeline ML (conversión prediction→event) que puede solaparse con pipelines Python.
 - Emails vía SMTP no están completamente automatizados si no se configura `SMTP_API_URL`.
 - El sistema “en tiempo real” en UI depende de polling del frontend.
 
 ## Decisiones técnicas tomadas y por qué
 
 - **TypeORM con `synchronize: false`**: el esquema se gestiona por scripts/migraciones SQL.
 - **Endpoint interno para push**: permite disparar notificaciones desde workers Python sin JWT.
 - **SSOT de notificaciones**: `alert_notifications` evita que la UI tenga que deducir unread desde `alerts`/`ml_events`.
 
 ## Qué NO hace esta parte
 
 - No ejecuta ingesta directa desde sensores.
 - No entrena modelos ML.
 - No reemplaza `telemetry_iot` (servicio separado de telemetría).
 
 ## Preguntas tipo debate o entrevista
 
 ### ¿Por qué existe un endpoint interno (`/notifications/internal/trigger-push`) y no se usa JWT?
 
 Porque está diseñado para integraciones servicio-a-servicio (por ejemplo, workers Python). El control de acceso actual se hace por `INTERNAL_API_KEY`.
 
 ### ¿Qué pasa si no hay configuración de FCM/SMTP?
 
 - Si falta `FCM_SERVER_KEY`, el backend no envía push (solo loguea).
 - Si falta `CRITICAL_ALERT_EMAILS` o SMTP, no envía emails.
 - El flujo principal de monitoreo/unread sigue funcionando.
 
 ---
 
 ## Apéndice: contenido previo del README
 
 <p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
 </p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Descripción

Backend NestJS para un sistema de **IoT Monitoring / IoT System** conectado a SQL Server (Docker / SQL Server Express).

- Base de datos: `iot_monitoring_system`.
- ORM: TypeORM con SQL Server (`mssql`).
- Dominio principal: `devices`, `sensors`, `sensor_readings`, `alert_thresholds`, `alerts`.

## Estado actual (diciembre 2025)
- Exposición de datos para el dashboard Flutter (`iot_monito_dashboard`).
- Separación conceptual en UI y flujos:
  - **Alertas**: eventos operacionales (umbral/alertas activas).
  - **Predicciones (ML)**: resultados de modelos (`dbo.predictions`).
  - **Advertencias (ML)**: eventos ML activos/ack (`dbo.ml_events`) separados de las alertas operacionales.
  - **Notificaciones**: capa independiente (`dbo.alert_notifications`) que representa el estado read/unread para campanitas/badges.

### Endpoints relevantes (consumo desde dashboards)
- Monitoring:
  - `GET /monitoring/devices`
  - `GET /monitoring/readings/latest`
  - `GET /monitoring/sensors/:sensorId/readings?limit=...`
  - `GET /monitoring/alerts/active` (alertas operacionales)
  - `GET /monitoring/predictions` (predicciones ML)
  - `GET /monitoring/ml-events/active?limit=...` (advertencias/eventos ML activos/ack)
- CRM:
  - `GET /crm/dashboard`
  - `GET /crm/devices`
  - `GET /crm/devices/:id/profile-full`
- Notificaciones:
  - `GET /notifications/unread` → snapshot de notificaciones no leídas (alertas operacionales + ML) desde `alert_notifications`.
  - `POST /notifications/mark-read` → marca notificaciones como leídas.

## Requisitos previos

- Node.js y npm instalados.
- Instancia de **SQL Server** accesible (puede ser contenedor Docker) con el puerto expuesto (ej: `localhost,1434`).
- Usuario `sa` (o equivalente) con permisos para crear bases de datos.

## Configuración de la base de datos

1. Ejecutar el script T-SQL que crea la base de datos `iot_monitoring_system`, sus tablas, vistas, índices, triggers, stored procedures y datos de ejemplo.

   Ejemplo usando `sqlcmd`:

   ```bash
   sqlcmd -S localhost,1434 -U sa -P "<TU_PASSWORD>" -i iot_schema.sql
   ```

2. Verificar que las tablas existen (el script ya incluye consultas como `SELECT name FROM sys.tables`).

## Variables de entorno (`.env`)

En la raíz del backend (`iot_monitor_backend`) crea un archivo `.env` con al menos.

Nota: se incluye un ejemplo en `iot_monitor_backend/.env.example` (no subas `.env` con credenciales reales).

```bash
DB_DIALECT=mssql
DB_HOST=localhost
DB_PORT=1434
DB_USER=sa
DB_PASSWORD=TU_PASSWORD
DB_NAME=iot_monitoring_system
PORT=3000
```

El proyecto carga estas variables desde `src/main.ts` usando `dotenv`.

## Instalación de dependencias

```bash
npm install
```

## Ejecutar el backend

```bash
# desarrollo sin watch
npm run start

# desarrollo con recarga automática
npm run start:dev
```

El backend quedará escuchando por defecto en `http://localhost:3000` (o en el puerto definido en `PORT`).

## Seguridad, roles y logs

- Autenticación: JWT (Passport).
- Roles soportados en la app: `admin`, `operator`, `viewer`.
- Logging:
  - Interceptor HTTP global (request/response con tiempo, status y usuario si aplica).
  - Logs de login y CRUD de usuarios admin.

## Endpoints principales

### Auth

- `POST /auth/login`
  - Body: `{ "username": string, "password": string }`
  - Respuesta: `{ access_token, role, user }`

### Admin (solo `admin`)

- CRUD de usuarios bajo `/admin/users`.
  - `GET /admin/users`
  - `POST /admin/users`
  - `PUT /admin/users/:id`
  - `DELETE /admin/users/:id`

### Monitoring (requiere JWT)

El módulo `MonitoringModule` expone endpoints REST bajo el prefijo `/monitoring`.

- Lectura (roles permitidos: `admin`, `operator`, `viewer`)
  - `GET /monitoring/devices`
  - `GET /monitoring/devices/:id`
  - `GET /monitoring/readings/latest`
  - `GET /monitoring/sensors/:sensorId/readings?limit=100`
  - `GET /monitoring/alerts/active`
  - `GET /monitoring/predictions?limit=50`

- Escritura (solo `admin`)
  - `POST /monitoring/sensors/:sensorId/readings`
    - Body: `{ "value": number }`
    - Inserta una lectura usando el stored procedure `sp_insert_reading_and_check_threshold`.

## Cómo integrarlo con el frontend IoT (Flutter)

Desde el frontend puedes consumir este backend haciendo peticiones HTTP a los endpoints anteriores, por ejemplo:

- Mostrar en un dashboard la lista de dispositivos (`/monitoring/devices`) y sus sensores.
- Mostrar las últimas lecturas (`/monitoring/readings/latest`).
- Mostrar gráficas de histórico consultando `/monitoring/sensors/:sensorId/readings`.
- Enviar lecturas reales desde el dispositivo o un simulador con `POST /monitoring/sensors/:sensorId/readings`.

## Notas de diseño

- El mapeo de entidades TypeORM respeta los nombres de tablas y columnas del script T-SQL.
- `synchronize` está deshabilitado en TypeORM (`synchronize: false`) porque el esquema se gestiona completamente con scripts SQL.
- Se utilizan vistas (`ViewEntity`) para simplificar consultas de dashboard sin necesidad de construir joins complejos en el código.

## Run tests

```bash
# unit tests
npm run test

# e2e tests
npm run test:e2e

# test coverage
npm run test:cov
```
If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).

---

## Resumen del proyecto IoT

Este backend implementa un sistema de monitoreo IoT en tiempo real sobre SQL Server. Expone datos listos para ser consumidos por un dashboard Flutter.

### Características clave

- Modelado completo de dispositivos, sensores, lecturas, umbrales, alertas y predicciones ML.
- Datos agregados mediante vistas SQL (`v_devices_with_sensors`, `v_latest_sensor_readings`, `v_active_alerts`).
- Endpoint extra para predicciones: `GET /monitoring/predictions`.
- Respuestas ya formateadas para el dashboard (fechas en `dd/MM/yyyy HH:mm`).
- CORS abierto para desarrollo local.
- Utilidad simple para hash de contraseñas de usuarios con bcrypt.

### Endpoints usados por el dashboard Flutter

- `GET /monitoring/devices`
  - Devuelve filas con dispositivos y sus sensores asociados.
- `GET /monitoring/readings/latest`
  - Última lectura conocida por sensor (para vistas de estado, no para streaming en tiempo real).
- `GET /monitoring/alerts/active`
  - Alertas activas o reconocidas.
- `GET /monitoring/predictions`
  - Predicciones generadas por modelos ML para cada sensor.
- `GET /monitoring/ml-events/active`
  - Eventos ML activos/ack (advertencias ML semánticas).
- `GET /notifications/unread`
  - Notificaciones agregadas (umbral + ML) para la campanita. Ideal para polling cada 2–5s.

Las fechas en estos endpoints se devuelven como cadenas legibles (no en formato ISO crudo) para que el frontend pueda mostrarlas directamente.
