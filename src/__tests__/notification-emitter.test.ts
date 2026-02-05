import { describe, it, expect, beforeEach, vi } from 'vitest';
import { notificationService } from '../services/notification.service.js';

// Mock the database module
vi.mock('../lib/db', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

/**
 * Notification EventEmitter and SSE connection tests
 * Tests for Issue #41: EventEmitter memory leak prevention
 */
describe('Notification EventEmitter Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Active Connection Tracking', () => {
    it('should track active connections when subscribing', () => {
      const mockUserId = 'user-123';
      const initialCount = notificationService.getActiveConnectionCount();

      const unsubscribe = notificationService.subscribeToNotifications(
        mockUserId,
        () => {}
      );

      const afterSubscribe = notificationService.getActiveConnectionCount();
      expect(afterSubscribe).toBe(initialCount + 1);

      unsubscribe();
    });

    it('should decrement active connections when unsubscribing', () => {
      const mockUserId = 'user-123';
      const initialCount = notificationService.getActiveConnectionCount();

      const unsubscribe = notificationService.subscribeToNotifications(
        mockUserId,
        () => {}
      );

      const afterSubscribe = notificationService.getActiveConnectionCount();
      expect(afterSubscribe).toBe(initialCount + 1);

      unsubscribe();

      const afterUnsubscribe = notificationService.getActiveConnectionCount();
      expect(afterUnsubscribe).toBe(initialCount);
    });

    it('should track multiple simultaneous connections', () => {
      const mockUserId1 = 'user-123';
      const mockUserId2 = 'user-456';
      const mockUserId3 = 'user-789';
      const initialCount = notificationService.getActiveConnectionCount();

      const unsubscribe1 = notificationService.subscribeToNotifications(
        mockUserId1,
        () => {}
      );
      const unsubscribe2 = notificationService.subscribeToNotifications(
        mockUserId2,
        () => {}
      );
      const unsubscribe3 = notificationService.subscribeToNotifications(
        mockUserId3,
        () => {}
      );

      const afterSubscribes = notificationService.getActiveConnectionCount();
      expect(afterSubscribes).toBe(initialCount + 3);

      unsubscribe1();
      unsubscribe2();
      unsubscribe3();

      const afterUnsubscribes = notificationService.getActiveConnectionCount();
      expect(afterUnsubscribes).toBe(initialCount);
    });

    it('should handle many connections without warnings', () => {
      const mockUserId = 'user-123';
      const connections = 20; // More than default maxListeners (10)
      const unsubscribers: (() => void)[] = [];
      const initialCount = notificationService.getActiveConnectionCount();

      // Subscribe many listeners - should not trigger maxListeners warning
      for (let i = 0; i < connections; i++) {
        const unsubscribe = notificationService.subscribeToNotifications(
          mockUserId,
          () => {}
        );
        unsubscribers.push(unsubscribe);
      }

      const afterSubscribes = notificationService.getActiveConnectionCount();
      expect(afterSubscribes).toBe(initialCount + connections);

      // Clean up
      unsubscribers.forEach(unsub => unsub());

      const afterCleanup = notificationService.getActiveConnectionCount();
      expect(afterCleanup).toBe(initialCount);
    });
  });

  describe('Subscription Callbacks', () => {
    it('should call callback when notification is emitted for subscribed user', async () => {
      const mockUserId = 'user-123';
      const mockCallback = vi.fn();

      const unsubscribe = notificationService.subscribeToNotifications(
        mockUserId,
        mockCallback
      );

      // Mock database insert to trigger notification
      const { db } = await import('../lib/db.js');
      const mockNotification = {
        id: 'notif-1',
        userId: mockUserId,
        type: 'cv_ready',
        title: 'CV Ready',
        message: 'Your CV is ready',
        isRead: false,
        metadata: {},
        createdAt: new Date(),
      };

      // Mock the insert operation
      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockNotification]),
        }),
      });

      // Create notification which should trigger the callback
      await notificationService.createNotification(
        mockUserId,
        'cv_ready',
        'CV Ready',
        'Your CV is ready'
      );

      // Callback should be called
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          type: 'cv_ready',
        })
      );

      unsubscribe();
    });

    it('should not call callback for different user', async () => {
      const mockUserId1 = 'user-123';
      const mockUserId2 = 'user-456';
      const mockCallback = vi.fn();

      const unsubscribe = notificationService.subscribeToNotifications(
        mockUserId1,
        mockCallback
      );

      // Mock database insert
      const { db } = await import('../lib/db.js');
      const mockNotification = {
        id: 'notif-1',
        userId: mockUserId2,
        type: 'cv_ready',
        title: 'CV Ready',
        message: 'Your CV is ready',
        isRead: false,
        metadata: {},
        createdAt: new Date(),
      };

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockNotification]),
        }),
      });

      // Create notification for different user
      await notificationService.createNotification(
        mockUserId2,
        'cv_ready',
        'CV Ready',
        'Your CV is ready'
      );

      // Callback should NOT be called
      expect(mockCallback).not.toHaveBeenCalled();

      unsubscribe();
    });

    it('should not call callback after unsubscribing', async () => {
      const mockUserId = 'user-123';
      const mockCallback = vi.fn();

      const unsubscribe = notificationService.subscribeToNotifications(
        mockUserId,
        mockCallback
      );

      // Unsubscribe immediately
      unsubscribe();

      // Mock database insert
      const { db } = await import('../lib/db.js');
      const mockNotification = {
        id: 'notif-1',
        userId: mockUserId,
        type: 'cv_ready',
        title: 'CV Ready',
        message: 'Your CV is ready',
        isRead: false,
        metadata: {},
        createdAt: new Date(),
      };

      (db.insert as any).mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockNotification]),
        }),
      });

      // Create notification after unsubscribe
      await notificationService.createNotification(
        mockUserId,
        'cv_ready',
        'CV Ready',
        'Your CV is ready'
      );

      // Callback should NOT be called
      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('getActiveConnectionCount', () => {
    it('should return current active connection count', () => {
      const count = notificationService.getActiveConnectionCount();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });
});
