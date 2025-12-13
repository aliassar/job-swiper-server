import { db } from './db';
import { auditLogs } from '../db/schema';

interface AuditLogData {
  userId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      userId: data.userId,
      action: data.action,
      resource: data.resource,
      resourceId: data.resourceId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      metadata: data.metadata || {},
    });
  } catch (error) {
    // Log but don't throw - audit failures shouldn't break the app
    console.error('Failed to create audit log:', error);
  }
}
