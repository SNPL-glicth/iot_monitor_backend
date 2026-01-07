-- ══════════════════════════════════════════════════════════════════════════
-- Migración: Flujo de activación con control total
-- Fecha: 2026-01-07
-- Descripción: Campos para DRAFT → PENDING_CLAIM → PENDING_CONFIRMATION → ONLINE
-- ══════════════════════════════════════════════════════════════════════════

-- Actualizar columna status para soportar nuevos estados
ALTER TABLE sensors ALTER COLUMN status VARCHAR(25) NOT NULL;
GO

-- ══════════════════════════════════════════════════════════════════════════
-- CAMPOS PARA FLUJO DE CLAIM
-- ══════════════════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'claim_token')
BEGIN
    ALTER TABLE sensors ADD claim_token VARCHAR(64) NULL;
    PRINT 'Columna claim_token agregada';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'claim_token_expires')
BEGIN
    ALTER TABLE sensors ADD claim_token_expires DATETIME2 NULL;
    PRINT 'Columna claim_token_expires agregada';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'reserved_by_user_id')
BEGIN
    ALTER TABLE sensors ADD reserved_by_user_id BIGINT NULL;
    PRINT 'Columna reserved_by_user_id agregada';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'reserved_at')
BEGIN
    ALTER TABLE sensors ADD reserved_at DATETIME2 NULL;
    PRINT 'Columna reserved_at agregada';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'require_qr_confirmation')
BEGIN
    ALTER TABLE sensors ADD require_qr_confirmation BIT NOT NULL DEFAULT 0;
    PRINT 'Columna require_qr_confirmation agregada';
END
GO

-- ══════════════════════════════════════════════════════════════════════════
-- CAMPOS DE IDENTIDAD DEL SENSOR (generados en confirm)
-- ══════════════════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'api_key_hash')
BEGIN
    ALTER TABLE sensors ADD api_key_hash VARCHAR(128) NULL;
    PRINT 'Columna api_key_hash agregada';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'api_key_prefix')
BEGIN
    ALTER TABLE sensors ADD api_key_prefix VARCHAR(12) NULL;
    PRINT 'Columna api_key_prefix agregada';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'activated_at')
BEGIN
    ALTER TABLE sensors ADD activated_at DATETIME2 NULL;
    PRINT 'Columna activated_at agregada';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'activated_by_user_id')
BEGIN
    ALTER TABLE sensors ADD activated_by_user_id BIGINT NULL;
    PRINT 'Columna activated_by_user_id agregada';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'activated_from_ip')
BEGIN
    ALTER TABLE sensors ADD activated_from_ip VARCHAR(45) NULL;
    PRINT 'Columna activated_from_ip agregada';
END
GO

-- ══════════════════════════════════════════════════════════════════════════
-- CAMPOS DE RATE LIMITING
-- ══════════════════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'confirm_attempts')
BEGIN
    ALTER TABLE sensors ADD confirm_attempts INT NOT NULL DEFAULT 0;
    PRINT 'Columna confirm_attempts agregada';
END
GO

IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('sensors') AND name = 'last_confirm_attempt')
BEGIN
    ALTER TABLE sensors ADD last_confirm_attempt DATETIME2 NULL;
    PRINT 'Columna last_confirm_attempt agregada';
END
GO

-- ══════════════════════════════════════════════════════════════════════════
-- ÍNDICES
-- ══════════════════════════════════════════════════════════════════════════

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_sensors_claim_token' AND object_id = OBJECT_ID('sensors'))
BEGIN
    CREATE UNIQUE INDEX UQ_sensors_claim_token ON sensors(claim_token) WHERE claim_token IS NOT NULL;
    PRINT 'Índice UQ_sensors_claim_token creado';
END
GO

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_sensors_api_key_prefix' AND object_id = OBJECT_ID('sensors'))
BEGIN
    CREATE INDEX IX_sensors_api_key_prefix ON sensors(api_key_prefix) WHERE api_key_prefix IS NOT NULL;
    PRINT 'Índice IX_sensors_api_key_prefix creado';
END
GO

-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN DE DATOS
-- ══════════════════════════════════════════════════════════════════════════

-- Cambiar 'pending_activation' a 'pending_claim'
UPDATE sensors SET status = 'pending_claim' WHERE status = 'pending_activation';
GO

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ══════════════════════════════════════════════════════════════════════════

PRINT '=== Verificación de columnas de sensors ===';
SELECT 
    c.COLUMN_NAME, 
    c.DATA_TYPE, 
    c.IS_NULLABLE,
    c.CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_NAME = 'sensors'
ORDER BY c.ORDINAL_POSITION;
GO
