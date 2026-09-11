import supabase from '../../db-client.js';
import { preflight, getUser, requireUser, safeError, audit } from '../../_auth.js';
import { generateText, isConfiguredFor } from '../../_ai.js';

const SYSTEM_PROMPT = `You are Modulate's helper for a bounded content workspace.
You have access to a tool registry (generate_titles, generate_hashtags, create_platform_variants, analyze_content, list_content, list_jobs, list_accounts). When you'd use a tool, describe it in one line prefixed with "tool:" and then continue explaining.
Rules:
- Never invent metrics, IDs, URLs, or account handles you have not been shown.
- Never claim a publish has happened. Only mention that a job was queued.
- If configuration is missing (OAuth for a provider, AI key), say so plainly.
- Keep answers concise and actionable.`;

export default async function handler(req, res) {
  if (preflight(req, res)) return;
  try {
    const { user } = await getUser(req);
    if (!requireUser(user, res)) return;
    let id = req.query.id;

    if (req.method === 'GET') {
      const { data } = await supabase.from('ai_messages').select('*').eq('conversation_id', id).eq('user_id', user.id).order('created_at');
      return res.status(200).json({ messages: data || [] });
    }

    if (req.method === 'POST') {
      const { content } = req.body || {};
      if (!content || typeof content !== 'string') return res.status(400).json({ error: 'content required' });

      // Auto-create conversation if id === 'new'
      if (id === 'new') {
        const { data: conv } = await supabase.from('ai_conversations').insert({ user_id: user.id, title: content.slice(0, 60) }).select('*').single();
        id = conv.id;
      }

      await supabase.from('ai_messages').insert({ conversation_id: id, user_id: user.id, role: 'user', content });

      // Load workspace context (bounded)
      const [{ data: recentContent }, { data: recentJobs }, { data: accts }] = await Promise.all([
        supabase.from('content').select('id,title,status').eq('user_id', user.id).order('updated_at', { ascending: false }).limit(5),
        supabase.from('jobs').select('id,kind,status').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
        supabase.from('connected_accounts').select('provider,handle').eq('user_id', user.id),
      ]);
      const workspaceCtx = `Workspace snapshot:\nContent (recent 5): ${JSON.stringify(recentContent || [])}\nJobs (recent 5): ${JSON.stringify(recentJobs || [])}\nConnected accounts: ${JSON.stringify(accts || [])}`;

      // Load prior messages
      const { data: prior } = await supabase.from('ai_messages').select('role,content').eq('conversation_id', id).eq('user_id', user.id).order('created_at').limit(30);

      let replyContent = '';
      let toolCalls = [];
      const configured = await isConfiguredFor(user.id);

      if (configured) {
        try {
          const messages = [
            { role: 'system', content: SYSTEM_PROMPT + '\n\n' + workspaceCtx },
            ...(prior || []).map((m) => ({ role: m.role, content: m.content })),
          ];
          replyContent = await generateText(messages, { userId: user.id, temperature: 0.5, timeoutMs: 25000, kind: 'chat' });
          toolCalls = extractTools(replyContent);
        } catch (e) {
          replyContent = draftReply(content, { recentContent, recentJobs, accts }) + `\n\n(Model call failed: ${safeError(e)}. Draft mode.)`;
        }
      } else {
        replyContent = draftReply(content, { recentContent, recentJobs, accts });
      }

      const { data: msg } = await supabase.from('ai_messages').insert({ conversation_id: id, user_id: user.id, role: 'assistant', content: replyContent, tool_calls: toolCalls }).select('*').single();
      await supabase.from('ai_conversations').update({ updated_at: new Date().toISOString() }).eq('id', id);
      await audit(user.id, 'ai.chat', { type: 'ai_conversation', id });

      return res.status(200).json({ message: msg, conversation_id: id, configured });
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('ai/chat/[id] error', err);
    res.status(500).json({ error: safeError(err) });
  }
}

function extractTools(text) {
  const lines = (text || '').split('\n').filter((l) => l.trim().toLowerCase().startsWith('tool:'));
  return lines.map((l) => {
    const rest = l.replace(/^\s*tool:\s*/i, '').trim();
    const m = rest.match(/^([a-z_.]+)\s*(?:\((.*)\))?/i);
    return { name: m?.[1] || rest, args: m?.[2] || '' };
  });
}

function draftReply(prompt, ctx) {
  const hasContent = (ctx.recentContent || []).length > 0;
  const provider = (ctx.accts || []).map((a) => a.provider).join(', ') || 'no providers yet';
  return `Here’s a plan I can execute once configuration is in place:

1. Pull your most recent content (${hasContent ? ctx.recentContent[0].title : 'nothing yet'}) into a workspace draft.
2. Generate platform-specific copy and hashtags via the AI provider.
3. Route through the approval gate before any publish job is queued.
4. Publish through: ${provider}.

tool: generate_titles(topic="${prompt.slice(0, 60)}")
tool: create_platform_variants(platforms=["youtube","tiktok"])

Note: AI provider is not configured in this environment, so I’m returning a deterministic draft. Add OPENROUTER_API_KEY to enable model calls.`;
}
