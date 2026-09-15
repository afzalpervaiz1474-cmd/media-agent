import supabase from './db-client.js';
import { preflight, getUser, requireUser, safeError } from './_auth.js';
import { PROVIDER_META, providerConfigStatus } from './_providers.js';

export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;
    const uid = user.id;

    const cfg = providerConfigStatus();

    const [contentAll, jobsAll, autos, accounts, recentJobs, recentContent, recentPublishes, recentMedia, notifs] = await Promise.all([
      supabase.from('content').select('status').eq('user_id', uid),
      supabase.from('jobs').select('status,created_at').eq('user_id', uid),
      supabase.from('automations').select('id,status').eq('user_id', uid),
      supabase.from('connected_accounts').select('*').eq('user_id', uid),
      supabase.from('jobs').select('id,kind,status,created_at,progress').eq('user_id', uid).order('created_at', { ascending: false }).limit(6),
      supabase.from('content').select('id,title,status,updated_at,created_at').eq('user_id', uid).order('updated_at', { ascending: false }).limit(6),
      supabase.from('publish_results').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(8),
      supabase.from('media_assets').select('id,filename,kind,created_at,public_url').eq('user_id', uid).order('created_at', { ascending: false }).limit(4),
      supabase.from('notifications').select('id,title,body,link,read_at,created_at').eq('user_id', uid).is('read_at', null).order('created_at', { ascending: false }).limit(6),
    ]);

    const contentByStatus = {};
    for (const r of contentAll.data || []) contentByStatus[r.status] = (contentByStatus[r.status] || 0) + 1;

    const jobsByStatus = {};
    for (const r of jobsAll.data || []) jobsByStatus[r.status] = (jobsByStatus[r.status] || 0) + 1;

    // 14-day histogram
    const days = [];
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - i);
      days.push({ day: d.toISOString().slice(0, 10), total: 0 });
    }
    for (const r of jobsAll.data || []) {
      const d = String(r.created_at).slice(0, 10);
      const bucket = days.find((x) => x.day === d);
      if (bucket) bucket.total += 1;
    }

    // Provider status snapshot
    const accountsByProvider = {};
    for (const a of accounts.data || []) accountsByProvider[a.provider] = a;
    const providerStatus = {};
    for (const p of Object.keys(PROVIDER_META)) {
      providerStatus[p] = {
        name: PROVIDER_META[p].name,
        configured: cfg[p].configured,
        connected: !!accountsByProvider[p],
        account: accountsByProvider[p] ? { display_name: accountsByProvider[p].display_name, handle: accountsByProvider[p].handle, avatar_url: accountsByProvider[p].avatar_url } : null,
      };
    }

    const publishCounts = { published: 0, failed: 0 };
    for (const r of recentPublishes.data || []) {
      if (r.status === 'published') publishCounts.published += 1;
      if (r.status === 'failed') publishCounts.failed += 1;
    }

    res.status(200).json({
      counts: {
        content: (contentAll.data || []).length,
        jobs: (jobsAll.data || []).length,
        automations: (autos.data || []).length,
        accounts: (accounts.data || []).length,
        active_automations: (autos.data || []).filter((a) => a.status === 'active').length,
        published_recent: publishCounts.published,
        failed_recent: publishCounts.failed,
      },
      contentByStatus,
      jobsByStatus,
      recentJobs: recentJobs.data || [],
      recentContent: recentContent.data || [],
      recentPublishes: recentPublishes.data || [],
      recentMedia: recentMedia.data || [],
      unreadNotifications: notifs.data || [],
      jobsHistogram: days,
      providerStatus,
    });
  } catch (err) {
    console.error('dashboard error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
