// Garantijos API proxy – Cloudflare Worker (be papildomų npm paketų)
// Reikalauja galiojančio Firebase ID token. API raktas: ANTHROPIC_API_KEY (Secret)

const MAX_BODY_BYTES = 5 * 1024 * 1024;
const ALLOWED_ORIGIN = '*';
const FIREBASE_API_KEY = 'AIzaSyBHYfvHY2Bs0xPcwdjlQ86uYWGGH9NITLM'; // Firebase public web API key (not secret)
const DAILY_LIMIT = 10; // AI analyses per user per day

export default {
  async fetch(request, env) {

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    // ── Verify Firebase ID token via Google's lookup endpoint ─────────
    // This endpoint validates the token signature/expiry server-side at Google,
    // so we don't need to implement JWT/RSA verification ourselves.
    const authHeader = request.headers.get('Authorization') || '';
    const idToken = authHeader.replace('Bearer ', '').trim();
    if (!idToken) {
      return json({ error: 'Missing authentication token' }, 401);
    }

    let userId;
    try {
      const verifyRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        }
      );
      if (!verifyRes.ok) return json({ error: 'Invalid or expired authentication token' }, 401);
      const data = await verifyRes.json();
      const user = data.users && data.users[0];
      if (!user || !user.localId) return json({ error: 'Invalid authentication token' }, 401);
      if (!user.emailVerified) {
        return json({ error: 'Patvirtinkite el. paštą, kad galėtumėte naudoti AI analizę' }, 403);
      }
      userId = user.localId;
    } catch (e) {
      return json({ error: 'Authentication check failed' }, 401);
    }

    // ── Per-user daily rate limit via Cloudflare KV (optional) ───────
    if (env.RATE_LIMIT_KV) {
      const today = new Date().toISOString().slice(0, 10);
      const key = `rl:${userId}:${today}`;
      const current = parseInt((await env.RATE_LIMIT_KV.get(key)) || '0');
      if (current >= DAILY_LIMIT) {
        return json({ error: 'Pasiektas dienos AI analizių limitas' }, 429);
      }
      await env.RATE_LIMIT_KV.put(key, String(current + 1), { expirationTtl: 86400 });
    }

    const ct = request.headers.get('Content-Type') || '';
    if (!ct.includes('application/json')) {
      return json({ error: 'Content-Type must be application/json' }, 400);
    }

    const contentLength = parseInt(request.headers.get('Content-Length') || '0');
    if (contentLength > MAX_BODY_BYTES) {
      return json({ error: 'Payload too large' }, 413);
    }

    let body;
    try {
      const raw = await request.arrayBuffer();
      if (raw.byteLength > MAX_BODY_BYTES) return json({ error: 'Payload too large' }, 413);
      body = JSON.parse(new TextDecoder().decode(raw));
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const safe = {
      model: 'claude-sonnet-4-6',
      max_tokens: Math.min(body.max_tokens || 1000, 1000),
      messages: body.messages,
    };
    if (body.use_search) {
      safe.tools = [{ type: 'web_search_20250305', name: 'web_search' }];
    }

    if (!Array.isArray(safe.messages) || safe.messages.length === 0) {
      return json({ error: 'Invalid messages' }, 400);
    }

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(safe),
    });

    const data = await resp.json();
    return json(data, resp.status);
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    }
  });
}
