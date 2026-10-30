import { after } from "next/server";

type Job = { name: string; run: () => Promise<void>; done: () => void };

const globalForJobs = globalThis as unknown as { __pfJobs?: { queue: Job[]; running: boolean } };
const state = (globalForJobs.__pfJobs ??= { queue: [], running: false });

/**
 * In-process background queue (stand-in for a durable queue).
 * Jobs run one at a time after the HTTP response is sent; they are not durable across restarts,
 * which is why statements left in "processing" can be retried from the UI.
 * Inside a request, `after()` keeps a serverless function (e.g. Vercel) alive until the job finishes.
 */
export function enqueue(name: string, run: () => Promise<void>) {
  const finished = new Promise<void>((done) => state.queue.push({ name, run, done }));
  if (!state.running) void drain();
  try {
    after(finished);
  } catch {
    // Outside a request (scripts, tests) there is nothing to keep alive.
  }
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
      } finally {
        job.done();
      }
    }
  } finally {
    state.running = false;
  }
}

export function pendingJobs() {
  return state.queue.length + (state.running ? 1 : 0);
}
