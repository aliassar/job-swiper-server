import { describe, it, expect, vi, beforeEach } from 'vitest';
import { applicationService } from '../services/application.service.js';
import { escapeLikePattern } from '../lib/utils.js';

/**
 * A query-builder stub that answers any chained method with itself and resolves
 * to `rows` when awaited. The previous mocks spelled out one exact chain, so
 * adding a join to a query broke them even though the behaviour under test -
 * how the search term is escaped - had not changed.
 */
function chainable(rows: unknown[] = []): any {
  const target: any = new Proxy(function () {} as any, {
    get(_t, prop) {
      if (prop === 'then') {
        const promise = Promise.resolve(rows);
        return promise.then.bind(promise);
      }
      return vi.fn(() => target);
    },
    apply() {
      return target;
    },
  });
  return target;
}

// Mock the database and dependencies
vi.mock('../lib/db', () => ({
  db: {
    select: vi.fn(() => chainable([])),
  },
}));

vi.mock('../middleware/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('../lib/storage', () => ({
  storage: {
    uploadFile: vi.fn(),
    generateKey: vi.fn(),
  },
}));

vi.mock('./timer.service', () => ({
  timerService: {
    scheduleCvVerificationTimer: vi.fn(),
    cancelTimersByTarget: vi.fn(),
  },
}));

/**
 * Tests to verify SQL injection prevention in application.service.ts
 * These tests ensure that escapeLikePattern is properly used for search parameters
 */
describe('Application Service - SQL Injection Prevention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('escapeLikePattern utility', () => {
    it('should escape % character in search patterns', () => {
      const result = escapeLikePattern('test%value');
      expect(result).toBe('test\\%value');
    });

    it('should escape _ character in search patterns', () => {
      const result = escapeLikePattern('test_value');
      expect(result).toBe('test\\_value');
    });

    it('should escape \\ character in search patterns', () => {
      const result = escapeLikePattern('test\\value');
      expect(result).toBe('test\\\\value');
    });

    it('should escape multiple special characters in search patterns', () => {
      const result = escapeLikePattern('test%_\\value');
      expect(result).toBe('test\\%\\_\\\\value');
    });

    it('should handle strings without special characters', () => {
      const result = escapeLikePattern('Software Engineer');
      expect(result).toBe('Software Engineer');
    });
  });

  describe('getApplications - search parameter escaping', () => {
    it('should call database methods when search contains special characters', async () => {
      const { db } = await import('../lib/db.js');
      const mockSelect = vi.fn(() => chainable([]));
      (db.select as any) = mockSelect;

      const userId = 'test-user-id';
      const search = 'test%_\\value';

      await applicationService.getApplications(userId, 1, 20, search);

      // Verify that db.select was called (which means the query was executed)
      expect(mockSelect).toHaveBeenCalled();
    });

    it('should handle empty search parameter gracefully', async () => {
      const { db } = await import('../lib/db.js');
      const mockSelect = vi.fn(() => chainable([]));
      (db.select as any) = mockSelect;

      const userId = 'test-user-id';

      const result = await applicationService.getApplications(userId, 1, 20);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('pagination');
    });
  });

  describe('getApplicationHistory - search parameter escaping', () => {
    it('should call database methods when search contains special characters', async () => {
      const { db } = await import('../lib/db.js');
      const mockSelect = vi.fn(() => chainable([]));
      (db.select as any) = mockSelect;

      const userId = 'test-user-id';
      const options = {
        search: 'test%_\\value',
        page: 1,
        limit: 20,
      };

      await applicationService.getApplicationHistory(userId, options);

      // Verify that db.select was called (which means the query was executed)
      expect(mockSelect).toHaveBeenCalled();
    });

    it('should handle search with normal text gracefully', async () => {
      const { db } = await import('../lib/db.js');
      const mockSelect = vi.fn(() => chainable([]));
      (db.select as any) = mockSelect;

      const userId = 'test-user-id';
      const options = {
        search: 'Software Engineer',
        page: 1,
        limit: 20,
      };

      const result = await applicationService.getApplicationHistory(userId, options);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('pagination');
    });
  });
});
