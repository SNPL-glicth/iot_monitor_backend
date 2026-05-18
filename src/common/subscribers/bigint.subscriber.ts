import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  LoadEvent,
  UpdateEvent,
} from 'typeorm';

/**
 * BigIntSubscriber
 * 
 * Global subscriber that ensures ALL bigint columns are ALWAYS strings.
 * 
 * WHY NEEDED:
 * - SQL Server bigint exceeds JavaScript Number.MAX_SAFE_INTEGER
 * - TypeORM inconsistently returns bigint as string vs number
 * - Application code breaks when bigint > 2^53-1
 * 
 * WHAT IT DOES:
 * - Intercepts ALL entity loads from DB
 * - Converts any bigint column to string
 * - Prevents Number coercion bugs
 * 
 * CRITICAL: This runs BEFORE entities reach application code.
 */
@EventSubscriber()
export class BigIntSubscriber implements EntitySubscriberInterface {
  /**
   * After entity loaded from database
   * Convert all bigint values to strings
   */
  afterLoad(entity: any, event?: LoadEvent<any>): void {
    if (!entity || !event?.metadata) {
      return;
    }

    // Get all bigint columns from entity metadata
    const bigintColumns = event.metadata.columns.filter(
      (col) => col.type === 'bigint'
    );

    // Convert each bigint column value to string
    for (const column of bigintColumns) {
      const propertyName = column.propertyName;
      const value = entity[propertyName];

      if (value !== null && value !== undefined) {
        // Force to string if not already
        if (typeof value !== 'string') {
          entity[propertyName] = String(value);
        }
      }
    }
  }

  /**
   * Before insert - ensure bigint values are valid
   */
  beforeInsert(event: InsertEvent<any>): void {
    this.validateBigIntValues(event.entity, event.metadata);
  }

  /**
   * Before update - ensure bigint values are valid
   */
  beforeUpdate(event: UpdateEvent<any>): void {
    if (event.entity) {
      this.validateBigIntValues(event.entity, event.metadata);
    }
  }

  /**
   * Validate that bigint values are safe
   * Throws if unsafe number detected
   */
  private validateBigIntValues(entity: any, metadata: any): void {
    if (!entity || !metadata) {
      return;
    }

    const bigintColumns = metadata.columns.filter(
      (col: any) => col.type === 'bigint'
    );

    for (const column of bigintColumns) {
      const propertyName = column.propertyName;
      const value = entity[propertyName];

      if (value === null || value === undefined) {
        continue;
      }

      // String is safe
      if (typeof value === 'string') {
        // Validate it's numeric
        if (!/^-?\d+$/.test(value)) {
          throw new Error(
            `Invalid bigint value for ${metadata.name}.${propertyName}: "${value}". Must be numeric string.`
          );
        }
        continue;
      }

      // Number must be safe integer
      if (typeof value === 'number') {
        if (!Number.isSafeInteger(value)) {
          throw new Error(
            `Unsafe integer for ${metadata.name}.${propertyName}: ${value}. ` +
            `Exceeds Number.MAX_SAFE_INTEGER (${Number.MAX_SAFE_INTEGER}). ` +
            `Use string instead.`
          );
        }
        // Convert to string
        entity[propertyName] = String(value);
        continue;
      }

      // BigInt type
      if (typeof value === 'bigint') {
        entity[propertyName] = value.toString();
        continue;
      }

      throw new Error(
        `Invalid type for bigint column ${metadata.name}.${propertyName}: ${typeof value}`
      );
    }
  }
}
