-- Migration: Add deleted_at column to devices table
-- Created: 2026-05-02
-- Reason: TypeORM Device entity references deleted_at but column does not exist in DB

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID(N'devices')
      AND name = 'deleted_at'
)
BEGIN
    ALTER TABLE devices
    ADD deleted_at DATETIME2 NULL;

    PRINT 'Column deleted_at added to devices.';
END
ELSE
BEGIN
    PRINT 'Column deleted_at already exists on devices.';
END
GO
