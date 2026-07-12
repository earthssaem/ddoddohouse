import { Redis } from '@upstash/redis';

// Vercel Marketplace(Upstash) 연결 시 자동 주입되는 환경변수 양쪽 다 지원
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'ddoddohouse:db';
const EMPTY = { games: [], players: [], logs: [], rev: 0 };
const MAX_BYTES = 1_000_000; // 저장 데이터 최대 1MB

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = await redis.get(KEY);
      return res.status(200).json(data || EMPTY);
    }

    if (req.method === 'POST') {
      // APP_SECRET 환경변수를 설정해두면, 같은 코드를 보낸 요청만 저장 허용
      const secret = process.env.APP_SECRET;
      if (secret && req.headers['x-app-key'] !== secret) {
        return res.status(401).json({ error: 'unauthorized' });
      }

      const body = req.body;
      if (
        !body ||
        !Array.isArray(body.games) ||
        !Array.isArray(body.players) ||
        !Array.isArray(body.logs)
      ) {
        return res.status(400).json({ error: 'invalid payload' });
      }

      const next = { games: body.games, players: body.players, logs: body.logs };
      if (JSON.stringify(next).length > MAX_BYTES) {
        return res.status(413).json({ error: 'payload too large' });
      }

      // 낙관적 잠금: 클라이언트가 알고 있던 rev가 서버보다 낡았으면 거절하고
      // 서버 데이터를 돌려줌 → 클라이언트가 병합 후 재시도
      const cur = await redis.get(KEY);
      const curRev = (cur && cur.rev) || 0;
      const baseRev = Number(body.rev) || 0;
      if (cur && baseRev < curRev) {
        return res.status(409).json({ error: 'conflict', data: { ...EMPTY, ...cur } });
      }

      next.rev = curRev + 1;
      await redis.set(KEY, next);
      return res.status(200).json({ ok: true, rev: next.rev });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
