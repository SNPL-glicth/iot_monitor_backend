# Security Policy

## Supported Versions

| Version | Supported |
|---------|-----------|
| main / master | ✅ Yes |
| Older branches | ❌ No |

## Reporting a Vulnerability

If you discover a security vulnerability, please follow responsible disclosure:

1. **Do NOT** open a public issue.
2. Email details to the project security contact (configure in your org).
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

## Security Measures in Place

### Authentication
- JWT access tokens with configurable TTL (default 15 min).
- Refresh tokens with rotation (each use issues a new token and revokes the old one).
- Tokens stored in HttpOnly cookies for web clients; Bearer tokens for mobile/scripts.

### Authorization
- Role-based access control: `admin`, `operator`, `viewer`.
- Admin-only endpoints for destructive operations.

### Rate Limiting
- Login: max 5 attempts per IP in 15 min, 10 per username in 1 hour.
- In-memory store (MVP). For production with multiple instances, migrate to Redis.

### Input Validation
- Global `ValidationPipe` with `whitelist: true` strips unexpected properties.
- All `@Body()` endpoints use typed DTOs with `class-validator` decorators.

### Secrets Management
- `JWT_SECRET` and `REFRESH_TOKEN_SECRET` validated at startup (min 32 chars).
- Production fails fast if secrets are missing.
- `.env` is in `.gitignore` and never committed.

### CORS
- In production, requests without `Origin` header are blocked.
- Allowed origins configurable via `CORS_ORIGINS` environment variable.

### SQL Injection
- All DB queries use TypeORM parameterized queries or stored procedures.
- No string concatenation in SQL queries.

## Dev-Tools Endpoints

- Destructive endpoints (`DELETE /monitoring/dev-tools/*`) require `admin` role.
- All actions are logged with user ID for audit trails.
- Consider disabling or removing these endpoints in production builds.

## Dependency Scanning

Run periodically:

```bash
npm audit
```

Address high/critical vulnerabilities promptly.
