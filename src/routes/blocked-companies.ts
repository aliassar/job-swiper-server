import { Hono } from 'hono';
import { AppContext } from '../types/index.js';
import { jobService } from '../services/job.service.js';
import { formatResponse } from '../lib/utils.js';

const blockedCompanies = new Hono<AppContext>();

/**
 * GET /api/blocked-companies - Get all blocked companies for the current user
 * 
 * @returns List of blocked companies with their details
 */
blockedCompanies.get('/', async (c) => {
    const auth = c.get('auth');
    const requestId = c.get('requestId');

    const companies = await jobService.getBlockedCompanies(auth.userId);

    return c.json(formatResponse(true, {
        blockedCompanies: companies.map(b => ({
            id: b.id,
            companyName: b.companyName,
            reason: b.reason,
            blockedAt: b.createdAt,
        })),
        total: companies.length,
    }, null, requestId));
});

/**
 * DELETE /api/blocked-companies/:companyName - Unblock a company
 * 
 * @param companyName - The company name to unblock (URL encoded)
 * 
 * @returns Success message
 */
blockedCompanies.delete('/:companyName', async (c) => {
    const auth = c.get('auth');
    const requestId = c.get('requestId');
    const companyName = decodeURIComponent(c.req.param('companyName'));

    await jobService.unblockCompany(auth.userId, companyName);

    return c.json(formatResponse(true, {
        message: 'Company unblocked successfully',
        companyName,
    }, null, requestId));
});

export default blockedCompanies;
