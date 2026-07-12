import { Redis } from '@upstash/redis';

// Vercel Marketplace(Upstash) 연결 시 자동 주입되는 환경변수 양쪽 다 지원
const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN,
});

const KEY = 'ddoddohouse:db';
const REV_KEY = 'ddoddohouse:rev';
const EMPTY = { games: [], players: [], logs: [], rev: 0 };
const MAX_BYTES = 1_000_000; // 저장 데이터 최대 1MB

// 버전 비교와 저장을 Redis 안에서 한 번에(원자적으로) 처리 —
// 두 저장이 동시에 도착해도 하나만 통과하고 나머지는 -1(충돌)을 받는다
const CAS_SCRIPT = `
local currev = tonumber(redis.call('GET', KEYS[2]) or '0')
local base = tonumber(ARGV[2])
if base < currev then return -1 end
redis.call('SET', KEYS[1], ARGV[1])
redis.call('SET', KEYS[2], tostring(base + 1))
return base + 1
`;

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      const data = await redis.get(KEY);
      if (data) {
        // 예전 방식으로 저장된 데이터라면 rev 키를 맞춰둠
        await redis.setnx(REV_KEY, String(data.rev || 0));
      }
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

      const baseRev = Number(body.rev) || 0;
      const next = {
        games: body.games,
        players: body.players,
        logs: body.logs,
        rev: baseRev + 1,
      };
      const raw = JSON.stringify(next);
      if (raw.length > MAX_BYTES) {
        return res.status(413).json({ error: 'payload too large' });
      }

      const result = await redis.eval(CAS_SCRIPT, [KEY, REV_KEY], [raw, String(baseRev)]);
      if (result === -1) {
        // 클라이언트가 알고 있던 버전이 낡음 → 최신 데이터를 돌려줘서 병합·재시도 유도
        const cur = await redis.get(KEY);
        return res.status(409).json({ error: 'conflict', data: { ...EMPTY, ...(cur || {}) } });
      }
      return res.status(200).json({ ok: true, rev: Number(result) });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: String(e && e.message ? e.message : e) });
  }
}
