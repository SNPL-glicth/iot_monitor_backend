-- ══════════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Agregar campos de rate limiting a devices
-- Fecha: 2026-01-07
-- Fase: 2 - Limpieza y seguridad
-- ══════════════════════════════════════════════════════════════════════════

-- Agregar campo activation_attempts (contador de intentos de activación)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.devices') AND name = 'activation_attempts'
)
BEGIN
    ALTER TABLE dbo.devices 
    ADD activation_attempts INT NOT NULL DEFAULT 0;
    PRINT 'Columna activation_attempts agregada a devices';
END
GO

-- Agregar campo last_activation_attempt (timestamp del último intento)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.devices') AND name = 'last_activation_attempt'
)
BEGIN
    ALTER TABLE dbo.devices 
    ADD last_activation_attempt DATETIME2 NULL;
    PRINT 'Columna last_activation_attempt agregada a devices';
END
GO

-- Agregar campo activated_from_ip (IP desde donde se activó)
IF NOT EXISTS (
    SELECT 1 FROM sys.columns 
    WHERE object_id = OBJECT_ID('dbo.devices') AND name = 'activated_from_ip'
)
BEGIN
    ALTER TABLE dbo.devices 
    ADD activated_from_ip VARCHAR(45) NULL;
    PRINT 'Columna activated_from_ip agregada a devices';
END
GO

PRINT '✅ Migración completada: campos de rate limiting agregados a devices';
