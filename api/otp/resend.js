import { preflight, getUser, requireUser, safeError, audit } from '../_auth.js';
import { resendOtp } from '../_otp.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  const { user } = await getUser(req);
  if (!requireUser(user, res)) return;

  try {
    const { provider, account_id, email, otp_id } = req.body || {};
    if (!provider || !account_id || !email) {
      return res.status(400).json({ error: 'provider, account_id, and email are required' });
    }

    const { id, code, expiresAt } = await resendOtp(user.id, provider, account_id, email, otp_id);
    await audit(user.id, 'otp.resend', { type: 'otp', provider, account_id });
    res.status(200).json({ otp_id: id, expires_at: expiresAt });
  } catch (err) {
    console.error('otp resend error', err);
    res.status(err.message.includes('Too many') ? 429 : 400).json({ error: err.message });
  }
}
