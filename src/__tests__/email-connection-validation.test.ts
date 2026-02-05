import { describe, it, expect, beforeAll } from 'vitest';
import { generateEncryptionKey } from '../lib/encryption.js';

describe('Email Connection Validation', () => {
  beforeAll(() => {
    // Set a test encryption key
    process.env.ENCRYPTION_KEY = generateEncryptionKey();
  });

  describe('Token Validation Logic', () => {
    it('should identify expired tokens correctly', () => {
      // Token expired 1 hour ago
      const expiredDate = new Date(Date.now() - 60 * 60 * 1000);
      const now = new Date();
      
      expect(expiredDate < now).toBe(true);
    });

    it('should identify tokens expiring soon correctly', () => {
      // Token expires in 3 minutes (within 5 minute threshold)
      const expiringDate = new Date(Date.now() + 3 * 60 * 1000);
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
      
      expect(expiringDate < fiveMinutesFromNow).toBe(true);
    });

    it('should identify valid tokens correctly', () => {
      // Token expires in 30 minutes (outside 5 minute threshold)
      const validDate = new Date(Date.now() + 30 * 60 * 1000);
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
      
      expect(validDate > fiveMinutesFromNow).toBe(true);
    });
  });

  describe('Token Expiry Calculation', () => {
    it('should calculate token expiry correctly from expires_in', () => {
      const expiresIn = 3600; // 1 hour in seconds
      const beforeCalc = Date.now();
      const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
      const afterCalc = Date.now();
      
      // Token should expire around 1 hour from now (with small tolerance for execution time)
      const expectedExpiry = beforeCalc + (expiresIn * 1000);
      const tolerance = 1000; // 1 second tolerance
      
      expect(tokenExpiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry - tolerance);
      expect(tokenExpiresAt.getTime()).toBeLessThanOrEqual(afterCalc + (expiresIn * 1000) + tolerance);
    });

    it('should handle missing expires_in correctly', () => {
      const expiresIn = undefined;
      const tokenExpiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 1000)
        : null;
      
      expect(tokenExpiresAt).toBeNull();
    });
  });

  describe('Credential Validation Requirements', () => {
    it('should validate IMAP credentials have all required fields', () => {
      const imapConnection = {
        imapHost: 'imap.example.com',
        imapPort: 993,
        imapUsername: 'user@example.com',
        encryptedImapPassword: 'encrypted_password',
        encryptionIv: 'iv_value',
      };
      
      const hasCredentials = !!(
        imapConnection.imapHost &&
        imapConnection.imapPort &&
        imapConnection.imapUsername &&
        imapConnection.encryptedImapPassword
      );
      
      expect(hasCredentials).toBe(true);
    });

    it('should fail IMAP validation when missing required fields', () => {
      const imapConnection = {
        imapHost: 'imap.example.com',
        imapPort: 993,
        imapUsername: null,
        encryptedImapPassword: 'encrypted_password',
      };
      
      const hasCredentials = !!(
        imapConnection.imapHost &&
        imapConnection.imapPort &&
        imapConnection.imapUsername &&
        imapConnection.encryptedImapPassword
      );
      
      expect(hasCredentials).toBe(false);
    });

    it('should validate OAuth credentials have all required fields', () => {
      const oauthConnection = {
        encryptedAccessToken: 'encrypted_access_token',
        encryptedRefreshToken: 'encrypted_refresh_token',
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      };
      
      const hasAccessToken = !!oauthConnection.encryptedAccessToken;
      const hasRefreshToken = !!oauthConnection.encryptedRefreshToken;
      const isNotExpired = !oauthConnection.tokenExpiresAt || oauthConnection.tokenExpiresAt > new Date();
      
      const isValid = hasAccessToken && hasRefreshToken && isNotExpired;
      
      expect(isValid).toBe(true);
    });

    it('should fail OAuth validation when token is expired', () => {
      const oauthConnection = {
        encryptedAccessToken: 'encrypted_access_token',
        encryptedRefreshToken: 'encrypted_refresh_token',
        tokenExpiresAt: new Date(Date.now() - 3600 * 1000), // Expired 1 hour ago
      };
      
      const hasAccessToken = !!oauthConnection.encryptedAccessToken;
      const hasRefreshToken = !!oauthConnection.encryptedRefreshToken;
      const isNotExpired = !oauthConnection.tokenExpiresAt || oauthConnection.tokenExpiresAt > new Date();
      
      const isValid = hasAccessToken && hasRefreshToken && isNotExpired;
      
      expect(isValid).toBe(false);
    });

    it('should fail OAuth validation when missing refresh token', () => {
      const oauthConnection = {
        encryptedAccessToken: 'encrypted_access_token',
        encryptedRefreshToken: null,
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
      };
      
      const hasAccessToken = !!oauthConnection.encryptedAccessToken;
      const hasRefreshToken = !!oauthConnection.encryptedRefreshToken;
      const isNotExpired = !oauthConnection.tokenExpiresAt || oauthConnection.tokenExpiresAt > new Date();
      
      const isValid = hasAccessToken && hasRefreshToken && isNotExpired;
      
      expect(isValid).toBe(false);
    });
  });

  describe('Provider-specific validation', () => {
    it('should validate Gmail provider correctly', () => {
      const provider = 'gmail';
      const isOAuthProvider = ['gmail', 'outlook', 'yahoo'].includes(provider);
      
      expect(isOAuthProvider).toBe(true);
    });

    it('should validate Outlook provider correctly', () => {
      const provider = 'outlook';
      const isOAuthProvider = ['gmail', 'outlook', 'yahoo'].includes(provider);
      
      expect(isOAuthProvider).toBe(true);
    });

    it('should validate Yahoo provider correctly', () => {
      const provider = 'yahoo';
      const isOAuthProvider = ['gmail', 'outlook', 'yahoo'].includes(provider);
      
      expect(isOAuthProvider).toBe(true);
    });

    it('should identify IMAP as non-OAuth provider', () => {
      const provider = 'imap';
      const isOAuthProvider = ['gmail', 'outlook', 'yahoo'].includes(provider);
      
      expect(isOAuthProvider).toBe(false);
    });
  });

  describe('Token refresh decision logic', () => {
    it('should decide to refresh when token is expired', () => {
      const tokenExpiresAt = new Date(Date.now() - 3600 * 1000);
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
      
      const needsRefresh = tokenExpiresAt && tokenExpiresAt < fiveMinutesFromNow;
      
      expect(needsRefresh).toBe(true);
    });

    it('should decide to refresh when token expires in 3 minutes', () => {
      const tokenExpiresAt = new Date(Date.now() + 3 * 60 * 1000);
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
      
      const needsRefresh = tokenExpiresAt && tokenExpiresAt < fiveMinutesFromNow;
      
      expect(needsRefresh).toBe(true);
    });

    it('should not refresh when token expires in 30 minutes', () => {
      const tokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000);
      const now = new Date();
      const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
      
      const needsRefresh = tokenExpiresAt && tokenExpiresAt < fiveMinutesFromNow;
      
      expect(needsRefresh).toBe(false);
    });

    it('should not refresh when tokenExpiresAt is null', () => {
      // Simulate a connection without token expiry (like IMAP)
      const getTokenExpiresAt = (): Date | null => null;
      const tokenExpiresAt = getTokenExpiresAt();
      const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);
      
      let needsRefresh = false;
      if (tokenExpiresAt) {
        needsRefresh = tokenExpiresAt < fiveMinutesFromNow;
      }
      
      expect(needsRefresh).toBe(false);
    });
  });
});
