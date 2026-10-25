// Polling worker core: claim QUEUED media jobs and run them via runJob.
// Claim is atomic: status is flipped QUEUED -> PROCESSING only where the
// row is still QUEUED, so two worker processes cannot run the same job.
// (runJob itself re-sets PROCESSING and bumps attempts; the claim does not
// touch attempts, so the count stays accurate.)
//
// Single-worker polling is the v1 default. For multi-worker setups, switch
// to Redis/BullMQ per README (Workers) — the jobs table stays the queue.

export async function claimAndRunMediaJobs(supabase, runJobFn, { batch = 5 } = {}) {
  const { data: queued, error } = await supabase.from('jobs')
    .select('id, kind')
    .eq('status', 'QUEUED')
    .like('kind', 'media.%')
    .order('created_at', { ascending: true })
    .limit(batch);
  if (error) throw new Error(`Worker poll failed: ${error.message || error}`);
  const result = { polled: (queued || []).length, claimed: 0, skipped: 0, results: [] };
  for (const job of queued || []) {
    const { data: claimed, error: claimError } = await supabase.from('jobs')
      .update({ status: 'PROCESSING' })
      .eq('id', job.id)
      .eq('status', 'QUEUED')
      .select('id');
    if (claimError || !claimed || claimed.length === 0) {
      result.skipped += 1;
      continue;
    }
    result.claimed += 1;
    try {
      const finalJob = await runJobFn(job.id);
      result.results.push({ id: job.id, kind: job.kind, status: finalJob?.status || 'unknown' });
    } catch (e) {
      result.results.push({ id: job.id, kind: job.kind, status: 'error', error: e?.message || String(e) });
    }
  }
  return result;
}
