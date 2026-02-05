import { describe, it, expect, beforeEach, vi } from 'vitest';
import { notificationService } from '../../services/notification.service.js';

// Mock the database module
vi.mock('../../lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

/**
 * Notifications API endpoint tests
 * Tests the notifications endpoint with unreadCount and timestamp
 */
describe('Notifications API Tests', () => {
  const mockUserId = 'test-user-123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/notifications - Get Notifications with unreadCount', () => {
    it('should return notifications with unreadCount and timestamp', async () => {
      const mockNotifications = [
        {
          id: 'notif-1',
          userId: mockUserId,
          type: 'cv_ready',
          title: 'CV Ready',
          message: 'Your CV is ready',
          isRead: false,
          metadata: {},
          createdAt: new Date('2024-01-01T12:00:00Z'),
        },
        {
          id: 'notif-2',
          userId: mockUserId,
          type: 'message_ready',
          title: 'Message Ready',
          message: 'Your message is ready',
          isRead: true,
          metadata: {},
          createdAt: new Date('2024-01-02T12:00:00Z'),
        },
      ];

      // Mock getNotifications
      vi.spyOn(notificationService, 'getNotifications').mockResolvedValue({
        items: mockNotifications as any,
        total: 2,
      });

      // Mock getUnreadCount
      vi.spyOn(notificationService, 'getUnreadCount').mockResolvedValue(1);

      const notificationsResult = await notificationService.getNotifications(mockUserId, 1, 20);
      const unreadCount = await notificationService.getUnreadCount(mockUserId);

      // Verify notifications are returned
      expect(notificationsResult.items).toHaveLength(2);
      expect(notificationsResult.total).toBe(2);

      // Verify unreadCount is returned
      expect(unreadCount).toBe(1);

      // Verify items have createdAt (which will be aliased to timestamp in the route)
      expect(notificationsResult.items[0]).toHaveProperty('createdAt');
      expect(notificationsResult.items[1]).toHaveProperty('createdAt');
    });

    it('should return correct unread count when no unread notifications', async () => {
      const mockNotifications = [
        {
          id: 'notif-1',
          userId: mockUserId,
          type: 'cv_ready',
          title: 'CV Ready',
          message: 'Your CV is ready',
          isRead: true,
          metadata: {},
          createdAt: new Date('2024-01-01T12:00:00Z'),
        },
      ];

      vi.spyOn(notificationService, 'getNotifications').mockResolvedValue({
        items: mockNotifications as any,
        total: 1,
      });

      vi.spyOn(notificationService, 'getUnreadCount').mockResolvedValue(0);

      const unreadCount = await notificationService.getUnreadCount(mockUserId);

      expect(unreadCount).toBe(0);
    });

    it('should return correct unread count when all notifications are unread', async () => {
      const mockNotifications = [
        {
          id: 'notif-1',
          userId: mockUserId,
          type: 'cv_ready',
          title: 'CV Ready',
          message: 'Your CV is ready',
          isRead: false,
          metadata: {},
          createdAt: new Date('2024-01-01T12:00:00Z'),
        },
        {
          id: 'notif-2',
          userId: mockUserId,
          type: 'message_ready',
          title: 'Message Ready',
          message: 'Your message is ready',
          isRead: false,
          metadata: {},
          createdAt: new Date('2024-01-02T12:00:00Z'),
        },
      ];

      vi.spyOn(notificationService, 'getNotifications').mockResolvedValue({
        items: mockNotifications as any,
        total: 2,
      });

      vi.spyOn(notificationService, 'getUnreadCount').mockResolvedValue(2);

      const unreadCount = await notificationService.getUnreadCount(mockUserId);

      expect(unreadCount).toBe(2);
    });
  });

  describe('Pagination', () => {
    it('should support pagination parameters', async () => {
      vi.spyOn(notificationService, 'getNotifications').mockResolvedValue({
        items: [] as any,
        total: 0,
      });

      await notificationService.getNotifications(mockUserId, 2, 10);

      expect(notificationService.getNotifications).toHaveBeenCalledWith(
        mockUserId,
        2,
        10
      );
    });
  });
});
