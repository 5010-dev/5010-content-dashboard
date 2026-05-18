import { prisma } from "@/lib/db";
import { SeoBoard, type KeywordCardData, type SerpResult, type SnapshotLite } from "./SeoBoard";

export const dynamic = "force-dynamic";

const HISTORY_DAYS = 14;

type Engine = "naver" | "google";

function asSnapshotLite(r: {
  rank: number | null;
  url: string | null;
  marketSize: number | null;
  snapshotAt: Date;
}): SnapshotLite {
  return {
    rank: r.rank,
    url: r.url,
    marketSize: r.marketSize,
    snapshotAt: r.snapshotAt.toISOString(),
  };
}

export default async function SeoPage() {
  const ownDomain = process.env.OWN_DOMAIN ?? "5010.tech";

  const keywords = await prisma.keyword.findMany({
    where: { category: "seo", active: true },
    orderBy: { id: "asc" },
    include: { suggestion: true },
  });

  const keywordIds = keywords.map((k) => k.id);
  const since = new Date(Date.now() - HISTORY_DAYS * 24 * 60 * 60 * 1000);

  // 14일치 히스토리 (스파크라인 + 변화 계산용). topResults는 용량 크니까 제외.
  const history = keywordIds.length
    ? await prisma.seoRanking.findMany({
        where: { keywordId: { in: keywordIds }, snapshotAt: { gte: since } },
        orderBy: { snapshotAt: "asc" },
        select: {
          keywordId: true,
          engine: true,
          rank: true,
          url: true,
          marketSize: true,
          snapshotAt: true,
        },
      })
    : [];

  // 최신 1건은 별도 쿼리(topResults 포함). 키워드당 엔진별 1건씩.
  // Prisma `distinct` + `orderBy desc`로 (keywordId, engine) 그룹의 최신 row만 가져옴.
  const latestRows =
    keywordIds.length === 0
      ? []
      : await prisma.seoRanking.findMany({
          where: {
            keywordId: { in: keywordIds },
            snapshotAt: { gte: since },
          },
          orderBy: { snapshotAt: "desc" },
          distinct: ["keywordId", "engine"],
          select: {
            keywordId: true,
            engine: true,
            rank: true,
            url: true,
            marketSize: true,
            snapshotAt: true,
            topResults: true,
          },
        });

  // 키워드별로 데이터 묶기
  const byKw = new Map<number, {
    naverHist: typeof history;
    googleHist: typeof history;
    naverLatest: (typeof latestRows)[number] | null;
    googleLatest: (typeof latestRows)[number] | null;
  }>();
  for (const id of keywordIds) {
    byKw.set(id, {
      naverHist: [],
      googleHist: [],
      naverLatest: null,
      googleLatest: null,
    });
  }
  for (const r of history) {
    const slot = byKw.get(r.keywordId);
    if (!slot) continue;
    if (r.engine === "naver") slot.naverHist.push(r);
    else if (r.engine === "google") slot.googleHist.push(r);
  }
  for (const r of latestRows) {
    const slot = byKw.get(r.keywordId);
    if (!slot) continue;
    if (r.engine === "naver") slot.naverLatest = r;
    else if (r.engine === "google") slot.googleLatest = r;
  }

  // 카드 데이터로 변환 (JSON-safe)
  const cardData: KeywordCardData[] = keywords.map((kw) => {
    const slot = byKw.get(kw.id)!;
    const naverHist = slot.naverHist; // asc by snapshotAt
    const googleHist = slot.googleHist;

    const naverLatest = slot.naverLatest ? asSnapshotLite(slot.naverLatest) : null;
    const googleLatest = slot.googleLatest ? asSnapshotLite(slot.googleLatest) : null;

    // 직전 측정 (변화 계산용) = history 끝에서 2번째
    const naverPrev =
      naverHist.length >= 2 ? { rank: naverHist[naverHist.length - 2].rank } : null;
    const googlePrev =
      googleHist.length >= 2 ? { rank: googleHist[googleHist.length - 2].rank } : null;

    // 상위 노출은 Naver 우선, 없으면 Google
    let topResults: SerpResult[] = [];
    let topResultsEngine: Engine | null = null;
    const sourceLatest = slot.naverLatest ?? slot.googleLatest;
    if (sourceLatest && sourceLatest.topResults) {
      topResults = sourceLatest.topResults as unknown as SerpResult[];
      topResultsEngine = sourceLatest.engine as Engine;
    }

    return {
      id: kw.id,
      term: kw.term,
      naverLatest,
      naverPrevious: naverPrev,
      naverHistory: naverHist.map((p) => ({
        snapshotAt: p.snapshotAt.toISOString(),
        rank: p.rank,
      })),
      googleLatest,
      googlePrevious: googlePrev,
      googleHistory: googleHist.map((p) => ({
        snapshotAt: p.snapshotAt.toISOString(),
        rank: p.rank,
      })),
      topResults,
      topResultsEngine,
      suggestion: kw.suggestion
        ? {
            analysis: kw.suggestion.analysis,
            contentIdeas: kw.suggestion.contentIdeas as KeywordCardData["suggestion"] extends infer S
              ? S extends { contentIdeas: infer C }
                ? C
                : never
              : never,
            strategy: kw.suggestion.strategy,
            updatedAt: kw.suggestion.updatedAt.toISOString(),
          }
        : null,
      generatingSince: kw.suggestionGeneratingSince
        ? kw.suggestionGeneratingSince.toISOString()
        : null,
      lastError: kw.suggestionLastError ?? null,
      lastErrorAt: kw.suggestionLastErrorAt
        ? kw.suggestionLastErrorAt.toISOString()
        : null,
    };
  });

  // 요약 메트릭 (Naver 기준)
  let topTen = 0;
  let topThirty = 0;
  let outOf = 0;
  let measuredTotal = 0;
  for (const k of cardData) {
    if (!k.naverLatest) continue;
    measuredTotal += 1;
    if (k.naverLatest.rank === null) outOf += 1;
    else if (k.naverLatest.rank <= 10) topTen += 1;
    else if (k.naverLatest.rank <= 30) topThirty += 1;
    else outOf += 1;
  }

  return (
    <>
      <h1>SEO 순위</h1>
      <p className="muted">
        자사 도메인 <code>{ownDomain}</code> · 네이버 web SERP 매일 · 구글(SerpAPI) 일 8개 로테이션 · 14일 추이
      </p>

      <div className="grid grid-summary" style={{ marginTop: 20 }}>
        <div className="card card-compact">
          <h3>네이버 Top 10</h3>
          <div className="metric-num">
            {topTen}
            <span className="metric-sub" style={{ marginLeft: 8 }}>
              / {keywords.length}
            </span>
          </div>
          <div className="metric-sub">즉시 노출 가능</div>
        </div>
        <div className="card card-compact">
          <h3>11~30위</h3>
          <div className="metric-num">{topThirty}</div>
          <div className="metric-sub">조금만 더 끌어올리면 됨</div>
        </div>
        <div className="card card-compact">
          <h3>30위 밖</h3>
          <div className="metric-num">{outOf}</div>
          <div className="metric-sub">콘텐츠 작업 필요</div>
        </div>
        <div className="card card-compact">
          <h3>측정 키워드</h3>
          <div className="metric-num">
            {measuredTotal}
            <span className="metric-sub" style={{ marginLeft: 8 }}>
              / {keywords.length}
            </span>
          </div>
          <div className="metric-sub">전체 추적 키워드</div>
        </div>
      </div>

      {keywords.length === 0 ? (
        <p className="empty-state">
          SEO 카테고리 키워드가 없습니다. <a href="/keywords">/keywords</a> 에서 추가하세요.
        </p>
      ) : (
        <>
          <h2>키워드별 순위</h2>
          <SeoBoard keywords={cardData} ownDomain={ownDomain} />
        </>
      )}
    </>
  );
}
