-- Migración: Agregar campos status y provisioning_code a la tabla sensors
-- Fecha: 2026-01-07
-- Descripción: Soporte para flujo paso a paso de sensores (DRAFT -> PENDING -> ONLINE)

-- Paso 1: Agregar columna status
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'sensors' AND COLUMN_NAME = 'status'
)
BEGIN
    ALTER TABLE sensors
    ADD status VARCHAR(20) NOT NULL DEFAULT 'online';
    PRINT 'Columna status agregada a sensors';
END
ELSE
BEGIN
    PRINT 'Columna status ya existe en sensors';
END
GO

-- Paso 2: Agregar columna provisioning_code
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'sensors' AND COLUMN_NAME = 'provisioning_code'
)
BEGIN
    ALTER TABLE sensors
    ADD provisioning_code VARCHAR(20) NULL;
    PRINT 'Columna provisioning_code agregada a sensors';
END
ELSE
BEGIN
    PRINT 'Columna provisioning_code ya existe en sensors';
END
GO

-- Paso 3: Crear índice único en provisioning_code (solo valores no nulos)
IF NOT EXISTS (
    SELECT * FROM sys.indexes 
    WHERE name = 'IX_sensors_provisioning_code' AND object_id = OBJECT_ID('sensors')
)
BEGIN
    CREATE UNIQUE INDEX IX_sensors_provisioning_code 
    ON sensors(provisioning_code) 
    WHERE provisioning_code IS NOT NULL;
    PRINT 'Índice IX_sensors_provisioning_code creado';
END
ELSE
BEGIN
    PRINT 'Índice IX_sensors_provisioning_code ya existe';
END
GO

-- Verificación
PRINT '=== Verificación de columnas en sensors ===';
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'sensors' AND COLUMN_NAME IN ('status', 'provisioning_code');
GO
