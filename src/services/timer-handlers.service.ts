import { db } from '../lib/db.js';
import { applications, generatedResumes, generatedCoverLetters, followUpTracking, userSettings, jobs, users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { logger } from '../middleware/logger.js';
import { workflowService } from './workflow.service.js';
import { notificationService } from './notification.service.js';
import { timerService } from './timer.service.js';
import { storage } from '../lib/storage.js';
import { extractS3KeyFromUrl, escapeHtml } from '../lib/utils.js';
import { emailClient } from '../lib/email-client.js';

export interface Timer {
  id: string;
  userId: string;
  type: string;
  targetId: string;
  executeAt: Date;
  metadata: Record<string, unknown>;
}

export const timerHandlers = {
  /**
   * Handle auto-apply delay timer (1 minute after job acceptance)
   * Triggers n8n workflow for resume/cover letter generation
   */
  async handleAutoApplyDelay(timer: Timer): Promise<void> {
    console.log('\n📋 ===== AUTO-APPLY DELAY TIMER FIRED =====');
    console.log(`   Timer ID: ${timer.id}`);
    console.log(`   Application ID: ${timer.targetId}`);
    console.log(`   User ID: ${timer.userId}`);
    logger.info({ timerId: timer.id, applicationId: timer.targetId }, 'Processing auto-apply delay timer');

    try {
      const applicationId = timer.targetId;

      // Get application
      const application = await db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1);

      if (application.length === 0) {
        console.log('   ❌ Application not found');
        logger.warn({ applicationId }, 'Application not found for auto-apply timer');
        return;
      }

      const app = application[0];
      console.log(`   Job ID: ${app.jobId}`);

      // Check if there's a workflow run for this application
      const workflowRun = await workflowService.getWorkflowByApplication(applicationId);

      if (!workflowRun) {
        console.log('   ❌ No workflow run found');
        logger.warn({ applicationId }, 'No workflow run found for application');
        return;
      }

      // Check if workflow was cancelled (rolled back)
      if (workflowRun.status === 'cancelled') {
        console.log('   ⚠️ Workflow was cancelled, skipping');
        logger.info({ applicationId, workflowRunId: workflowRun.id }, 'Workflow was cancelled, skipping auto-apply');
        return;
      }

      console.log('\n🚀 ===== CALLING n8n WEBHOOK =====');
      console.log(`   URL: ${process.env.N8N_WEBHOOK_URL}/generate-documents`);

      // Trigger n8n workflow for document generation
      const result = await workflowService.triggerN8nDocumentGeneration(
        timer.userId,
        app.jobId,
        applicationId
      );

      if (result.success) {
        console.log('   ✅ n8n WEBHOOK CALLED SUCCESSFULLY!');
        // Update workflow status to indicate n8n was triggered
        await workflowService.updateWorkflowStatus(workflowRun.id, 'generating_resume');

        // Update application stage directly to Applied (simplified flow)
        await db
          .update(applications)
          .set({
            stage: 'Applied',
            appliedAt: new Date(),
            lastUpdated: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(applications.id, applicationId));

        console.log('   📄 Application stage updated to Applied');
        console.log('===================================\n');
        logger.info({ applicationId, workflowRunId: workflowRun.id }, 'n8n document generation triggered successfully');
      } else {
        console.log(`   ❌ n8n WEBHOOK FAILED: ${result.error}`);
        console.log('===================================\n');
        // Log error but don't fail - n8n might not be configured
        logger.error({ applicationId, error: result.error }, 'Failed to trigger n8n document generation');

        // Update workflow status to failed
        await workflowService.updateWorkflowStatus(workflowRun.id, 'failed', result.error);
      }

    } catch (error) {
      console.log(`   ❌ ERROR: ${error}`);
      console.log('===================================\n');
      logger.error({ error, timerId: timer.id }, 'Error processing auto-apply delay timer');
      throw error;
    }
  },

  /**
   * Handle CV verification timeout - DEPRECATED with simplified stages
   * Kept for backward compatibility but does nothing
   */
  async handleCvVerificationTimeout(timer: Timer): Promise<void> {
    logger.info({ timerId: timer.id, applicationId: timer.targetId }, 'CV verification timeout handler called (deprecated with simplified stages)');
    // No-op - CV Check stage no longer exists
  },

  /**
   * Handle message verification timeout - DEPRECATED with simplified stages
   * Kept for backward compatibility but does nothing
   */
  async handleMessageVerificationTimeout(timer: Timer): Promise<void> {
    logger.info({ timerId: timer.id, applicationId: timer.targetId }, 'Message verification timeout handler called (deprecated with simplified stages)');
    // No-op - Message Check stage no longer exists
  },

  /**
   * Handle document deletion timer (1 day after rollback)
   * Deletes generated documents if they weren't reused
   */
  async handleDocDeletion(timer: Timer): Promise<void> {
    logger.info({ timerId: timer.id }, 'Processing document deletion timer');

    try {
      const resumeId = timer.metadata.resumeId as string;
      const coverLetterId = timer.metadata.coverLetterId as string | undefined;

      // Check if resume is still being used by any application
      if (resumeId) {
        const resumeUsage = await db
          .select()
          .from(applications)
          .where(eq(applications.generatedResumeId, resumeId))
          .limit(1);

        if (resumeUsage.length > 0) {
          logger.info({ resumeId }, 'Resume is being used by an application, skipping deletion');
        } else {
          // Get resume details
          const resume = await db
            .select()
            .from(generatedResumes)
            .where(eq(generatedResumes.id, resumeId))
            .limit(1);

          if (resume.length > 0) {
            // Delete from storage
            try {
              const key = extractS3KeyFromUrl(resume[0].fileUrl);
              await storage.deleteFile(key);
            } catch (error) {
              logger.error({ error, resumeId }, 'Error deleting resume from storage');
            }

            // Delete from database
            await db.delete(generatedResumes).where(eq(generatedResumes.id, resumeId));
            logger.info({ resumeId }, 'Resume deleted successfully');
          }
        }
      }

      // Check if cover letter is still being used by any application
      if (coverLetterId) {
        const coverLetterUsage = await db
          .select()
          .from(applications)
          .where(eq(applications.generatedCoverLetterId, coverLetterId))
          .limit(1);

        if (coverLetterUsage.length > 0) {
          logger.info({ coverLetterId }, 'Cover letter is being used by an application, skipping deletion');
        } else {
          // Get cover letter details
          const coverLetter = await db
            .select()
            .from(generatedCoverLetters)
            .where(eq(generatedCoverLetters.id, coverLetterId))
            .limit(1);

          if (coverLetter.length > 0) {
            // Delete from storage
            try {
              const key = extractS3KeyFromUrl(coverLetter[0].fileUrl);
              await storage.deleteFile(key);
            } catch (error) {
              logger.error({ error, coverLetterId }, 'Error deleting cover letter from storage');
            }

            // Delete from database
            await db.delete(generatedCoverLetters).where(eq(generatedCoverLetters.id, coverLetterId));
            logger.info({ coverLetterId }, 'Cover letter deleted successfully');
          }
        }
      }

    } catch (error) {
      logger.error({ error, timerId: timer.id }, 'Error processing document deletion timer');
      throw error;
    }
  },

  /**
   * Handle follow-up reminder timer
   * Creates notification and sends auto follow-up if enabled (max 3 times)
   */
  async handleFollowUpReminder(timer: Timer): Promise<void> {
    logger.info({ timerId: timer.id, applicationId: timer.targetId }, 'Processing follow-up reminder timer');

    try {
      const applicationId = timer.targetId;
      const userId = timer.userId;

      // Get application
      const application = await db
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1);

      if (application.length === 0) {
        logger.warn({ applicationId }, 'Application not found for follow-up reminder');
        return;
      }

      const app = application[0];

      // Only send follow-up if application is in Applied or In Review stage
      if (!['Applied', 'In Review'].includes(app.stage)) {
        logger.info({ applicationId, stage: app.stage }, 'Application not in valid stage for follow-up');
        return;
      }

      // Get or create follow-up tracking
      let tracking = await db
        .select()
        .from(followUpTracking)
        .where(eq(followUpTracking.applicationId, applicationId))
        .limit(1);

      let followUpCount = 0;
      if (tracking.length === 0) {
        // Create new tracking
        await db
          .insert(followUpTracking)
          .values({
            userId,
            applicationId,
            followUpCount: 1,
            lastFollowUpAt: new Date(),
          })
          .returning();
        followUpCount = 1;
      } else {
        followUpCount = tracking[0].followUpCount + 1;

        // Update tracking
        await db
          .update(followUpTracking)
          .set({
            followUpCount,
            lastFollowUpAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(followUpTracking.id, tracking[0].id));
      }

      // Check if we've reached max follow-ups
      if (followUpCount > 3) {
        logger.info({ applicationId, followUpCount }, 'Max follow-ups reached, stopping');
        return;
      }

      // Create notification
      await notificationService.createNotification(
        userId,
        'follow_up_reminder',
        'Follow-up Reminder',
        `Time to follow up on your application (Follow-up ${followUpCount}/3)`,
        { applicationId, followUpCount }
      );

      // Get user settings
      const settings = await db
        .select()
        .from(userSettings)
        .where(eq(userSettings.userId, userId))
        .limit(1);

      if (settings.length > 0 && settings[0].autoFollowUpEnabled) {
        // Send automated follow-up email
        try {
          // Get user and job details in one query
          const userAndJob = await db
            .select({
              userEmail: users.email,
              company: jobs.company,
              position: jobs.position,
              location: jobs.location,
            })
            .from(users)
            .innerJoin(jobs, eq(jobs.id, app.jobId))
            .where(eq(users.id, userId))
            .limit(1);

          if (userAndJob.length === 0) {
            logger.warn({ userId }, 'User or job not found for follow-up email');
          } else {
            const { userEmail, company, position, location } = userAndJob[0];

            // Escape HTML to prevent injection
            const companyName = escapeHtml(company || 'Unknown Company');
            const positionTitle = escapeHtml(position || 'Unknown Position');
            const jobLocation = location ? escapeHtml(location) : null;

            // Send follow-up email
            await emailClient.sendEmail({
              to: userEmail,
              subject: `Follow-up Reminder: ${companyName} - ${positionTitle}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2>Follow-up Reminder (${followUpCount}/3)</h2>
                  <p>Hi there,</p>
                  <p>This is a reminder to follow up on your job application:</p>
                  <div style="background-color: #F3F4F6; padding: 16px; border-radius: 8px; margin: 20px 0;">
                    <p style="margin: 0;"><strong>Company:</strong> ${companyName}</p>
                    <p style="margin: 8px 0 0 0;"><strong>Position:</strong> ${positionTitle}</p>
                    ${jobLocation ? `<p style="margin: 8px 0 0 0;"><strong>Location:</strong> ${jobLocation}</p>` : ''}
                  </div>
                  <p>Following up with hiring managers can demonstrate your continued interest and keep your application top of mind.</p>
                  <p>Consider sending a polite follow-up message inquiring about the status of your application.</p>
                  <p style="color: #9CA3AF; font-size: 12px; margin-top: 40px;">
                    This is an automated reminder from Job Swiper. You can manage your follow-up settings in your account preferences.
                  </p>
                </div>
              `,
            });

            logger.info({ applicationId, followUpCount, userEmail }, 'Auto follow-up email sent');
          }
        } catch (error) {
          logger.error({ error, applicationId, followUpCount }, 'Failed to send automated follow-up email');
          // Don't throw - we still want to schedule the next follow-up
        }
      }

      // Schedule next follow-up if not at max
      if (followUpCount < 3 && settings.length > 0) {
        const intervalDays = settings[0].followUpIntervalDays || 7;
        await timerService.scheduleFollowUpReminder(userId, applicationId, intervalDays);
      }

    } catch (error) {
      logger.error({ error, timerId: timer.id }, 'Error processing follow-up reminder timer');
      throw error;
    }
  },
};
