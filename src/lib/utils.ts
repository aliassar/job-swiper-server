export function formatResponse<T>(
  success: boolean,
  data: T | null,
  error: { code: string; message: string; details?: object } | null,
  requestId: string
) {
  return {
    success,
    ...(success ? { data } : { error }),
    meta: {
      requestId,
      timestamp: new Date().toISOString(),
    },
  };
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
}

export function parseIntSafe(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function parseBoolSafe(value: string | undefined, defaultValue: boolean): boolean {
  if (!value) return defaultValue;
  const lower = value.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  return defaultValue;
}
