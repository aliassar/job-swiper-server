import { describe, it, expect, beforeEach, vi } from 'vitest';
import { timerHandlers } from '../services/timer-handlers.service.js';
import { db } from '../lib/db.js';
import { workflowService } from '../services/workflow.service.js';

// Mock the database module
vi.mock('../lib/db', () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock workflow service
vi.mock('../services/workflow.service', () => ({
  workflowService: {
    getWorkflowByApplication: vi.fn(),
    processWorkflow: vi.fn(),
  },
}));

// Mock logger
vi.mock('../middleware/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('Timer Handlers - Stage Updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCvVerificationTimeout (deprecated)', () => {
    it('should be a no-op and not update any database records', async () => {
      const mockTimer = {
        id: 'timer-1',
        userId: 'user-1',
        type: 'cv_verification',
        targetId: 'app-1',
        executeAt: new Date(),
        metadata: { applicationId: 'app-1' },
      };

      await timerHandlers.handleCvVerificationTimeout(mockTimer);

      // Verify no database operations were performed
      expect(db.select).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
      expect(workflowService.processWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('handleMessageVerificationTimeout (deprecated)', () => {
    it('should be a no-op and not update any database records', async () => {
      const mockTimer = {
        id: 'timer-1',
        userId: 'user-1',
        type: 'message_verification',
        targetId: 'app-1',
        executeAt: new Date(),
        metadata: { applicationId: 'app-1' },
      };

      await timerHandlers.handleMessageVerificationTimeout(mockTimer);

      // Verify no database operations were performed
      expect(db.select).not.toHaveBeenCalled();
      expect(db.update).not.toHaveBeenCalled();
      expect(workflowService.processWorkflow).not.toHaveBeenCalled();
    });
  });
});
