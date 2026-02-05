import { Context, Next } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types/index.js';
import { ValidationError } from '../lib/errors.js';

/**
 * UUID validation schema
 */
export const uuidSchema = z.string().uuid();

/**
 * Integer validation schema
 */
export const integerSchema = z.string().regex(/^\d+$/);

/**
 * Middleware factory to validate route parameters
 * @param paramName - Name of the parameter to validate (e.g., 'id')
 * @param schema - Zod schema to validate against
 */
export function validateParam(paramName: string, schema: z.ZodSchema) {
  return async (c: Context<AppContext>, next: Next) => {
    const paramValue = c.req.param(paramName);
    
    if (!paramValue) {
      throw new ValidationError(`Missing required parameter: ${paramName}`);
    }
    
    const result = schema.safeParse(paramValue);
    
    if (!result.success) {
      throw new ValidationError(
        `Invalid ${paramName} format`,
        { errors: result.error.errors }
      );
    }
    
    await next();
  };
}

/**
 * Convenience middleware for validating UUID parameters
 */
export function validateUuidParam(paramName: string = 'id') {
  return validateParam(paramName, uuidSchema);
}

/**
 * Convenience middleware for validating integer parameters
 */
export function validateIntegerParam(paramName: string = 'id') {
  return validateParam(paramName, integerSchema);
}
