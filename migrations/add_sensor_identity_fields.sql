-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Agregar campos de identidad y rate limiting a sensors
-- Fecha: 2026-01-07
-- Base de datos: SQL Server
-- ══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- CAMPOS DE CLAIM TOKEN
-- ═══════════════════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'claim_token')
BEGIN
    ALTER TABLE dbo.sensors ADD claim_token VARCHAR(64) NULL;
    PRINT '✅ Columna claim_token agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'claim_token_expires')
BEGIN
    ALTER TABLE dbo.sensors ADD claim_token_expires DATETIME2 NULL;
    PRINT '✅ Columna claim_token_expires agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'reserved_by_user_id')
BEGIN
    ALTER TABLE dbo.sensors ADD reserved_by_user_id BIGINT NULL;
    PRINT '✅ Columna reserved_by_user_id agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'reserved_at')
BEGIN
    ALTER TABLE dbo.sensors ADD reserved_at DATETIME2 NULL;
    PRINT '✅ Columna reserved_at agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'require_qr_confirmation')
BEGIN
    ALTER TABLE dbo.sensors ADD require_qr_confirmation BIT NOT NULL DEFAULT 0;
    PRINT '✅ Columna require_qr_confirmation agregada';
END
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- CAMPOS DE IDENTIDAD DEL SENSOR
-- ═══════════════════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'api_key_hash')
BEGIN
    ALTER TABLE dbo.sensors ADD api_key_hash VARCHAR(128) NULL;
    PRINT '✅ Columna api_key_hash agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'api_key_prefix')
BEGIN
    ALTER TABLE dbo.sensors ADD api_key_prefix VARCHAR(12) NULL;
    PRINT '✅ Columna api_key_prefix agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'activated_at')
BEGIN
    ALTER TABLE dbo.sensors ADD activated_at DATETIME2 NULL;
    PRINT '✅ Columna activated_at agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'activated_by_user_id')
BEGIN
    ALTER TABLE dbo.sensors ADD activated_by_user_id BIGINT NULL;
    PRINT '✅ Columna activated_by_user_id agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'activated_from_ip')
BEGIN
    ALTER TABLE dbo.sensors ADD activated_from_ip VARCHAR(45) NULL;
    PRINT '✅ Columna activated_from_ip agregada';
END
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- CAMPOS DE RATE LIMITING
-- ═══════════════════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'confirm_attempts')
BEGIN
    ALTER TABLE dbo.sensors ADD confirm_attempts INT NOT NULL DEFAULT 0;
    PRINT '✅ Columna confirm_attempts agregada';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.sensors') AND name = 'last_confirm_attempt')
BEGIN
    ALTER TABLE dbo.sensors ADD last_confirm_attempt DATETIME2 NULL;
    PRINT '✅ Columna last_confirm_attempt agregada';
END
GO

-- ═══════════════════════════════════════════════════════════════════════════
-- ÍNDICE ÚNICO PARA CLAIM TOKEN
-- ═══════════════════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UQ_sensors_claim_token' AND object_id = OBJECT_ID('dbo.sensors'))
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UQ_sensors_claim_token 
    ON dbo.sensors (claim_token) 
    WHERE claim_token IS NOT NULL;
    PRINT '✅ Índice único UQ_sensors_claim_token creado';
END
GO

PRINT '';
PRINT '══════════════════════════════════════════════════════════════════════════';
PRINT '✅ MIGRACIÓN COMPLETADA: Campos de identidad y rate limiting agregados';
PRINT '══════════════════════════════════════════════════════════════════════════';
