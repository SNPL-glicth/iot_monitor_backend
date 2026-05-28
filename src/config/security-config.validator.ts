export function isRunningInTestEnvironment(): boolean {
  return process.env.NODE_ENV === 'test';
}

export function assertJwtSecretMeetsMinimumSecurityRequirements(): void {
  const secret = process.env.JWT_SECRET;

  if (jwtSecretIsMissing(secret)) {
    throw new Error(
      'JWT_SECRET no está configurado. ' +
        'Genera uno seguro con: openssl rand -hex 32',
    );
  }

  if (jwtSecretIsTooShortToBeSecure(secret)) {
    throw new Error(
      `JWT_SECRET tiene ${secret.length} caracteres. Mínimo requerido: 32.`,
    );
  }

  if (jwtSecretIsAKnownWeakValue(secret)) {
    throw new Error(
      'JWT_SECRET usa un valor conocido y vulnerable. ' +
        'Genera uno seguro con: openssl rand -hex 32',
    );
  }
}

export function jwtSecretIsMissing(
  secret: string | undefined,
): secret is undefined {
  return !secret || secret.trim().length === 0;
}

export function jwtSecretIsTooShortToBeSecure(secret: string): boolean {
  return secret.length < 32;
}

export function jwtSecretIsAKnownWeakValue(secret: string): boolean {
  const knownWeakSecrets = [
    'secret',
    'password',
    'jwt_secret',
    'changeme',
    'default',
    '1234',
  ];
  return knownWeakSecrets.includes(secret.toLowerCase());
}
