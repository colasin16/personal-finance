type Job = { name: string; run: () => Promise<void> };

const globalForJobs = globalThis as unknown as { __pfJobs?: { queue: Job[]; running: boolean } };
const state = (globalForJobs.__pfJobs ??= { queue: [], running: false });

/**
 * In-process background queue (development stand-in for Inngest/Trigger.dev).
 * Jobs run one at a time after the HTTP response is sent; they are not durable across restarts,
 * which is why statements left in "processing" can be retried from the UI.
 */
export function enqueue(name: string, run: () => Promise<void>) {
  state.queue.push({ name, run });
  if (!state.running) void drain();
}

async function drain() {
  state.running = true;
  try {
    while (state.queue.length > 0) {
      const job = state.queue.shift()!;
      try {
        await job.run();
      } catch (error) {
        console.error(`[jobs] ${job.name} failed`, error);
      }
    }
  } finally {
    state.running = false;
  }
}

export function pendingJobs() {
  return state.queue.length + (state.running ? 1 : 0);
}
