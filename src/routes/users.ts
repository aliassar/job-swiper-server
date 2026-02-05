import { Hono } from 'hono';
import { AppContext } from '../types/index.js';
import { db } from '../lib/db.js';
import { userSettings, resumeFiles, userJobStatus, applications, actionHistory } from '../db/schema.js';
import { formatResponse } from '../lib/utils.js';
import { eq } from 'drizzle-orm';
import { createAuditLog } from '../lib/audit.js';

const users = new Hono<AppContext>();

// POST /api/users/me/export - Export user data
users.post('/me/export', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  // Collect all user data
  const settings = await db.select().from(userSettings).where(eq(userSettings.userId, auth.userId));
  const resumes = await db.select().from(resumeFiles).where(eq(resumeFiles.userId, auth.userId));
  const jobStatuses = await db.select().from(userJobStatus).where(eq(userJobStatus.userId, auth.userId));
  const userApplications = await db.select().from(applications).where(eq(applications.userId, auth.userId));
  const history = await db.select().from(actionHistory).where(eq(actionHistory.userId, auth.userId));

  const exportData = {
    settings,
    resumes,
    jobStatuses,
    applications: userApplications,
    history,
  };

  await createAuditLog({
    userId: auth.userId,
    action: 'export_data',
    resource: 'user',
    resourceId: auth.userId,
  });

  return c.json(formatResponse(true, exportData, null, requestId));
});

// DELETE /api/users/me - Delete account
users.delete('/me', async (c) => {
  const auth = c.get('auth');
  const requestId = c.get('requestId');

  // Delete user data in order
  await db.delete(actionHistory).where(eq(actionHistory.userId, auth.userId));
  await db.delete(applications).where(eq(applications.userId, auth.userId));
  await db.delete(userJobStatus).where(eq(userJobStatus.userId, auth.userId));
  await db.delete(resumeFiles).where(eq(resumeFiles.userId, auth.userId));
  await db.delete(userSettings).where(eq(userSettings.userId, auth.userId));

  await createAuditLog({
    userId: auth.userId,
    action: 'delete_account',
    resource: 'user',
    resourceId: auth.userId,
  });

  return c.json(
    formatResponse(true, { message: 'Account deleted successfully' }, null, requestId)
  );
});

export default users;
