import { describe, it, expect } from 'vitest';

/**
 * Unit tests for word-boundary company name matching logic
 * Tests the SQL regex word-boundary matching approach
 */
describe('Company Name Word-Boundary Matching Logic', () => {
    // Helper to simulate the PostgreSQL ~* regex word-boundary matching
    const isCompanyBlocked = (jobCompany: string, blockedName: string): boolean => {
        // Escape special regex characters
        const escapedBlocked = blockedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const escapedJob = jobCompany.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        // PostgreSQL \m = word start, \M = word end
        // In JavaScript, we use \b for word boundaries
        const blockedPattern = new RegExp(`\\b${escapedBlocked}\\b`, 'i');
        const jobPattern = new RegExp(`\\b${escapedJob}\\b`, 'i');

        // Match: job company contains blocked name as word OR blocked name contains job company as word
        return blockedPattern.test(jobCompany) || jobPattern.test(blockedName);
    };

    describe('word-boundary matching', () => {
        it('should match when job company contains blocked name as complete word', () => {
            expect(isCompanyBlocked('Google Inc', 'Google')).toBe(true);
            expect(isCompanyBlocked('Google LLC', 'Google')).toBe(true);
            expect(isCompanyBlocked('Google Corporation', 'Google')).toBe(true);
        });

        it('should match when blocked name contains job company as complete word', () => {
            expect(isCompanyBlocked('Google', 'Google Inc')).toBe(true);
            expect(isCompanyBlocked('Google', 'Google LLC')).toBe(true);
        });

        it('should match exact company names', () => {
            expect(isCompanyBlocked('Google', 'Google')).toBe(true);
            expect(isCompanyBlocked('Meta', 'Meta')).toBe(true);
        });

        it('should be case-insensitive', () => {
            expect(isCompanyBlocked('GOOGLE', 'google')).toBe(true);
            expect(isCompanyBlocked('Google', 'GOOGLE INC')).toBe(true);
        });
    });

    describe('should NOT match partial word matches (false positives prevention)', () => {
        it('should NOT match when blocked name is substring but not complete word', () => {
            // "Meta" should NOT match "Metadata Inc" - different companies
            expect(isCompanyBlocked('Metadata Inc', 'Meta')).toBe(false);
            // "Micro" should NOT match "Microsoft" - different companies
            expect(isCompanyBlocked('Microsoft', 'Micro')).toBe(false);
        });

        it('should NOT match completely different companies', () => {
            expect(isCompanyBlocked('Microsoft', 'Google')).toBe(false);
            expect(isCompanyBlocked('Apple Inc', 'Google LLC')).toBe(false);
        });
    });

    describe('real-world examples', () => {
        it('should handle German company suffixes', () => {
            expect(isCompanyBlocked('Deutsche Bahn AG', 'Deutsche Bahn')).toBe(true);
            expect(isCompanyBlocked('Siemens GmbH', 'Siemens')).toBe(true);
        });

        it('should handle companies with punctuation', () => {
            expect(isCompanyBlocked('Coca-Cola Company', 'Coca-Cola')).toBe(true);
        });

        it('should handle multi-word company names', () => {
            expect(isCompanyBlocked('Amazon Web Services Inc', 'Amazon Web Services')).toBe(true);
            expect(isCompanyBlocked('Amazon', 'Amazon Web Services')).toBe(true);
        });
    });
});
