import { ExternalServiceError } from './errors.js';

interface MicroserviceClientOptions {
  baseUrl: string;
  apiKey: string;
  timeout?: number;
  serviceName?: string;
}

export class MicroserviceClient {
  private baseUrl: string;
  private apiKey: string;
  private timeout: number;
  private serviceName: string;

  constructor(options: MicroserviceClientOptions) {
    this.baseUrl = options.baseUrl;
    this.apiKey = options.apiKey;
    this.timeout = options.timeout || 30000;
    this.serviceName = options.serviceName || 'Unknown Service';
  }

  /**
   * Check if the client is properly configured
   */
  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.baseUrl.trim().length > 0);
  }

  async request<T = unknown>(
    path: string,
    options: {
      method?: string;
      body?: unknown;
      headers?: Record<string, string>;
      requestId?: string;
    } = {}
  ): Promise<T> {
    // Validate configuration before making request
    if (!this.isConfigured()) {
      throw new ExternalServiceError(
        this.serviceName,
        `Service URL not configured. Please set the appropriate environment variable.`
      );
    }

    const { method = 'GET', body, headers = {}, requestId } = options;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          ...(requestId && { 'X-Request-ID': requestId }),
          ...headers,
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new ExternalServiceError(
          this.serviceName,
          `Request failed with status ${response.status}: ${errorText}`
        );
      }

      return await response.json() as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof ExternalServiceError) {
        throw error;
      }
      throw new ExternalServiceError(
        this.serviceName,
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }
}

// Pre-configured clients for each microservice
export const scraperClient = new MicroserviceClient({
  baseUrl: process.env.SCRAPER_SERVICE_URL || '',
  apiKey: process.env.SCRAPER_SERVICE_KEY || '',
  serviceName: 'Job Scraper Service',
});

export const resumeAIClient = new MicroserviceClient({
  baseUrl: process.env.RESUME_AI_SERVICE_URL || '',
  apiKey: process.env.RESUME_AI_SERVICE_KEY || '',
  serviceName: 'Resume AI Service',
});

export const coverLetterAIClient = new MicroserviceClient({
  baseUrl: process.env.COVER_LETTER_AI_SERVICE_URL || '',
  apiKey: process.env.COVER_LETTER_AI_SERVICE_KEY || '',
  serviceName: 'Cover Letter AI Service',
});

export const emailSyncClient = new MicroserviceClient({
  baseUrl: process.env.EMAIL_SYNC_SERVICE_URL || '',
  apiKey: process.env.EMAIL_SYNC_SERVICE_KEY || '',
  serviceName: 'Email Sync Service',
});

export const aiFilteringClient = new MicroserviceClient({
  baseUrl: process.env.AI_FILTERING_SERVICE_URL || '',
  apiKey: process.env.AI_FILTERING_SERVICE_KEY || '',
  serviceName: 'AI Filtering Service',
});

export const jobFilterClient = new MicroserviceClient({
  baseUrl: process.env.JOB_FILTER_SERVICE_URL || '',
  apiKey: process.env.JOB_FILTER_SERVICE_KEY || '',
  serviceName: 'Job Filter Service',
});

export const applicationSenderClient = new MicroserviceClient({
  baseUrl: process.env.APPLICATION_SENDER_SERVICE_URL || '',
  apiKey: process.env.APPLICATION_SENDER_SERVICE_KEY || '',
  serviceName: 'Application Sender Service',
});

export const stageUpdaterClient = new MicroserviceClient({
  baseUrl: process.env.STAGE_UPDATER_SERVICE_URL || '',
  apiKey: process.env.STAGE_UPDATER_SERVICE_KEY || '',
  serviceName: 'Stage Updater Service',
});
