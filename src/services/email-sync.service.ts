import { emailSyncClient } from '../lib/microservice-client';

export const emailSyncService = {
  async triggerSync(userId: string, requestId?: string) {
    return await emailSyncClient.request<{ status: string; message: string }>(
      '/sync',
      {
        method: 'POST',
        body: { userId },
        requestId,
      }
    );
  },

  async getSyncStatus(userId: string, requestId?: string) {
    return await emailSyncClient.request<{ status: string; lastSync: string | null }>(
      `/status?userId=${userId}`,
      {
        method: 'GET',
        requestId,
      }
    );
  },
};
