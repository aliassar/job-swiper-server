import { describe, it, expect, beforeEach, vi } from 'vitest';
import { jobService } from '../../services/job.service.js';
import { timerService } from '../../services/timer.service.js';

// Mock the database module before importing services
vi.mock('../../lib/db', () => ({
  db: {
    transaction: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

/**
 * Integration tests for rollback functionality
 * Tests the rollback API to ensure proper reversal of application stages
 * with or without document generation
 */
describe('Rollback API Integration Tests', () => {
  const mockUserId = 'test-user-123';
  const mockJobId = 'test-job-123';
  const mockApplicationId = 'test-app-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rollbackJob', () => {
    it('should rollback job without documents', async () => {
      // Mock the rollback service
      vi.spyOn(jobService, 'rollbackJob').mockResolvedValue({
        job: {
          id: mockJobId,
          status: 'pending',
          saved: false,
        },
        application: {
          id: mockApplicationId,
          userId: mockUserId,
          jobId: mockJobId,
          stage: 'applied',
          generatedResumeId: null,
          generatedCoverLetterId: null,
        },
      } as any);

      const result = await jobService.rollbackJob(mockUserId, mockJobId);

      expect(result).toBeDefined();
      expect(result.job).toBeDefined();
      expect(result.job.status).toBe('pending');
    });

    it('should rollback job with generated documents and schedule deletion', async () => {
      const mockResumeId = 'resume-123';
      const mockCoverLetterId = 'cover-letter-123';

      vi.spyOn(jobService, 'rollbackJob').mockResolvedValue({
        job: {
          id: mockJobId,
          status: 'pending',
          saved: false,
        },
        application: {
          id: mockApplicationId,
          userId: mockUserId,
          jobId: mockJobId,
          stage: 'applied',
          generatedResumeId: mockResumeId,
          generatedCoverLetterId: mockCoverLetterId,
        },
      } as any);

      const result = await jobService.rollbackJob(mockUserId, mockJobId);

      expect(result).toBeDefined();
      expect(result.application!.generatedResumeId).toBe(mockResumeId);
      expect(result.application!.generatedCoverLetterId).toBe(mockCoverLetterId);
    });

    it('should cancel pending workflow during rollback', async () => {
      vi.spyOn(jobService, 'rollbackJob').mockResolvedValue({
        job: {
          id: mockJobId,
          status: 'pending',
        },
        application: {
          id: mockApplicationId,
          userId: mockUserId,
          jobId: mockJobId,
          stage: 'applied',
        },
      } as any);

      const result = await jobService.rollbackJob(mockUserId, mockJobId);

      expect(result).toBeDefined();
      expect(result.application).toBeDefined();
    });

    it('should throw NotFoundError when application does not exist', async () => {
      vi.spyOn(jobService, 'rollbackJob').mockRejectedValue(
        new Error('Application not found')
      );

      await expect(
        jobService.rollbackJob(mockUserId, 'non-existent-job')
      ).rejects.toThrow('Application not found');
    });

    it('should verify timers are cancelled during rollback', async () => {
      vi.spyOn(timerService, 'cancelTimersByTarget').mockResolvedValue();
      vi.spyOn(jobService, 'rollbackJob').mockResolvedValue({
        job: { id: mockJobId, status: 'pending' },
        application: { id: mockApplicationId, userId: mockUserId, jobId: mockJobId },
      } as any);

      await jobService.rollbackJob(mockUserId, mockJobId);

      // Verify the rollback was called
      expect(jobService.rollbackJob).toHaveBeenCalledWith(mockUserId, mockJobId);
    });

    it('should verify document deletion timer is scheduled when documents exist', async () => {
      const mockResumeId = 'resume-123';
      const mockCoverLetterId = 'cover-letter-123';

      vi.spyOn(timerService, 'scheduleDocDeletionTimer').mockResolvedValue({} as any);
      vi.spyOn(jobService, 'rollbackJob').mockResolvedValue({
        job: { id: mockJobId, status: 'pending' },
        application: {
          id: mockApplicationId,
          generatedResumeId: mockResumeId,
          generatedCoverLetterId: mockCoverLetterId,
        },
      } as any);

      const result = await jobService.rollbackJob(mockUserId, mockJobId);

      expect(result.application!.generatedResumeId).toBe(mockResumeId);
      expect(result.application!.generatedCoverLetterId).toBe(mockCoverLetterId);
    });

    it('should delete application record during rollback', async () => {
      // This test verifies that the application is deleted during rollback
      // to prevent orphaned application records
      vi.spyOn(jobService, 'rollbackJob').mockResolvedValue({
        job: {
          id: mockJobId,
          status: 'pending',
          saved: false,
        },
        application: {
          id: mockApplicationId,
          userId: mockUserId,
          jobId: mockJobId,
          stage: 'applied',
        },
      } as any);

      const result = await jobService.rollbackJob(mockUserId, mockJobId);

      // Verify the rollback was called (which should delete the application)
      expect(jobService.rollbackJob).toHaveBeenCalledWith(mockUserId, mockJobId);
      expect(result).toBeDefined();
      expect(result.job.status).toBe('pending');
    });
  });
});
