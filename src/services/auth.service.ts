import { db } from '../lib/db';
import { passwordResetTokens } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { ValidationError } from '../lib/errors';
import crypto from 'crypto';

export const authService = {
  async requestPasswordReset(email: string, _requestId?: string) {
    // Generate a random token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1); // Token valid for 1 hour

    // In a real implementation, you would:
    // 1. Look up the user by email
    // 2. Store the token in the database with the userId
    // 3. Send an email with the reset link
    
    // For now, we'll store the token with the email as userId
    // since we don't have a users table in this schema
    await db.insert(passwordResetTokens).values({
      userId: email, // In production, this would be the actual userId
      token,
      expiresAt,
      used: false,
    });

    // TODO: Send email with reset link
    // await emailClient.sendPasswordResetEmail(email, token, requestId);

    return { token }; // Return token for testing, don't return in production
  },

  async resetPassword(token: string, _newPassword: string) {
    // Find the token
    const tokenRecord = await db
      .select()
      .from(passwordResetTokens)
      .where(and(eq(passwordResetTokens.token, token), eq(passwordResetTokens.used, false)))
      .limit(1);

    if (tokenRecord.length === 0) {
      throw new ValidationError('Invalid or expired token');
    }

    const record = tokenRecord[0];

    // Check if token is expired
    if (record.expiresAt < new Date()) {
      throw new ValidationError('Token has expired');
    }

    // Mark token as used
    await db
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.id, record.id));

    // TODO: Update the user's password in the auth provider (NextAuth/etc)
    // For now, we just validate the flow
    
    return { success: true };
  },
};
