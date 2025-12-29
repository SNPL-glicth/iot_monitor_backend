/*
Patch incremental (sin recrear BD):
- Crea tabla refresh_tokens para rotación/revocación de refresh tokens.

Ejecutar dentro de iot_monitoring_system.
*/

USE iot_monitoring_system;
GO

IF OBJECT_ID('dbo.refresh_tokens', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.refresh_tokens (
    id BIGINT IDENTITY(1,1) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
    expires_at DATETIME2 NOT NULL,
    revoked_at DATETIME2 NULL,
    replaced_by_id BIGINT NULL,
    ip VARCHAR(64) NULL,
    user_agent VARCHAR(512) NULL,

    CONSTRAINT FK_refresh_tokens_users FOREIGN KEY (user_id)
      REFERENCES dbo.users(id) ON DELETE CASCADE,
    CONSTRAINT UQ_refresh_tokens_hash UNIQUE (token_hash)
  );

  CREATE INDEX IX_refresh_tokens_user_id ON dbo.refresh_tokens(user_id);
  CREATE INDEX IX_refresh_tokens_expires_at ON dbo.refresh_tokens(expires_at);
END;
GO
