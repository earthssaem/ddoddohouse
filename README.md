# 🎲 DDODDOHOUSE — 또또하우스 보드게임 기록저장소

보드게임 플레이 기록을 저장하고 랭킹·통계를 보여주는 모바일 웹앱입니다.
원래 구글 앱스크립트(구글 시트 저장)로 배포하던 것을 **Vercel + Upstash Redis** 구조로 옮긴 버전이에요.

## 구조

```
├── index.html      # 프론트엔드 (정적 파일로 서빙)
├── api/
│   └── data.js     # 서버리스 함수: GET(불러오기) / POST(저장)
└── package.json    # @upstash/redis 의존성
```

- 데이터는 `{ games, players, logs }` JSON 한 덩어리를 Redis의 `ddoddohouse:db` 키에 통째로 저장합니다 (기존 구글 시트 방식과 동일한 구조).
- 서버 연결이 안 되면 기존처럼 `localStorage` 폴백으로 동작합니다 (OFFLINE 표시).

## Vercel 배포 방법

1. **Vercel에 프로젝트 import**
   - [vercel.com](https://vercel.com) 로그인 → **Add New → Project** → 이 GitHub 리포지토리 선택 → Deploy
   - 빌드 설정은 건드릴 필요 없어요 (Framework Preset: Other, 기본값 그대로).

2. **Upstash Redis 연결 (무료)**
   - Vercel 프로젝트 대시보드 → **Storage** 탭 → **Create Database** → **Upstash (Redis)** 선택
   - Free 플랜으로 생성 후 이 프로젝트에 **Connect** 하면 환경변수(`KV_REST_API_URL`, `KV_REST_API_TOKEN`)가 자동으로 주입됩니다.

3. **재배포**
   - 스토리지 연결 후 **Deployments** 탭에서 최신 배포를 **Redeploy** 하면 환경변수가 적용됩니다.
   - 앱 상단 상태 표시가 `ONLINE`(초록 불)이면 성공! 🎉

## 기존 구글 시트 데이터 옮기기

기존 GAS 웹앱을 열었던 브라우저에서 개발자 콘솔에 아래를 입력해 데이터를 복사한 뒤:

```js
copy(localStorage.getItem('ddoddohouse_db'))
```

새 Vercel 주소를 연 브라우저 콘솔에서 붙여넣어 저장하면 됩니다:

```js
await fetch('/api/data', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: /* 여기에 복사한 JSON 문자열 붙여넣기 */
});
location.reload();
```

## 참고

- 저장 방식은 last-write-wins (마지막 저장이 이김) — 기존 구글 시트 버전과 동일합니다. 동시에 여러 명이 기록하면 나중 저장이 덮어씁니다.
- URL을 아는 사람은 누구나 읽고 쓸 수 있습니다 (기존 GAS 웹앱과 동일). 필요하면 `api/data.js`에 간단한 비밀 키 체크를 추가할 수 있어요.
