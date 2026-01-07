-- Migración: Crear tabla sensor_claim_codes para flujo alternativo sin QR
-- Fecha: 2026-01-07
-- Descripción: Códigos temporales para activar sensores (1 uso, expiran)

-- Crear tabla sensor_claim_codes
IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'sensor_claim_codes')
BEGIN
    CREATE TABLE sensor_claim_codes (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        sensor_id BIGINT NOT NULL,
        claim_code VARCHAR(32) NOT NULL,
        expires_at DATETIME2 NOT NULL,
        used_at DATETIME2 NULL,
        used_by_ip VARCHAR(45) NULL,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        created_by_user_id BIGINT NULL,
        
        CONSTRAINT FK_sensor_claim_codes_sensor 
            FOREIGN KEY (sensor_id) REFERENCES sensors(id),
        CONSTRAINT UQ_sensor_claim_codes_code 
            UNIQUE (claim_code)
    );
    
    -- Índices para búsquedas rápidas
    CREATE INDEX IX_sensor_claim_codes_sensor_id 
        ON sensor_claim_codes(sensor_id);
    CREATE INDEX IX_sensor_claim_codes_expires_at 
        ON sensor_claim_codes(expires_at) 
        WHERE used_at IS NULL;
    
    PRINT 'Tabla sensor_claim_codes creada exitosamente';
END
ELSE
BEGIN
    PRINT 'Tabla sensor_claim_codes ya existe';
END
GO

-- Verificación
PRINT '=== Verificación de tabla sensor_claim_codes ===';
SELECT 
    c.COLUMN_NAME, 
    c.DATA_TYPE, 
    c.IS_NULLABLE,
    c.CHARACTER_MAXIMUM_LENGTH
FROM INFORMATION_SCHEMA.COLUMNS c
WHERE c.TABLE_NAME = 'sensor_claim_codes'
ORDER BY c.ORDINAL_POSITION;
GO
