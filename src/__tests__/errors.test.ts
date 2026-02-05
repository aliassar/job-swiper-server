import { describe, it, expect } from 'vitest';
import { AppError, ValidationError, AuthenticationError, NotFoundError } from '../lib/errors.js';

describe('Errors', () => {
  describe('AppError', () => {
    it('should create error with correct properties', () => {
      const error = new AppError('TEST_ERROR', 'Test message', 500);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test message');
      expect(error.statusCode).toBe(500);
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with 400 status', () => {
      const error = new ValidationError('Invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.statusCode).toBe(400);
    });
  });

  describe('AuthenticationError', () => {
    it('should create auth error with 401 status', () => {
      const error = new AuthenticationError();
      expect(error.code).toBe('AUTHENTICATION_ERROR');
      expect(error.statusCode).toBe(401);
    });
  });

  describe('NotFoundError', () => {
    it('should create not found error with 404 status', () => {
      const error = new NotFoundError('User');
      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('User not found');
      expect(error.statusCode).toBe(404);
    });
  });
});
