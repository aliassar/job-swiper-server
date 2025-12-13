import { describe, it, expect } from 'vitest';
import { formatResponse, generateRequestId, parseIntSafe, parseBoolSafe } from '../lib/utils';

describe('Utils', () => {
  describe('formatResponse', () => {
    it('should format success response correctly', () => {
      const result = formatResponse(true, { test: 'data' }, null, 'req_123');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ test: 'data' });
      expect(result.meta.requestId).toBe('req_123');
      expect(result.meta.timestamp).toBeDefined();
    });

    it('should format error response correctly', () => {
      const result = formatResponse(false, null, { code: 'ERROR', message: 'Test error' }, 'req_456');
      expect(result.success).toBe(false);
      expect(result.error).toEqual({ code: 'ERROR', message: 'Test error' });
      expect(result.meta.requestId).toBe('req_456');
    });
  });

  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^req_/);
    });
  });

  describe('parseIntSafe', () => {
    it('should parse valid integers', () => {
      expect(parseIntSafe('123', 0)).toBe(123);
    });

    it('should return default for invalid input', () => {
      expect(parseIntSafe('abc', 10)).toBe(10);
      expect(parseIntSafe(undefined, 5)).toBe(5);
    });
  });

  describe('parseBoolSafe', () => {
    it('should parse valid booleans', () => {
      expect(parseBoolSafe('true', false)).toBe(true);
      expect(parseBoolSafe('false', true)).toBe(false);
    });

    it('should return default for invalid input', () => {
      expect(parseBoolSafe('invalid', true)).toBe(true);
      expect(parseBoolSafe(undefined, false)).toBe(false);
    });
  });
});
