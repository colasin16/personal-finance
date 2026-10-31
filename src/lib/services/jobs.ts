import { after } from "next/server";

type Job = { name: string; run: () => Promise<void>; done: () => void };

const globalForJobs = globalThis as unknown as { __pfJobs?: { queue: Job[]; running: boolean } };
const state = (globalForJobs.__pfJobs ??= { queue: [], running: false });

/** A job that runs longer than this releases the queue (stays below the routes' 300s maxDuration). */
const JOB_TIMEOUT_MS = 4 * 60_000;

/**
 * In-process background queue (stand-in for a durable queue).
 * Jobs run one at a time and only start once the HTTP response has been sent, so uploads return immediately.
 * Inside a request, `after()` keeps a serverless function (e.g. Vercel) alive until the job finishes.
 * Jobs are not durable: they live in this instance's memory, so other instances can't see them. Statement
 * processing records `progress_at` in the database instead, which is how abandoned statements are detected.
 */
export function enqueue(name: string, run: () => Promise<void>) {
  const finished = new Promise<void>((done) => state.queue.push({ name, run, done }));
  try {
    after(async () => {
      kick();
      await finished;
    });
  } catch {
    // Outside a request (scripts, tests) there is no response to wait for.
    kick();
  }
}

function kick() {
  if (!state.running) void drain();
}

async function drain() {
  state.running = true;
  try {
    while (state.queue.length > 0) {
      const job = state.queue.shift()!;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          job.run(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`timed out after ${JOB_TIMEOUT_MS / 1000}s`)), JOB_TIMEOUT_MS);
          }),
        ]);
      } catch (error) {
        console.error(`[jobs] ${job.name} failed`, error);
      } finally {
        clearTimeout(timer);
        job.done();
      }
    }
  } finally {
    state.running = false;
  }
}
