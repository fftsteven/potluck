import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = "potluck:claims";
const ITEMS = { corn: 3, salad: 3, white: 2, red: 2, gin: 1, verm: 1, bread: 2, pie: 2 };
const ID_RE = /^[a-z0-9]{20,40}$/;

async function all() {
  const raw = (await redis.hgetall(KEY)) || {};
  const out = {};
  for (const [id, v] of Object.entries(raw)) {
    try { out[id] = typeof v === "string" ? JSON.parse(v) : v; } catch { /* skip bad row */ }
  }
  return out;
}

// Hide other guests' ids unless the owner is asking, so nobody can overwrite someone else's entry.
function view(claims, me, isAdmin) {
  const out = {};
  let n = 0;
  for (const [id, v] of Object.entries(claims)) {
    const key = isAdmin || id === me ? id : `g${n++}`;
    out[key] = { name: v.name, items: v.items, extras: v.extras };
  }
  return out;
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const admin = process.env.ADMIN_KEY;
  const isAdmin = !!admin && (req.query.admin === admin);

  try {
    if (req.method === "GET") {
      return res.status(200).json({ claims: view(await all(), null, isAdmin) });
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      const { id } = body;
      if (!ID_RE.test(id || "")) return res.status(400).json({ error: "Bad id" });

      const name = String(body.name || "").trim().slice(0, 60);
      if (!name) return res.status(400).json({ error: "Add your name first." });

      const items = {};
      for (const k of Object.keys(ITEMS)) {
        const n = Math.max(0, Math.floor(+((body.items || {})[k]) || 0));
        if (n) items[k] = n;
      }
      const extras = (Array.isArray(body.extras) ? body.extras : [])
        .map((x) => String(x).trim().slice(0, 140)).filter(Boolean).slice(0, 20);

      const wanted = { ...items };
      const claims = await all();
      for (const [k, cap] of Object.entries(ITEMS)) {
        const taken = Object.entries(claims)
          .filter(([cid]) => cid !== id)
          .reduce((t, [, v]) => t + (+(v.items || {})[k] || 0), 0);
        if ((items[k] || 0) > cap - taken) items[k] = Math.max(0, cap - taken);
        if (!items[k]) delete items[k];
      }

      const row = { name, items, extras, at: Date.now() };
      await redis.hset(KEY, { [id]: JSON.stringify(row) });
      claims[id] = row;
      const trimmed = Object.keys(wanted).some((k) => (items[k] || 0) < wanted[k]);
      return res.status(trimmed ? 409 : 200).json({
        claims: view(claims, id, isAdmin),
        ...(trimmed ? { error: "Someone just grabbed one of those. Updated the list." } : {}),
      });
    }

    if (req.method === "DELETE") {
      if (!isAdmin) return res.status(403).json({ error: "Not allowed" });
      const id = String(req.query.id || "");
      await redis.hdel(KEY, id);
      return res.status(200).json({ ok: true });
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).end();
  } catch (e) {
    return res.status(500).json({ error: "Server error" });
  }
}
