import { DataSource, EntityManager, QueryRunner } from 'typeorm';

/**
 * Transaction Utilities
 * 
 * Provides production-grade transaction helpers with:
 * - Automatic rollback on error
 * - Deadlock retry with exponential backoff
 * - Proper resource cleanup
 * - Type safety
 */

/**
 * Detects SQL Server deadlock errors (error 1205)
 */
export function isDeadlockError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as Record<string, unknown>;
  const code = e.number ?? e.code ?? '';
  const message = String(e.message ?? '').toLowerCase();
  return code === 1205 || code === '1205' || message.includes('deadlock');
}

/**
 * Executes a function with automatic deadlock retry
 * 
 * @param fn Function to execute
 * @param maxRetries Maximum retry attempts (default: 3)
 * @param baseDelayMs Base delay in milliseconds (default: 100)
 * @returns Result of the function
 * @throws Last error if all retries exhausted
 */
export async function withDeadlockRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 100,
): Promise<T> {
  let lastError: unknown;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      
      // Only retry on deadlock
      if (!isDeadlockError(e) || attempt >= maxRetries) {
        throw e;
      }
      
      // Exponential backoff with jitter
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

/**
 * Executes a function within a transaction
 * 
 * CRITICAL: Ensures atomic operations
 * - Auto-rollback on error
 * - Proper cleanup in finally block
 * - Deadlock retry built-in
 * 
 * @param dataSource TypeORM DataSource
 * @param fn Transaction callback receiving EntityManager
 * @param options Transaction options
 * @returns Result of the transaction
 * 
 * @example
 * ```ts
 * const result = await withTransaction(dataSource, async (manager) => {
 *   const user = await manager.save(User, { name: 'John' });
 *   const profile = await manager.save(Profile, { userId: user.id });
 *   return { user, profile };
 * });
 * ```
 */
export async function withTransaction<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
  options: {
    isolationLevel?: 'READ UNCOMMITTED' | 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
    maxRetries?: number;
  } = {},
): Promise<T> {
  const { isolationLevel, maxRetries = 3 } = options;

  return withDeadlockRetry(async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    
    try {
      await queryRunner.startTransaction(isolationLevel);
      const result = await fn(queryRunner.manager);
      await queryRunner.commitTransaction();
      return result;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }, maxRetries);
}

/**
 * Executes a function with pessimistic locking
 * 
 * USE WHEN:
 * - Multiple processes may update same row
 * - Need to prevent lost updates
 * - Read-modify-write pattern
 * 
 * @param dataSource TypeORM DataSource
 * @param fn Transaction callback
 * @returns Result of the transaction
 * 
 * @example
 * ```ts
 * await withPessimisticLock(dataSource, async (manager) => {
 *   const sensor = await manager.findOne(Sensor, {
 *     where: { id: sensorId },
 *     lock: { mode: 'pessimistic_write' }
 *   });
 *   sensor.confirmAttempts += 1;
 *   await manager.save(sensor);
 * });
 * ```
 */
export async function withPessimisticLock<T>(
  dataSource: DataSource,
  fn: (manager: EntityManager) => Promise<T>,
): Promise<T> {
  return withTransaction(dataSource, fn, {
    isolationLevel: 'READ COMMITTED',
    maxRetries: 5, // Higher retries for lock contention
  });
}

/**
 * Atomic upsert helper
 * 
 * Prevents race conditions in insert-or-update scenarios
 * 
 * @param manager EntityManager
 * @param entity Entity class
 * @param uniqueFields Fields that define uniqueness
 * @param data Data to insert or update
 * @returns Saved entity
 * 
 * @example
 * ```ts
 * const sensor = await atomicUpsert(
 *   manager,
 *   Sensor,
 *   { claimToken: dto.token },
 *   { status: 'online', activatedAt: new Date() }
 * );
 * ```
 */
export async function atomicUpsert<T>(
  manager: EntityManager,
  entity: new () => T,
  uniqueFields: Partial<T>,
  data: Partial<T>,
): Promise<T> {
  // Try to find existing
  const existing = await manager.findOne(entity, {
    where: uniqueFields as any,
    lock: { mode: 'pessimistic_write' },
  });

  if (existing) {
    // Update existing
    Object.assign(existing, data);
    return manager.save(existing as any);
  }

  // Insert new
  const newEntity = manager.create(entity, { ...uniqueFields, ...data } as any);
  return manager.save(newEntity as any);
}
