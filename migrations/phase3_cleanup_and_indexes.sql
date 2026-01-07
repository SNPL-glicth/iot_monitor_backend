-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN FASE 3: Limpieza y optimización
-- Fecha: 2026-01-07
-- Base de datos: SQL Server
-- ══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 1: Eliminar tabla obsoleta sensor_claim_codes
-- ═══════════════════════════════════════════════════════════════════════════
IF OBJECT_ID('dbo.sensor_claim_codes', 'U') IS NOT NULL
BEGIN
    DROP TABLE dbo.sensor_claim_codes;
    PRINT '✅ Tabla sensor_claim_codes eliminada';
END
ELSE
BEGIN
    PRINT '⏭️ Tabla sensor_claim_codes no existe, saltando...';
END
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 2: Índices para optimización de consultas
-- ═══════════════════════════════════════════════════════════════════════════

-- Índice para búsqueda de sensores por claim_token (usado en confirmSensor)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sensors_claim_token' AND object_id = OBJECT_ID('dbo.sensors'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_sensors_claim_token 
    ON dbo.sensors (claim_token) 
    WHERE claim_token IS NOT NULL;
    PRINT '✅ Índice IX_sensors_claim_token creado';
END
GO

-- Índice para búsqueda de sensores por estado (usado en getClaimableSensors)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sensors_status' AND object_id = OBJECT_ID('dbo.sensors'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_sensors_status 
    ON dbo.sensors (status)
    INCLUDE (sensor_uuid, sensor_type, unit, device_id);
    PRINT '✅ Índice IX_sensors_status creado';
END
GO

-- Índice para expiración de tokens (limpieza automática)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sensors_claim_token_expires' AND object_id = OBJECT_ID('dbo.sensors'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_sensors_claim_token_expires 
    ON dbo.sensors (claim_token_expires) 
    WHERE claim_token_expires IS NOT NULL;
    PRINT '✅ Índice IX_sensors_claim_token_expires creado';
END
GO

-- Índice para búsqueda de dispositivos por provisioning_code (usado en activateDevice)
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_devices_provisioning_code' AND object_id = OBJECT_ID('dbo.devices'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_devices_provisioning_code 
    ON dbo.devices (provisioning_code) 
    WHERE provisioning_code IS NOT NULL;
    PRINT '✅ Índice IX_devices_provisioning_code creado';
END
GO

-- Índice para búsqueda de dispositivos por estado
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_devices_status' AND object_id = OBJECT_ID('dbo.devices'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_devices_status 
    ON dbo.devices (status)
    INCLUDE (device_uuid, name, device_type);
    PRINT '✅ Índice IX_devices_status creado';
END
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 3: Índices para lecturas de sensores (rendimiento de gráficas)
-- ═══════════════════════════════════════════════════════════════════════════

-- Índice compuesto para queries de series temporales
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_sensor_readings_sensor_timestamp' AND object_id = OBJECT_ID('dbo.sensor_readings'))
BEGIN
    CREATE NONCLUSTERED INDEX IX_sensor_readings_sensor_timestamp 
    ON dbo.sensor_readings (sensor_id, [timestamp] DESC)
    INCLUDE ([value]);
    PRINT '✅ Índice IX_sensor_readings_sensor_timestamp creado';
END
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- PASO 4: Estadísticas actualizadas
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE STATISTICS dbo.sensors;
UPDATE STATISTICS dbo.devices;
PRINT '✅ Estadísticas actualizadas';
GO

PRINT '';
PRINT '══════════════════════════════════════════════════════════════════════════';
PRINT '✅ MIGRACIÓN FASE 3 COMPLETADA';
PRINT '══════════════════════════════════════════════════════════════════════════';
