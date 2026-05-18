# Changelog

All notable changes to this project will be documented in this file.

Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Security
- Added `.env.example` with placeholder values and documentation.
- Sanitized `jwt-secret.ts` — removed console warnings that exposed secret length and source.
- Restricted CORS in production to require `Origin` header (blocks curl/postman without explicit origin).
- Added `ValidationPipe` globally with `whitelist: true` to reject unexpected properties.
- Created typed DTOs (`UpdateThresholdProfileDto`, `CreateSensorThresholdDto`, `UpdateThresholdDto`) replacing `body: any` in monitoring endpoints.

### Refactored (SOLID)
- Extracted `SensorMetricsService` from `MonitoringService` (SRP) — handles raw readings, aggregations, historical queries.
- Extracted `AlertMaintenanceService` from `MonitoringService` (SRP) — handles TTL cleanup and auto-resolve stored procedures.
- Extracted `DevToolsService` from `MonitoringService` (SRP) — handles destructive dev/testing operations.
- `MonitoringController` now injects and delegates to the three new services.
- Extracted `CrmDashboardService`, `CrmAlertService`, `CrmDeviceService` from `CrmService` (SRP).
- `CrmService` converted to facade delegating to CRM sub-services.
- Extracted `DeviceProvisioningService` and `SensorProvisioningService` from `ProvisioningService` (SRP).
- Extracted `IntelligencePredictionService` and `IntelligenceDecisionService` from `IntelligenceService` (SRP).
- `CrmBaseService` created with shared utilities (cache, deadlock retry, helpers) to avoid duplication.
- Extracted `SensorThresholdService`, `SensorQueryService`, `SensorDiagnosticService` from `MonitoringService` (SRP).
- Extracted `NotificationPushService` and `NotificationQueryService` from `NotificationsService` (SRP).
- Extracted `EventPublisherService`, `EventConsumerService`, `DlqManagerService` from `RedisEventBus` (SRP).
- Extracted `MlPipelineTrainingService`, `MlPipelineInferenceService`, `MlPipelineDiagnosticsService` from `MlPipelineService` (SRP).
- Extracted `AuthTokenService` and `AuthUserService` from `AuthService` (SRP).
- Extracted `MqttPublisherService` and `MqttSubscriptionService` from `MqttService` (SRP).

### Documentation
- Added `docs/ARCHITECTURE.md` with module diagram and design decisions.
- Added `docs/CONTRIBUTING.md` with coding standards and PR checklist.
- Added `docs/SECURITY.md` with vulnerability reporting policy.

## [Previous releases]

See git history for earlier changes.
