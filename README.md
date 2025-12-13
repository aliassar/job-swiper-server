# Job Swiper Backend Server

A production-ready backend server for the Job Swiper application built with Hono (TypeScript), Drizzle ORM, and PostgreSQL.

## Tech Stack

- **Framework:** Hono (TypeScript)
- **ORM:** Drizzle ORM
- **Database:** PostgreSQL (Neon-compatible)
- **Auth:** NextAuth.js with GitHub and Google OAuth
- **File Storage:** S3-compatible (Cloudflare R2)
- **Deployment:** Vercel serverless

## Features

- RESTful API with comprehensive endpoints for job management
- Job swiper functionality (accept, reject, skip, save)
- Application tracking with customizable stages
- Resume and cover letter generation via microservices
- Email sync integration
- Audit logging and security
- Rate limiting (100 requests/minute per user)
- Structured JSON logging with Pino
- Automated job scraping via cron (every 2 hours)

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL database (or Neon)
- S3-compatible storage (Cloudflare R2, AWS S3, etc.)

### Installation

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Edit .env with your configuration
```

### Database Setup

```bash
# Generate database migrations
npm run db:generate

# Push schema to database
npm run db:push

# Seed initial data
npm run db:seed

# Open Drizzle Studio (database viewer)
npm run db:studio
```

### Development

```bash
# Start development server with hot reload
npm run dev
```

### Build

```bash
# Type check
npm run typecheck

# Build for production
npm run build
```

### Testing

```bash
# Run tests
npm test

# Run tests with UI
npm test:ui
```

## API Endpoints

### Jobs
- `GET /api/jobs` - Get pending jobs
- `POST /api/jobs/:id/accept` - Accept a job
- `POST /api/jobs/:id/reject` - Reject a job
- `POST /api/jobs/:id/skip` - Skip a job
- `POST /api/jobs/:id/save` - Toggle save status
- `POST /api/jobs/:id/rollback` - Rollback decision
- `POST /api/jobs/:id/report` - Report a job
- `POST /api/jobs/:id/unreport` - Remove report
- `GET /api/jobs/skipped` - Get skipped jobs

### Applications
- `GET /api/applications` - Get applications (paginated)
- `PUT /api/applications/:id/stage` - Update application stage

### Saved/Reported
- `GET /api/saved` - Get saved jobs (paginated)
- `GET /api/reported` - Get reported jobs (paginated)

### History
- `GET /api/history` - Get full action history

### Settings
- `GET /api/settings` - Get user settings
- `PUT /api/settings` - Update user settings

### Resumes
- `GET /api/resumes` - List resume files
- `POST /api/resumes` - Upload resume file
- `GET /api/resumes/:id` - Get resume details
- `DELETE /api/resumes/:id` - Delete resume
- `PATCH /api/resumes/:id/primary` - Set as primary

### Generation
- `POST /api/jobs/:id/generate/resume` - Generate tailored resume
- `POST /api/jobs/:id/generate/cover-letter` - Generate cover letter
- `GET /api/generated/resumes` - List generated resumes
- `GET /api/generated/cover-letters` - List generated cover letters
- `GET /api/generated/resumes/:id/download` - Download generated resume
- `GET /api/generated/cover-letters/:id/download` - Download generated cover letter

### Email Sync
- `POST /api/email/sync` - Trigger email sync
- `GET /api/email/status` - Get sync status

### Users
- `POST /api/users/me/export` - Export user data
- `DELETE /api/users/me` - Delete account

### Sync
- `POST /api/sync` - Trigger job sync (cron)
- `GET /api/sync/status` - Get last sync status

### Health
- `GET /api/health` - Health check

## Response Format

All endpoints return responses in the following format:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

Error responses:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error message",
    "details": { ... }
  },
  "meta": {
    "requestId": "req_123456789",
    "timestamp": "2024-01-01T00:00:00.000Z"
  }
}
```

## Deployment

This project is configured for deployment on Vercel:

```bash
# Deploy to Vercel
vercel deploy
```

Make sure to configure all environment variables in your Vercel project settings.

## Environment Variables

See `.env.example` for required environment variables.

## License

MIT