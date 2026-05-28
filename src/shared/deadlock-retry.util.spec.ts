import { isDeadlockError, withDeadlockRetry } from './deadlock-retry.util';

describe('isDeadlockError', () => {
  it('detecta error con code 1205 (número)', () => {
    expect(isDeadlockError({ code: 1205 })).toBe(true);
  });

  it('detecta error con code "1205" (string)', () => {
    expect(isDeadlockError({ code: '1205' })).toBe(true);
  });

  it('detecta error con number 1205', () => {
    expect(isDeadlockError({ number: 1205 })).toBe(true);
  });

  it('detecta error con errno 1205', () => {
    expect(isDeadlockError({ errno: 1205 })).toBe(true);
  });

  it('detecta error por mensaje que contiene "deadlock"', () => {
    expect(
      isDeadlockError({ message: 'Transaction was deadlocked on lock' }),
    ).toBe(true);
  });

  it('no detecta error normal', () => {
    expect(isDeadlockError({ code: 'ECONNREFUSED' })).toBe(false);
  });

  it('no detecta null o primitivos', () => {
    expect(isDeadlockError(null)).toBe(false);
    expect(isDeadlockError('string')).toBe(false);
    expect(isDeadlockError(42)).toBe(false);
  });
});

describe('withDeadlockRetry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retorna inmediatamente si la operación tiene éxito al primer intento', async () => {
    const operation = jest.fn().mockResolvedValue('success');

    const promise = withDeadlockRetry(operation);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('reintenta cuando detecta error de deadlock (código 1205)', async () => {
    const deadlockError = Object.assign(new Error('Deadlock'), { code: 1205 });
    const operation = jest
      .fn()
      .mockRejectedValueOnce(deadlockError)
      .mockResolvedValue('recovered');

    const promise = withDeadlockRetry(operation, 3, 100);
    await jest.runAllTimersAsync();
    const result = await promise;

    expect(result).toBe('recovered');
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('NO reintenta cuando el error NO es deadlock', async () => {
    const normalError = new Error('Connection refused');
    const operation = jest.fn().mockRejectedValue(normalError);

    await expect(withDeadlockRetry(operation)).rejects.toThrow(
      'Connection refused',
    );
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('lanza el error original cuando se agotan los retries', async () => {
    jest.useRealTimers(); // Fake timers causan unhandled rejection con errores persistentes
    const deadlockError = Object.assign(new Error('Deadlock'), { code: 1205 });
    const operation = jest.fn().mockRejectedValue(deadlockError);

    await expect(withDeadlockRetry(operation, 2, 100)).rejects.toThrow(
      'Deadlock',
    );
    expect(operation).toHaveBeenCalledTimes(3); // intento 0 + 2 retries
  });

  it('el delay entre retries aumenta exponencialmente', async () => {
    const deadlockError = Object.assign(new Error('Deadlock'), { code: 1205 });
    const operation = jest
      .fn()
      .mockRejectedValueOnce(deadlockError)
      .mockRejectedValueOnce(deadlockError)
      .mockResolvedValue('recovered');

    const spySetTimeout = jest.spyOn(global, 'setTimeout');

    const promise = withDeadlockRetry(operation, 3, 100);
    await jest.runAllTimersAsync();
    await promise;

    // Verificar que setTimeout fue llamado con delays crecientes
    // (sin verificar jitter exacto, solo que crece exponencialmente)
    const delays = spySetTimeout.mock.calls.map(
      (call) => (call[1] as number) ?? 0,
    );

    // Primer retry: delay >= 100 * 2^0 = 100
    // Segundo retry: delay >= 100 * 2^1 = 200
    expect(delays.length).toBeGreaterThanOrEqual(2);
    expect(delays[0]).toBeGreaterThanOrEqual(100);
    expect(delays[1]).toBeGreaterThanOrEqual(200);

    spySetTimeout.mockRestore();
  });
});
