# 5010 Content Tracker

주식회사 오공일공(5010.tech)의 브랜드 멘션 모니터링 + SEO 순위 추적 시스템.

- **v0 (현재)**: Naver 뉴스/블로그/카페 수집 → Claude 위험도 분류 → Discord 알림 + 대시보드
- v1: AWS Amplify 배포 + EventBridge cron + Google News
- v2: SEO 순위 추적 (Naver/Google)
- v3: Playwright 워커로 X/IG/Threads

전체 설계는 `/Users/sam/.claude/plans/composed-nibbling-karp.md` 참고.

---

## 빠른 시작

### 0. 사전 준비 (외부 키/계정)

| 항목 | 발급처 | v0 필수 |
|---|---|---|
| Docker Desktop | https://docs.docker.com/desktop/ | ✅ (로컬 Postgres) |
| Naver Developers Client ID/Secret | https://developers.naver.com → Application → "검색" API | ✅ |
| Anthropic API Key | https://console.anthropic.com | ✅ (브랜드 멘션 분류) |
| Discord Webhook URL | 알림 채널 설정 > 연동 > 웹후크 | ✅ |
| SerpAPI Key | https://serpapi.com (무료 100회/월) | ⭕ 선택 (Google SEO 미사용 시 skip) |

배포 단계에서 Postgres는 Neon/RDS/Supabase 중 택1 (v1에서 결정).

### 1. 로컬 Postgres 띄우기

```bash
docker compose up -d
# 컨테이너 상태 확인
docker compose ps
```

`postgresql://tracker:tracker@localhost:5432/content_tracker` 로 접속됨. 데이터는 도커 볼륨 `tracker_pgdata`에 영속화.

내리고 싶으면 `docker compose down`, 데이터까지 지우려면 `docker compose down -v`.

### 2. 설치 + 환경변수

```bash
pnpm install
cp .env.example .env.local
# .env.local 의 NAVER_*, ANTHROPIC_API_KEY, DISCORD_WEBHOOK_URL 채우기
# DATABASE_URL/DIRECT_URL 은 .env.example 기본값 그대로 OK (로컬 도커용)
```

### 3. DB 마이그레이션 + 시드

```bash
pnpm db:migrate
pnpm db:seed
```

기본 시드 키워드: `주식회사 오공일공`, `오공일공`, `팀 오공일공`, `5010.tech`. 추후 `/keywords` 페이지에서 추가/수정.

### 4. 로컬 실행

```bash
pnpm dev
```

- 대시보드: http://localhost:3000
- 멘션 목록: /mentions
- 키워드 관리: /keywords

### 5. 수집/측정 트리거 (수동)

**브랜드 멘션 수집 (Naver 뉴스/블로그/카페 → Claude 분류 → Discord 알림):**
```bash
curl http://localhost:3000/api/cron/collect
```
응답 예: `{ "ok": true, "newMentions": 7, "classified": 7, "notified": 2 }`

**SEO 순위 측정 (Naver web SERP + 선택: Google via SerpAPI):**
```bash
curl http://localhost:3000/api/cron/seo
```
응답 예: `{ "ok": true, "naverMeasured": 9, "googleMeasured": 3, "googleSkipped": 6 }`

- 핵심 키워드 3개(`자동매매 프로그램`, `비트코인 자동매매`, `5010 퀀트`)는 Google 매일 측정
- 나머지는 요일 로테이션 (주 1회) → SerpAPI 무료 100회/월 한도 안에 맞춤
- `SERPAPI_KEY` 비어있으면 Google은 전부 skip, Naver만 측정

---

## 검증 체크리스트 (v0)

- [ ] `pnpm db:migrate` 통과, Supabase에 5개 테이블 생성
- [ ] `pnpm db:seed` 후 `/keywords`에 4개 키워드 표시
- [ ] `curl localhost:3000/api/cron/collect` 호출 시 `newMentions > 0`
- [ ] `/mentions`에서 위험도 뱃지 표시되는 행 확인
- [ ] `medium` 이상 위험도면 Discord 채널에 임베드 메시지 도착
- [ ] 같은 cron을 두 번 호출해도 두 번째는 `newMentions: 0` (중복 차단)
- [ ] `curl localhost:3000/api/cron/seo` → 9개 키워드 다 `naverMeasured`에 포함
- [ ] `/seo` 페이지에서 키워드별 Naver 순위 + 변화(▲/▼) + 상위 노출 펼침 표시
- [ ] `/seo`에서 키워드 행의 "생성하기" 버튼 → Claude가 상위 노출 분석 + 콘텐츠 글감 3~6개 + 키워드 전략 반환 (7일 캐시, "다시 생성"으로 강제 갱신)

---

## 구조

```
app/                       # Next.js App Router
  api/cron/collect/        # 수집 → 분류 → 알림 cron 엔드포인트
  mentions/                # 멘션 목록 + 상세
  seo/                     # SEO 순위 (v2)
  keywords/                # 키워드 CRUD
lib/
  collectors/naver.ts      # Naver 검색 API
  classifier/claude.ts     # Claude 위험도 분류 (prompt caching)
  notifier/discord.ts      # Discord webhook + AlertLog
  dedupe.ts                # URL 기반 신규 필터
  db.ts                    # Prisma client
prisma/
  schema.prisma
  seed.ts
scripts/
  run-collect.ts           # tsx로 직접 실행하는 수집 잡
```

---

## 배포 (v1)

AWS Amplify Hosting + EventBridge cron:

1. GitHub repo 푸시
2. Amplify 콘솔에서 Next.js (SSR) 앱으로 연결
3. 환경변수 등록 (`.env.example` 항목 전부)
4. 빌드 명령: `pnpm build` (이미 `prisma generate` 포함)
5. EventBridge 규칙 생성:
   - cron(0 23,5,11 * * ? *) — UTC = KST 08/14/20
   - 타깃: API Gateway → `/api/cron/collect`
   - 헤더 `x-cron-secret: $CRON_SECRET` 포함
