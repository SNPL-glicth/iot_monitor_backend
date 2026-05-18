import { ValueTransformer } from 'typeorm';

/**
 * BigIntTransformer
 * 
 * Prevents TypeORM bigint inconsistency where:
 * - DB stores bigint (8 bytes)
 * - TypeORM reads as string (correct)
 * - Application code sometimes treats as number (WRONG)
 * 
 * This transformer ensures ALL bigint columns are ALWAYS strings.
 * 
 * CRITICAL: SQL Server bigint range exceeds JavaScript Number.MAX_SAFE_INTEGER
 * (9,223,372,036,854,775,807 vs 9,007,199,254,740,991)
 */
export class BigIntTransformer implements ValueTransformer {
  /**
   * Transform value FROM database TO entity
   * DB bigint → string
   */
  from(value: any): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    
    // Already string (expected path)
    if (typeof value === 'string') {
      return value;
    }
    
    // Number (should not happen but defensive)
    if (typeof value === 'number') {
      return String(value);
    }
    
    // BigInt (node-mssql may return this)
    if (typeof value === 'bigint') {
      return value.toString();
    }
    
    // Fallback: coerce to string
    return String(value);
  }

  /**
   * Transform value FROM entity TO database
   * string → DB bigint
   */
  to(value: any): string | null {
    if (value === null || value === undefined) {
      return null;
    }
    
    // String (expected path)
    if (typeof value === 'string') {
      // Validate it's numeric
      if (!/^-?\d+$/.test(value)) {
        throw new Error(`Invalid bigint value: ${value}. Must be numeric string.`);
      }
      return value;
    }
    
    // Number (accept but warn - caller should use string)
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) {
        throw new Error(`Unsafe integer: ${value}. Use string for bigint values.`);
      }
      return String(value);
    }
    
    throw new Error(`Invalid bigint type: ${typeof value}. Expected string or number.`);
  }
}

/**
 * Singleton instance for reuse across all entities
 */
export const bigIntTransformer = new BigIntTransformer();
