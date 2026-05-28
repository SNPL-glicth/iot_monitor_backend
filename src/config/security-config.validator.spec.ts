import {
  assertJwtSecretMeetsMinimumSecurityRequirements,
  jwtSecretIsMissing,
  jwtSecretIsTooShortToBeSecure,
  jwtSecretIsAKnownWeakValue,
  isRunningInTestEnvironment,
} from './security-config.validator';

describe('assertJwtSecretMeetsMinimumSecurityRequirements', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('throws when JWT_SECRET is not set in environment', () => {
    delete process.env.JWT_SECRET;

    expect(() =>
      assertJwtSecretMeetsMinimumSecurityRequirements(),
    ).toThrow('JWT_SECRET no está configurado');
  });

  it('throws when JWT_SECRET is shorter than 32 characters', () => {
    process.env.JWT_SECRET = 'short_secret';

    expect(() =>
      assertJwtSecretMeetsMinimumSecurityRequirements(),
    ).toThrow('JWT_SECRET tiene 12 caracteres. Mínimo requerido: 32.');
  });

  it('throws when JWT_SECRET equals the string "secret"', () => {
    process.env.JWT_SECRET = 'secret';

    expect(() =>
      assertJwtSecretMeetsMinimumSecurityRequirements(),
    ).toThrow('JWT_SECRET usa un valor conocido y vulnerable');
  });

  it('does not throw when JWT_SECRET is a 64-character hex string', () => {
    process.env.JWT_SECRET =
      'a1b2c3d4e5f6789012345678abcdef00a1b2c3d4e5f6789012345678abcdef00';

    expect(() =>
      assertJwtSecretMeetsMinimumSecurityRequirements(),
    ).not.toThrow();
  });
});

describe('jwtSecretIsMissing', () => {
  it('returns true when secret is undefined', () => {
    expect(jwtSecretIsMissing(undefined)).toBe(true);
  });

  it('returns true when secret is empty string', () => {
    expect(jwtSecretIsMissing('')).toBe(true);
  });

  it('returns true when secret contains only whitespace', () => {
    expect(jwtSecretIsMissing('   ')).toBe(true);
  });

  it('returns false when secret has characters', () => {
    expect(jwtSecretIsMissing('valid')).toBe(false);
  });
});

describe('jwtSecretIsTooShortToBeSecure', () => {
  it('returns true for a 31-character secret', () => {
    expect(jwtSecretIsTooShortToBeSecure('a'.repeat(31))).toBe(true);
  });

  it('returns false for a 32-character secret', () => {
    expect(jwtSecretIsTooShortToBeSecure('a'.repeat(32))).toBe(false);
  });

  it('returns false for a 64-character secret', () => {
    expect(jwtSecretIsTooShortToBeSecure('a'.repeat(64))).toBe(false);
  });
});

describe('jwtSecretIsAKnownWeakValue', () => {
  it('returns true for the string "password"', () => {
    expect(jwtSecretIsAKnownWeakValue('password')).toBe(true);
  });

  it('returns true for the string "JWT_SECRET" (case-insensitive)', () => {
    expect(jwtSecretIsAKnownWeakValue('JWT_SECRET')).toBe(true);
  });

  it('returns false for a strong random hex string', () => {
    expect(
      jwtSecretIsAKnownWeakValue(
        'a1b2c3d4e5f6789012345678abcdef00a1b2c3d4e5f6789012345678abcdef00',
      ),
    ).toBe(false);
  });
});

describe('isRunningInTestEnvironment', () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it('returns true when NODE_ENV is test', () => {
    process.env.NODE_ENV = 'test';
    expect(isRunningInTestEnvironment()).toBe(true);
  });

  it('returns false when NODE_ENV is development', () => {
    process.env.NODE_ENV = 'development';
    expect(isRunningInTestEnvironment()).toBe(false);
  });

  it('returns false when NODE_ENV is production', () => {
    process.env.NODE_ENV = 'production';
    expect(isRunningInTestEnvironment()).toBe(false);
  });
});
