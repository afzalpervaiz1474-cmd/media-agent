// Pure helpers with no runtime side effects (safe to import from tests).
export function safeError(err) {
  const msg = typeof err?.message === 'string' ? err.message : 'Server error';
  return msg
    .replace(/sk-[A-Za-z0-9_\-]+/g, 'sk-***')
    .replace(/sb_secret_[A-Za-z0-9_\-]+/g, 'sb_secret_***');
}
