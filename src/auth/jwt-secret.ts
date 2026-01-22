const MIN_SECRET_LENGTH = 32;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  
  // SECURITY FIX: Validate secret exists and has minimum entropy
  if (secret && secret.trim().length >= MIN_SECRET_LENGTH) {
    return secret;
  }

  // In production we fail fast - no fallbacks allowed
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`JWT_SECRET must be set and at least ${MIN_SECRET_LENGTH} characters in production`);
  }

  // Dev mode: warn loudly but allow startup for local development
  if (!secret || secret.trim().length === 0) {
    console.warn('\x1b[33m[SECURITY WARNING] JWT_SECRET not set - using insecure dev fallback. DO NOT USE IN PRODUCTION!\x1b[0m');
    return 'dev_secret_change_me_at_least_32_chars';
  }

  // Secret too short
  console.warn(`\x1b[33m[SECURITY WARNING] JWT_SECRET is only ${secret.trim().length} chars (min: ${MIN_SECRET_LENGTH}). Using anyway in dev mode.\x1b[0m`);
  return secret;
}
