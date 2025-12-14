import { Hono } from 'hono';
import { z } from 'zod';
import { AppContext } from '../types';
import { authService } from '../services/auth.service';
import { formatResponse } from '../lib/utils';
import { ValidationError } from '../lib/errors';

const auth = new Hono<AppContext>();

// Validation schemas
const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

// POST /auth/forgot-password - Request password reset
auth.post('/forgot-password', async (c) => {
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = forgotPasswordSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  await authService.requestPasswordReset(validated.data.email, requestId);

  return c.json(
    formatResponse(
      true,
      { message: 'Password reset email sent if account exists' },
      null,
      requestId
    )
  );
});

// POST /auth/reset-password - Reset password with token
auth.post('/reset-password', async (c) => {
  const requestId = c.get('requestId');

  const body = await c.req.json();
  const validated = resetPasswordSchema.safeParse(body);

  if (!validated.success) {
    throw new ValidationError('Invalid request body', validated.error.errors);
  }

  await authService.resetPassword(validated.data.token, validated.data.newPassword);

  return c.json(
    formatResponse(true, { message: 'Password reset successfully' }, null, requestId)
  );
});

export default auth;
