import { preflight, getUser, requireUser, safeError, audit } from '../_auth.js';
import { verifyOtp } from '../_otp.js';

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  const { user } = await getUser(req);
  if (!requireUser(user, res)) return;

  try {
    const { otp_id, code } = req.body || {};
    if (!otp_id || !code) {
      return res.status(400).json({ error: 'otp_id and code are required' });
    }

    const result = await verifyOtp(code, otp_id);
    await audit(user.id, 'otp.verify', { type: 'otp', otp_id });
    res.status(200).json(result);
  } catch (err) {
    console.error('otp verify error', err);
    res.status(400).json({ error: err.message });
  }
}
