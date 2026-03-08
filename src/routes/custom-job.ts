import { Hono } from 'hono';
import { AppContext } from '../types/index.js';
import { logger } from '../middleware/logger.js';

const customJob = new Hono<AppContext>();

/**
 * POST /custom-job - Submit a custom job to n8n webhook
 *
 * Accepts { text, apply_link } and forwards to the n8n custom-job webhook
 * using the same N8N_WEBHOOK_SECRET for authentication.
 */
customJob.post('/', async (c) => {
    const requestId = c.get('requestId');

    const body = await c.req.json();
    const { text, apply_link } = body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return c.json({ success: false, error: 'Job text is required', requestId }, 400);
    }

    if (!apply_link || typeof apply_link !== 'string' || apply_link.trim().length === 0) {
        return c.json({ success: false, error: 'Apply link is required', requestId }, 400);
    }

    const webhookUrl = 'https://primary-production-552d.up.railway.app/webhook/custom-job';
    const webhookSecret = process.env.N8N_WEBHOOK_SECRET;

    try {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (webhookSecret) {
            headers['Authorization'] = `Bearer ${webhookSecret}`;
        }

        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                text: text.trim(),
                apply_link: apply_link.trim(),
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            logger.error({
                status: response.status,
                error: errorText,
                requestId,
            }, 'Custom job webhook call failed');
            return c.json({
                success: false,
                error: `Webhook returned ${response.status}`,
                requestId,
            }, 502);
        }

        logger.info({ requestId }, 'Custom job submitted to n8n webhook successfully');

        return c.json({
            success: true,
            data: { message: 'Custom job submitted successfully' },
            requestId,
        });
    } catch (error) {
        logger.error({ error, requestId }, 'Failed to call custom job webhook');
        return c.json({
            success: false,
            error: 'Failed to submit custom job',
            requestId,
        }, 500);
    }
});

export default customJob;
