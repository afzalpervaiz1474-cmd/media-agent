#!/usr/bin/env node
// Polling video worker: claims QUEUED media.* jobs from the jobs table and
// runs them via runJob (the same executor the API uses in-process).
//
//   node scripts/video-worker.mjs            # poll forever
//   node scripts/video-worker.mjs --once     # one pass, then exit
//   node scripts/video-worker.mjs --help
//
// Env: WORKER_POLL_MS (default 5000), WORKER_BATCH (default 5), plus the
// standard Supabase vars and video-analysis vars (see .env.example).
// Run ONE instance. For multi-worker setups, switch to Redis/BullMQ per
// README (Workers) — the jobs table stays the queue either way.
// Media jobs still complete with degraded (skipped, never fabricated) steps
// when a provider key or FFmpeg is missing; the worker only fails a job
// when runJob itself fails it (download / duration-limit errors).

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--help') || args.has('-h')) {
    console.log('Usage: node scripts/video-worker.mjs [--once]');
    console.log('Polls the jobs table for QUEUED media.* jobs and runs them via runJob.');
    console.log('Env: WORKER_POLL_MS (default 5000), WORKER_BATCH (default 5).');
    return;
  }
  const once = args.has('--once');

  let supabase;
  let runJob;
  let claimAndRunMediaJobs;
  let workerConfig;
  try {
    ({ default: supabase } = await import('../lib/server/db-client.js'));
    ({ runJob } = await import('../lib/server/_jobs.js'));
    ({ claimAndRunMediaJobs } = await import('../lib/server/video/worker-core.js'));
    ({ workerConfig } = await import('../lib/server/video/config.js'));
  } catch (e) {
    console.error(`[worker] Failed to start: ${e?.message || e}`);
    console.error('[worker] The worker needs Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(1);
  }

  const { pollMs, batch } = workerConfig();
  let stopping = false;
  const stop = () => { stopping = true; };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  const stamp = () => new Date().toISOString();
  for (;;) {
    try {
      const result = await claimAndRunMediaJobs(supabase, runJob, { batch });
      if (result.claimed > 0 || result.results.length > 0) {
        console.log(`[${stamp()}] polled=${result.polled} claimed=${result.claimed} skipped=${result.skipped}`);
        for (const r of result.results) {
          console.log(`[${stamp()}] job ${String(r.id).slice(0, 8)} (${r.kind}) -> ${r.status}${r.error ? ` (${r.error})` : ''}`);
        }
      }
    } catch (e) {
      console.error(`[${stamp()}] poll error: ${e?.message || e}`);
      if (once) process.exit(1);
    }
    if (once || stopping) break;
    await new Promise((r) => setTimeout(r, pollMs));
  }
  console.log(`[${stamp()}] worker stopped.`);
}

main().catch((e) => {
  console.error(`[worker] fatal: ${e?.message || e}`);
  process.exit(1);
});
