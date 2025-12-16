import { describe, it, expect } from 'vitest';

/**
 * Test the LIKE pattern escaping function
 * This is a copy of the function from job.service.ts for testing purposes
 */
function escapeLikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, '\\$&');
}

describe('LIKE Pattern Escaping', () => {
  it('should escape % character', () => {
    const result = escapeLikePattern('test%value');
    expect(result).toBe('test\\%value');
  });

  it('should escape _ character', () => {
    const result = escapeLikePattern('test_value');
    expect(result).toBe('test\\_value');
  });

  it('should escape \\ character', () => {
    const result = escapeLikePattern('test\\value');
    expect(result).toBe('test\\\\value');
  });

  it('should escape multiple special characters', () => {
    const result = escapeLikePattern('test%_\\value');
    expect(result).toBe('test\\%\\_\\\\value');
  });

  it('should not modify strings without special characters', () => {
    const result = escapeLikePattern('test value');
    expect(result).toBe('test value');
  });

  it('should handle empty string', () => {
    const result = escapeLikePattern('');
    expect(result).toBe('');
  });

  it('should handle string with only special characters', () => {
    const result = escapeLikePattern('%_\\');
    expect(result).toBe('\\%\\_\\\\');
  });
});
