import { Redis } from '@upstash/redis';

// Vercel Marketplace(Upstash) 연결 시 자동 주입되는 환경변수 양쪽 다 지원
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'ddoddohouse:db';
const EMPTY = { games: [], players: [], logs: [] };

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = await redis.get(KEY);
      return res.status(200).json(data || EMPTY);
    }

    if (req.method === 'POST') {
      const body = req.body;
      if (
        !body ||
        !Array.isArray(body.games) ||
        !Array.isArray(body.players) ||
        !Array.isArray(body.logs)
      ) {
        return res.status(400).json({ error: 'invalid payload' });
      }
      await redis.set(KEY, { games: body.games, players: body.players, logs: body.logs });
      return res.status(200).json({ ok: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
