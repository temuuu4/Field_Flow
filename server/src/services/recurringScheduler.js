import { generateDueAssignments } from './recurringAssignmentService.js';

let timer = null;
let running = false;

async function runDueAssignments() {
  if (running) return;
  running = true;
  try {
    await generateDueAssignments();
  } catch (error) {
    // A later tick retries safely. Assignment's unique schedule/occurrence
    // index makes retries and concurrent application instances idempotent.
    console.error(`[recurring-scheduler] ${error.message}`);
  } finally {
    running = false;
  }
}

export function startRecurringScheduler(intervalMs) {
  if (timer) return;
  void runDueAssignments(); // Recover due work immediately after a restart.
  timer = setInterval(() => void runDueAssignments(), intervalMs);
  timer.unref?.();
}

export function stopRecurringScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
