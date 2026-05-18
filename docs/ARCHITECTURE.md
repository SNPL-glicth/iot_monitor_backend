# iot_monitor_backend — Arquitectura

## Visión general

Backend NestJS para un sistema IoT industrial (DLC — embotelladoras). Expone APIs REST consumidas por dashboard Flutter y servicios ML/workers.

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Framework | NestJS 11 |
| ORM | TypeORM 0.3 |
| Base de datos | SQL Server (mssql) |
| Auth | JWT (Passport) + Refresh tokens |
| Push | FCM (best-effort) |
| Email | SMTP opcional |
| Realtime | WebSockets (Socket.IO) + polling fallback |

## Estructura de módulos

```
AppModule
├── AuthModule (login, refresh, logout, JWT strategy)
├── MonitoringModule (devices, sensors, readings, alerts, thresholds)
│   ├── MonitoringService (CRUD principal)
│   ├── SensorMetricsService (métricas, agregaciones, lecturas históricas)
│   ├── AlertMaintenanceService (TTL cleanup, auto-resolve)
│   └── DevToolsService (operaciones destructivas de desarrollo)
├── NotificationsModule (unread, mark-read, push FCM)
├── IntelligenceModule (predicciones ML, eventos ML, decisiones)
├── CrmModule (dashboard CRM, perfiles de dispositivo)
├── RealtimeModule (WebSocket gateway + poller)
├── ProvisioningModule (registro de dispositivos, API keys, sensores)
├── EventsModule (event bus Redis, DLQ, idempotencia)
├── MqttModule (publicación de alertas vía MQTT)
└── AdminUsersModule (CRUD de usuarios)
```

## Principios SOLID aplicados

- **SRP**: Servicios extraídos por dominio (SensorMetricsService, AlertMaintenanceService, DevToolsService) en lugar de un God Class monolítico.
- **OCP**: Nuevos tipos de sensores no requieren modificar MonitoringService — se configuran vía BD.
- **DIP**: Controllers dependen de abstracciones (interfaces de servicios) no de implementaciones concretas.

## Flujo de datos

```
Sensor (firmware)
    → Ingest Service (iot_ingest_services)
    → SQL Server (sensor_readings)
    → SP: sp_insert_reading_and_check_threshold
    → alerts / ml_events / alert_notifications
    → Backend API (este repo)
    → Flutter Dashboard
```

## Decisiones técnicas

- `synchronize: false` en TypeORM — el esquema se gestiona por scripts SQL.
- Endpoint interno `/notifications/internal/trigger-push` usa `INTERNAL_API_KEY` en lugar de JWT para servicio-a-servicio.
- SSOT de notificaciones: `dbo.alert_notifications` evita que la UI deduzca unread desde múltiples tablas.
- `classifyReadingState` en SensorMetricsService es la única fuente de verdad para estados NORMAL/WARNING/ALERT.
