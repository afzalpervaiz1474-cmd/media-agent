// Smoke: an unreachable OmniRoute gateway must produce a clean error —
// never a crash, never a leaked token. The app-level fallback (draft /
// degraded output) lives in _jobs.js and triggers off exactly this throw.
//
// Run with dummy Supabase env (import-time client creation only; no DB call
// is made on the override path):
//   NEXT_PUBLIC_SUPABASE_URL=https://example.supabase.co SUPABASE_SERVICE_ROLE_KEY=dummy node scripts/smoke-omniroute.mjs
import { generateText } from '../lib/server/_ai_manager.js';
import { envDefaults } from '../lib/server/_ai_registry.js';

const TOKEN = 'smoke-test-token';
let pass = 0;
let total = 0;
function check(name, ok) {
  total++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${name}`);
  if (ok) pass++;
  else process.exitCode = 1;
}

process.env.OMNIROUTE_API_KEY = TOKEN;
const cand = envDefaults().find((e) => e.provider === 'omniroute');
check('envDefaults exposes omniroute candidate (model auto)', cand?.model === 'auto' && cand?.base_url === 'http://localhost:20128/v1');

let err = null;
try {
  await generateText(null, {
    messages: [{ role: 'user', content: 'hi' }],
    override: { source: 'env', provider: 'omniroute', model: 'auto', base_url: 'http://127.0.0.1:9/v1', _key: TOKEN },
  });
} catch (e) { err = e; }
check('unreachable gateway throws instead of crashing', !!err);
check('error does not leak the token', !!err && !String(err.message).includes(TOKEN));

console.log(pass === total ? '\nSMOKE PASSED: all checks green.' : '\nSMOKE FAILED.');
