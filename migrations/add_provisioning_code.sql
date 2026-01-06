-- Migración: Agregar campo provisioning_code a la tabla devices
-- Fecha: 2026-01-06
-- Descripción: Soporte para nuevo flujo de provisioning con códigos QR de fábrica

-- Paso 1: Agregar columna provisioning_code (nullable)
IF NOT EXISTS (
    SELECT * FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_NAME = 'devices' AND COLUMN_NAME = 'provisioning_code'
)
BEGIN
    ALTER TABLE devices
    ADD provisioning_code VARCHAR(20) NULL;
    PRINT 'Columna provisioning_code agregada exitosamente';
END
ELSE
BEGIN
    PRINT 'Columna provisioning_code ya existe';
END
GO

-- Paso 2: Crear índice único (en batch separado para que la columna exista)
IF NOT EXISTS (
    SELECT * FROM sys.indexes 
    WHERE name = 'IX_devices_provisioning_code' AND object_id = OBJECT_ID('devices')
)
BEGIN
    CREATE UNIQUE INDEX IX_devices_provisioning_code 
    ON devices(provisioning_code) 
    WHERE provisioning_code IS NOT NULL;
    PRINT 'Índice IX_devices_provisioning_code creado exitosamente';
END
ELSE
BEGIN
    PRINT 'Índice IX_devices_provisioning_code ya existe';
END
GO

-- Verificar que el status permita 'pending_activation'
-- (El campo status es VARCHAR(50), así que ya soporta el nuevo valor)
PRINT 'Nota: El campo status ya soporta pending_activation (VARCHAR 50)';
GO
