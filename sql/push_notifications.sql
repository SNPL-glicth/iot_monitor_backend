USE iot_monitoring_system;
GO

IF OBJECT_ID('push_tokens', 'U') IS NULL
BEGIN
    CREATE TABLE push_tokens (
        id BIGINT PRIMARY KEY IDENTITY(1,1),
        user_id BIGINT NOT NULL,
        fcm_token NVARCHAR(512) NOT NULL,
        platform VARCHAR(20) NOT NULL, -- android / ios / web
        is_active BIT NOT NULL DEFAULT 1,
        created_at DATETIME2 NOT NULL DEFAULT GETDATE(),
        last_seen_at DATETIME2 NULL,

        CONSTRAINT UQ_push_tokens_token UNIQUE (fcm_token),
        CONSTRAINT FK_push_tokens_users FOREIGN KEY (user_id)
            REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IX_push_tokens_user_id ON push_tokens(user_id);
    CREATE INDEX IX_push_tokens_is_active ON push_tokens(is_active);
END;
GO
