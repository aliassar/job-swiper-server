/**
 * Derives what the UI should show for a document generation.
 *
 * The client re-runs this same rule against `startedAt`, so a card that has
 * been "Generating..." for fifteen minutes flips to failed on its own without
 * waiting for a refetch. Keep the two implementations in step:
 * job-swiper/lib/generationState.js is the mirror.
 */

export type GenerationState = 'ready' | 'generating' | 'failed' | 'idle';

/** No callback within this window is treated as a failure. */
export const GENERATION_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * n8n has been called and has not reported back yet. Note that 'pending' is
 * NOT here: it means the workflow row exists but nothing has been sent, which
 * under the document pool may never happen at all, so it must not read as
 * "Generating...".
 */
const IN_PROGRESS_STATUSES = new Set([
  'generating_resume',
  'generating_cover_letter',
  'waiting_cv_verification',
  'waiting_message_verification',
  'applying',
]);

export const TIMEOUT_MESSAGE = 'No response from the generator after 15 minutes';

export interface GenerationInput {
  hasResume: boolean;
  hasCoverLetter: boolean;
  workflowStatus?: string | null;
  workflowUpdatedAt?: Date | string | null;
  workflowError?: string | null;
}

export interface GenerationInfo {
  state: GenerationState;
  /** When the in-flight attempt last changed, so the client can time it out. */
  startedAt: string | null;
  /** Present only when state is 'failed'. */
  error: string | null;
}

export function deriveGenerationState(
  input: GenerationInput,
  now: number = Date.now()
): GenerationInfo {
  const { hasResume, hasCoverLetter, workflowStatus, workflowUpdatedAt, workflowError } = input;

  const startedAt = workflowUpdatedAt
    ? new Date(workflowUpdatedAt).toISOString()
    : null;

  // A produced document wins over any workflow state: the run may still say
  // 'generating_resume' forever, but the file exists and is downloadable.
  if (hasResume && hasCoverLetter) {
    return { state: 'ready', startedAt, error: null };
  }

  if (workflowStatus === 'failed') {
    return { state: 'failed', startedAt, error: workflowError || 'Generation failed' };
  }

  // A cancelled run produced nothing and will not be retried automatically.
  // Reporting it rather than falling through to 'idle' keeps the card honest -
  // showing no buttons at all reads as "never requested".
  if (workflowStatus === 'cancelled') {
    return {
      state: 'failed',
      startedAt,
      error: workflowError ? `Generation was cancelled (${workflowError})` : 'Generation was cancelled',
    };
  }

  if (workflowStatus && IN_PROGRESS_STATUSES.has(workflowStatus)) {
    const age = startedAt ? now - new Date(startedAt).getTime() : 0;
    if (age > GENERATION_TIMEOUT_MS) {
      // Distinguish a silent stall from a reported error, and keep the
      // reported one if the workflow recorded something before going quiet.
      return {
        state: 'failed',
        startedAt,
        error: workflowError ? `${TIMEOUT_MESSAGE} (${workflowError})` : TIMEOUT_MESSAGE,
      };
    }
    return { state: 'generating', startedAt, error: null };
  }

  // Partially produced - one document but not the other, with no run in
  // flight. Treat as ready so what exists stays downloadable.
  if (hasResume || hasCoverLetter) {
    return { state: 'ready', startedAt, error: null };
  }

  // 'pending', 'cancelled', 'completed' with nothing produced, or no run.
  return { state: 'idle', startedAt, error: null };
}
