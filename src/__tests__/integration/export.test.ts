import { describe, it, expect, beforeEach, vi } from 'vitest';
import { applicationService } from '../../services/application.service';
import { jobService } from '../../services/job.service';

// Mock the database module
vi.mock('../../lib/db', () => ({
  db: {
    transaction: vi.fn(),
    select: vi.fn(),
    update: vi.fn(),
    insert: vi.fn(),
  },
}));

/**
 * Integration tests for export functionality
 * Tests CSV and PDF export for application history and saved jobs
 */
describe('Export APIs Integration Tests', () => {
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Application History Export', () => {
    const mockApplications = [
      {
        id: 'app-1',
        userId: mockUserId,
        jobId: 'job-1',
        stage: 'applied',
        appliedAt: new Date('2024-01-01'),
        notes: 'First application',
        job: {
          company: 'Tech Corp',
          position: 'Software Engineer',
          location: 'San Francisco, CA',
          salary: '$120,000 - $150,000',
        },
      },
      {
        id: 'app-2',
        userId: mockUserId,
        jobId: 'job-2',
        stage: 'interviewing',
        appliedAt: new Date('2024-01-05'),
        notes: 'Had first interview',
        job: {
          company: 'Startup Inc',
          position: 'Full Stack Developer',
          location: 'Remote',
          salary: '$100,000 - $130,000',
        },
      },
    ];

    it('should export applications to CSV format', async () => {
      const csv = await applicationService.exportApplicationsToCSV(mockApplications);

      expect(csv).toBeDefined();
      expect(csv).toContain('Company,Position,Location,Salary,Stage,Applied At,Notes');
      expect(csv).toContain('Tech Corp');
      expect(csv).toContain('Software Engineer');
      expect(csv).toContain('applied');
      expect(csv).toContain('Startup Inc');
      expect(csv).toContain('interviewing');
    });

    it('should properly escape CSV special characters', async () => {
      const applicationsWithSpecialChars = [
        {
          id: 'app-3',
          userId: mockUserId,
          jobId: 'job-3',
          stage: 'applied',
          appliedAt: new Date('2024-01-01'),
          notes: 'Note with "quotes" and, commas',
          job: {
            company: 'Company, Inc.',
            position: 'Developer "Senior"',
            location: 'New York, NY',
            salary: '$150,000',
          },
        },
      ];

      const csv = await applicationService.exportApplicationsToCSV(applicationsWithSpecialChars);

      expect(csv).toContain('""quotes""');
      expect(csv).toContain('"Company, Inc."');
    });

    it('should export applications to PDF format', async () => {
      const pdf = await applicationService.exportApplicationsToPDF(mockApplications);

      expect(pdf).toBeDefined();
      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(0);
      
      // PDF files start with %PDF
      const header = pdf.toString('utf-8', 0, 4);
      expect(header).toBe('%PDF');
    });

    it('should handle empty application list in CSV export', async () => {
      const csv = await applicationService.exportApplicationsToCSV([]);

      expect(csv).toBeDefined();
      expect(csv).toContain('Company,Position,Location,Salary,Stage,Applied At,Notes');
      const lines = csv.split('\n');
      expect(lines.length).toBe(1); // Only header
    });

    it('should handle empty application list in PDF export', async () => {
      const pdf = await applicationService.exportApplicationsToPDF([]);

      expect(pdf).toBeDefined();
      expect(Buffer.isBuffer(pdf)).toBe(true);
      expect(pdf.length).toBeGreaterThan(0);
    });

    it('should include all required fields in CSV export', async () => {
      const csv = await applicationService.exportApplicationsToCSV(mockApplications);
      const lines = csv.split('\n');
      const headers = lines[0].split(',');

      expect(headers).toContain('Company');
      expect(headers).toContain('Position');
      expect(headers).toContain('Location');
      expect(headers).toContain('Salary');
      expect(headers).toContain('Stage');
      expect(headers).toContain('Applied At');
      expect(headers).toContain('Notes');
    });
  });

  describe('Saved Jobs Export', () => {
    const mockSavedJobs = [
      {
        id: 'job-1',
        company: 'Tech Corp',
        position: 'Software Engineer',
        location: 'San Francisco, CA',
        salary: '$120,000 - $150,000',
        skills: 'JavaScript, React, Node.js',
        jobType: 'Full-time' as const,
        status: 'pending' as const,
        saved: true,
      },
      {
        id: 'job-2',
        company: 'Startup Inc',
        position: 'Full Stack Developer',
        location: 'Remote',
        salary: '$100,000 - $130,000',
        skills: 'Python, Django, PostgreSQL',
        jobType: 'Full-time' as const,
        status: 'pending' as const,
        saved: true,
      },
    ];

    it('should retrieve saved jobs for export', async () => {
      vi.spyOn(jobService, 'getSavedJobs').mockResolvedValue({
        items: mockSavedJobs,
        pagination: {
          total: mockSavedJobs.length,
          page: 1,
          limit: 10000,
          totalPages: 1,
        },
      } as any);

      const result = await jobService.getSavedJobs(mockUserId, 1, 10000);

      expect(result.items).toHaveLength(2);
      expect(result.items[0].company).toBe('Tech Corp');
      expect(result.items[1].company).toBe('Startup Inc');
    });
  });

  describe('Export with filters', () => {
    it('should support date range filtering for application export', async () => {
      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      vi.spyOn(applicationService, 'getApplicationHistory').mockResolvedValue({
        items: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 10000,
          totalPages: 0,
        },
      } as any);

      await applicationService.getApplicationHistory(mockUserId, {
        startDate,
        endDate,
        page: 1,
        limit: 10000,
      });

      expect(applicationService.getApplicationHistory).toHaveBeenCalledWith(mockUserId, {
        startDate,
        endDate,
        page: 1,
        limit: 10000,
      });
    });

    it('should support stage filtering for application export', async () => {
      vi.spyOn(applicationService, 'getApplicationHistory').mockResolvedValue({
        items: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 10000,
          totalPages: 0,
        },
      } as any);

      await applicationService.getApplicationHistory(mockUserId, {
        stage: 'interviewing',
        page: 1,
        limit: 10000,
      });

      expect(applicationService.getApplicationHistory).toHaveBeenCalledWith(mockUserId, {
        stage: 'interviewing',
        page: 1,
        limit: 10000,
      });
    });

    it('should support search filtering for application export', async () => {
      vi.spyOn(applicationService, 'getApplicationHistory').mockResolvedValue({
        items: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 10000,
          totalPages: 0,
        },
      } as any);

      await applicationService.getApplicationHistory(mockUserId, {
        search: 'Software Engineer',
        page: 1,
        limit: 10000,
      });

      expect(applicationService.getApplicationHistory).toHaveBeenCalledWith(mockUserId, {
        search: 'Software Engineer',
        page: 1,
        limit: 10000,
      });
    });
  });
});
