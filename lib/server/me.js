import supabase from './db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from './_auth.js';

// All methods now require an authenticated Supabase user.
// The profile row is upserted using the id/email from the verified token — the
// request body is IGNORED for identity to prevent profile takeover.
export async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;

    if (req.method === 'POST') {
      const full_name = (req.body && typeof req.body.full_name === 'string') ? req.body.full_name : (user.user_metadata?.full_name || null);
      const { data: existing } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
      if (!existing) {
        await supabase.from('profiles').insert({ id: user.id, email: String(user.email).toLowerCase(), full_name });
        await audit(user.id, 'user.signup', { type: 'profile', id: user.id });
      }
      return res.status(200).json({ ok: true });
    }

    if (req.method === 'GET') {
      const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (!data) {
        const { data: created } = await supabase.from('profiles').insert({ id: user.id, email: user.email }).select('*').single();
        return res.status(200).json({ profile: created });
      }
      return res.status(200).json({ profile: data });
    }

    if (req.method === 'PUT') {
      const { full_name, timezone, avatar_url, notif_email, notif_inapp } = req.body || {};
      const patch = { updated_at: new Date().toISOString() };
      if (full_name !== undefined) patch.full_name = full_name;
      if (timezone !== undefined) patch.timezone = timezone;
      if (avatar_url !== undefined) patch.avatar_url = avatar_url;
      if (notif_email !== undefined) patch.notif_email = !!notif_email;
      if (notif_inapp !== undefined) patch.notif_inapp = !!notif_inapp;
      const { data, error } = await supabase.from('profiles').update(patch).eq('id', user.id).select('*').single();
      if (error) throw error;
      await audit(user.id, 'profile.update', { type: 'profile', id: user.id });
      return res.status(200).json({ profile: data });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('me error', err);
    res.status(500).json({ error: safeError(err) });
  }
}
