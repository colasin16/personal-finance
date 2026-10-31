/**
 * Processing runs in an in-memory queue on whichever server instance received the request, so
 * other instances can't know whether it's still alive. Instead every pipeline step bumps
 * `statements.progress_at`; an in-progress statement that hasn't moved for this long is treated
 * as abandoned (instance recycled, job timed out…) and can be retried.
 */
export const STALE_PROCESSING_MS = 3 * 60_000;

export const isInProgress = (status: string) => status === "uploaded" || status === "processing";

export function isStaleProcessing(statement: { status: string; progressAt: Date | string }, now = Date.now()) {
  return isInProgress(statement.status) && now - new Date(statement.progressAt).getTime() > STALE_PROCESSING_MS;
}
