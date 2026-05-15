"use client";

import React, { useMemo, useState } from "react";
import { Sparkline, type SparkPoint } from "./Sparkline";
import { SuggestForm, InProgressBadge } from "./SuggestForm";

const GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

export type SnapshotLite = {
  rank: number | null;
  url: string | null;
  marketSize: number | null;
  snapshotAt: string;
};

export type SerpResult = {
  rank: number;
  url: string;
  title: string;
  snippet?: string;
  channel: "web" | "blog" | "news";
};

export type ContentIdea = {
  title: string;
  format: string;
  outline: string[];
  targetKeywords: string[];
  angle: string;
  priority: "high" | "medium" | "low";
};

export type SuggestionView = {
  analysis: string;
  contentIdeas: ContentIdea[];
  strategy: string;
  updatedAt: string;
};

export type KeywordCardData = {
  id: number;
  term: string;
  naverLatest: SnapshotLite | null;
  naverPrevious: { rank: number | null } | null;
  naverHistory: { snapshotAt: string; rank: number | null }[];
  googleLatest: SnapshotLite | null;
  googlePrevious: { rank: number | null } | null;
  googleHistory: { snapshotAt: string; rank: number | null }[];
  topResults: SerpResult[];
  topResultsEngine: "naver" | "google" | null;
  suggestion: SuggestionView | null;
  generatingSince: string | null;
};

type SortKey =
  | "id"
  | "naver_rank_asc"
  | "change_desc"
  | "market_size_desc"
  | "market_size_asc"
  | "last_measured_desc";

type GroupMode = "none" | "rank" | "difficulty";

type RankBucket = "top10" | "top30" | "out" | "unmeasured";
const RANK_GROUP_LABELS: Record<RankBucket, string> = {
  top10: "Top 10 — 즉시 노출",
  top30: "11~30위 — 조금만 더",
  out: "30위 밖 — 콘텐츠 작업 필요",
  unmeasured: "측정 전",
};

type DifficultyTier = "very_easy" | "easy" | "medium" | "hard" | "unknown";

const TIER_INFO: Record<DifficultyTier, { label: string; short: string; description: string }> = {
  very_easy: { label: "매우 쉬움", short: "매우 쉬움", description: "phrase < 100건 · 콘텐츠 1개로 즉시 1위" },
  easy: { label: "쉬움", short: "쉬움", description: "100~500건 · 콘텐츠 1~2개로 충분" },
  medium: { label: "중간", short: "중간", description: "500~5,000건 · 전략 필요" },
  hard: { label: "어려움", short: "어려움", description: "5,000건+ · 장기 SEO" },
  unknown: { label: "미측정", short: "미측정", description: "아직 측정 데이터 없음" },
};

function difficultyTier(marketSize: number | null | undefined): DifficultyTier {
  if (marketSize == null || marketSize <= 0) return "unknown";
  if (marketSize < 100) return "very_easy";
  if (marketSize < 500) return "easy";
  if (marketSize < 5000) return "medium";
  return "hard";
}

const DIFFICULTY_ORDER: DifficultyTier[] = [
  "very_easy",
  "easy",
  "medium",
  "hard",
  "unknown",
];

function DifficultyBadge({ tier }: { tier: DifficultyTier }) {
  return (
    <span className={`tier-badge tier-${tier}`} title={TIER_INFO[tier].description}>
      {TIER_INFO[tier].short}
    </span>
  );
}

function formatMarketSize(n: number | null | undefined): string {
  if (!n || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M건`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k건`;
  return `${n}건`;
}

function rankClass(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return "out";
  if (rank <= 10) return "top10";
  if (rank <= 30) return "top30";
  return "out";
}

function rankLabel(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return "30위 밖";
  return `${rank}위`;
}

function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "측정 전";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  const days = Math.floor(h / 24);
  return `${days}일 전`;
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function rankBucketOf(snapshot: SnapshotLite | null): RankBucket {
  if (!snapshot) return "unmeasured";
  if (snapshot.rank === null) return "out";
  if (snapshot.rank <= 10) return "top10";
  if (snapshot.rank <= 30) return "top30";
  return "out";
}

function changeScore(latest: SnapshotLite | null, prev: { rank: number | null } | null): number {
  if (!latest || !prev) return 0;
  // 상승(prev > curr) 클수록 큰 양수.
  const curr = latest.rank ?? 101;
  const p = prev.rank ?? 101;
  return p - curr;
}

function EngineCell({
  latest,
  previous,
  measured,
}: {
  latest: SnapshotLite | null;
  previous: { rank: number | null } | null;
  measured: boolean;
}) {
  if (!measured) {
    return (
      <span className="rank-pill unmeasured">
        <span className="num">—</span>
        <span className="delta">대기</span>
      </span>
    );
  }
  const cls = rankClass(latest?.rank);
  const label = rankLabel(latest?.rank);
  if (!latest) {
    return (
      <span className="rank-pill unmeasured">
        <span className="num">—</span>
      </span>
    );
  }
  const curr = latest.rank;
  const prev = previous?.rank;

  let deltaEl: React.ReactNode = null;
  if (prev !== undefined) {
    if (curr === null && prev === null) {
      // 둘 다 30위 밖
    } else if (curr === null) {
      deltaEl = <span className="delta">▼ out</span>;
    } else if (prev === null) {
      deltaEl = <span className="delta">신규</span>;
    } else {
      const delta = prev - curr;
      if (delta > 0) deltaEl = <span className="delta">▲ {delta}</span>;
      else if (delta < 0) deltaEl = <span className="delta">▼ {Math.abs(delta)}</span>;
    }
  }

  return (
    <span className={`rank-pill ${cls}`}>
      <span className="num">{label}</span>
      {deltaEl}
    </span>
  );
}

function TopResultsTable({
  results,
  engine,
  ownDomain,
}: {
  results: SerpResult[];
  engine: "naver" | "google" | null;
  ownDomain: string;
}) {
  const [showAll, setShowAll] = useState(false);
  if (results.length === 0) return null;
  const limit = showAll ? results.length : Math.min(10, results.length);
  const visible = results.slice(0, limit);

  return (
    <div className="top-results">
      <table>
        <thead>
          <tr>
            <th style={{ width: 36 }}>#</th>
            <th>제목</th>
            <th style={{ width: 130 }}>도메인</th>
            {engine === "naver" && <th style={{ width: 60 }}>채널</th>}
          </tr>
        </thead>
        <tbody>
          {visible.map((r, i) => {
            const isSelf = ownDomain && domainOf(r.url).includes(ownDomain);
            return (
              <tr key={i} className={isSelf ? "self" : undefined}>
                <td className="faint">{r.rank}</td>
                <td>
                  <a href={r.url} target="_blank" rel="noopener noreferrer">
                    {r.title}
                  </a>
                </td>
                <td className="faint" style={{ fontSize: 12 }}>
                  {domainOf(r.url)}
                </td>
                {engine === "naver" && (
                  <td>
                    <span className={`channel-pill ch-${r.channel}`}>{r.channel}</span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      {results.length > 10 && (
        <button
          type="button"
          className="ghost small"
          onClick={() => setShowAll((v) => !v)}
          style={{ marginTop: 8 }}
        >
          {showAll ? "10개만 보기" : `+ ${results.length - 10}개 더 보기`}
        </button>
      )}
    </div>
  );
}

function Card({ kw, ownDomain }: { kw: KeywordCardData; ownDomain: string }) {
  const sug = kw.suggestion;
  const ideas = sug?.contentIdeas ?? [];
  const generating =
    kw.generatingSince &&
    Date.now() - new Date(kw.generatingSince).getTime() < GENERATION_TIMEOUT_MS;

  const lastSnap =
    [kw.naverLatest, kw.googleLatest]
      .filter((s): s is SnapshotLite => s !== null)
      .sort((a, b) => new Date(b.snapshotAt).getTime() - new Date(a.snapshotAt).getTime())[0]
      ?.snapshotAt ?? null;

  const naverSpark: SparkPoint[] = kw.naverHistory.map((p) => ({
    snapshotAt: p.snapshotAt,
    rank: p.rank,
  }));

  const tier = difficultyTier(kw.naverLatest?.marketSize);

  return (
    <article className="seo-card">
      <div className="seo-card-head">
        <div className="term">
          {kw.term}
          <DifficultyBadge tier={tier} />
        </div>
        <div className="when">{timeAgo(lastSnap)}</div>
      </div>

      <div className="seo-engines">
        <div className="engine-block">
          <div className="label">Naver · {formatMarketSize(kw.naverLatest?.marketSize)}</div>
          <EngineCell
            latest={kw.naverLatest}
            previous={kw.naverPrevious}
            measured={kw.naverLatest !== null}
          />
        </div>
        <div className="engine-block">
          <div className="label">Google · {formatMarketSize(kw.googleLatest?.marketSize)}</div>
          <EngineCell
            latest={kw.googleLatest}
            previous={kw.googlePrevious}
            measured={kw.googleLatest !== null}
          />
        </div>
      </div>

      <Sparkline points={naverSpark} label="N · 14일" />

      {kw.naverLatest?.url && (
        <div
          className="faint"
          style={{
            marginTop: 8,
            marginBottom: 4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          → <a href={kw.naverLatest.url} target="_blank" rel="noopener noreferrer">
            {kw.naverLatest.url}
          </a>
        </div>
      )}

      {kw.topResults.length > 0 && (
        <details style={{ marginTop: 10 }}>
          <summary>
            상위 노출 보기{" "}
            <span className="faint">
              ({kw.topResultsEngine === "google" ? "Google" : "Naver"} Top{" "}
              {kw.topResults.length})
            </span>
          </summary>
          <TopResultsTable
            results={kw.topResults}
            engine={kw.topResultsEngine}
            ownDomain={ownDomain}
          />
        </details>
      )}

      <div className="suggest-row">
        {generating && kw.generatingSince ? (
          <InProgressBadge startedAt={new Date(kw.generatingSince)} />
        ) : !sug ? (
          <>
            <span className="status">AI 콘텐츠 제안 없음</span>
            <SuggestForm keywordId={kw.id} label="제안 생성" />
          </>
        ) : (
          <details style={{ width: "100%" }}>
            <summary>
              <span style={{ color: "var(--accent)", fontWeight: 600 }}>
                AI 제안 {ideas.length}개
              </span>{" "}
              <span className="faint">· {timeAgo(sug.updatedAt)}</span>
            </summary>
            <div className="suggestion-box">
              <h4>분석</h4>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{sug.analysis}</p>

              <h4>콘텐츠 아이디어</h4>
              {ideas.map((idea, i) => (
                <div className="idea-item" key={i}>
                  <div className="title-row">
                    <span className="title-text">
                      {i + 1}. {idea.title}
                    </span>
                    <span
                      className={`badge ${idea.priority === "high" ? "critical" : idea.priority === "medium" ? "high" : "low"}`}
                    >
                      {idea.priority}
                    </span>
                    <span className="meta">· {idea.format}</span>
                  </div>
                  <div className="meta" style={{ marginTop: 4 }}>
                    {idea.angle}
                  </div>
                  <details style={{ marginTop: 6 }}>
                    <summary className="meta">아웃라인 + 키워드</summary>
                    <ul style={{ margin: "6px 0", paddingLeft: 18, fontSize: 13 }}>
                      {idea.outline.map((o, j) => (
                        <li key={j}>{o}</li>
                      ))}
                    </ul>
                    <div className="meta">타깃: {idea.targetKeywords.join(", ")}</div>
                  </details>
                </div>
              ))}

              <h4>전략</h4>
              <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{sug.strategy}</p>

              <div style={{ marginTop: 14 }}>
                <SuggestForm
                  keywordId={kw.id}
                  force={true}
                  label="다시 생성"
                  variant="ghost"
                />
              </div>
            </div>
          </details>
        )}
      </div>
    </article>
  );
}

export function SeoBoard({
  keywords,
  ownDomain,
}: {
  keywords: KeywordCardData[];
  ownDomain: string;
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("market_size_asc");
  const [groupMode, setGroupMode] = useState<GroupMode>("difficulty");

  // 난이도별 카운트 (요약 칩)
  const tierCounts = useMemo(() => {
    const c: Record<DifficultyTier, number> = {
      very_easy: 0,
      easy: 0,
      medium: 0,
      hard: 0,
      unknown: 0,
    };
    for (const k of keywords) {
      c[difficultyTier(k.naverLatest?.marketSize)] += 1;
    }
    return c;
  }, [keywords]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let result = keywords;
    if (q) result = result.filter((k) => k.term.toLowerCase().includes(q));

    const sorted = [...result].sort((a, b) => {
      switch (sort) {
        case "id":
          return a.id - b.id;
        case "naver_rank_asc": {
          const ra = a.naverLatest?.rank ?? 9999;
          const rb = b.naverLatest?.rank ?? 9999;
          return ra - rb;
        }
        case "change_desc":
          return changeScore(b.naverLatest, b.naverPrevious) - changeScore(a.naverLatest, a.naverPrevious);
        case "market_size_desc": {
          const ma = a.naverLatest?.marketSize ?? 0;
          const mb = b.naverLatest?.marketSize ?? 0;
          return mb - ma;
        }
        case "market_size_asc": {
          // null/0은 끝으로
          const ma = a.naverLatest?.marketSize ?? Number.POSITIVE_INFINITY;
          const mb = b.naverLatest?.marketSize ?? Number.POSITIVE_INFINITY;
          return ma - mb;
        }
        case "last_measured_desc": {
          const ta = a.naverLatest ? new Date(a.naverLatest.snapshotAt).getTime() : 0;
          const tb = b.naverLatest ? new Date(b.naverLatest.snapshotAt).getTime() : 0;
          return tb - ta;
        }
      }
    });
    return sorted;
  }, [keywords, query, sort]);

  const groupedView = useMemo(() => {
    if (groupMode === "none") return null;

    if (groupMode === "rank") {
      const bins: Record<RankBucket, KeywordCardData[]> = {
        top10: [],
        top30: [],
        out: [],
        unmeasured: [],
      };
      for (const k of filtered) bins[rankBucketOf(k.naverLatest)].push(k);
      const order: RankBucket[] = ["top10", "top30", "out", "unmeasured"];
      return order
        .filter((b) => bins[b].length > 0)
        .map((b) => ({ key: b, label: RANK_GROUP_LABELS[b], items: bins[b] }));
    }

    // difficulty
    const bins: Record<DifficultyTier, KeywordCardData[]> = {
      very_easy: [],
      easy: [],
      medium: [],
      hard: [],
      unknown: [],
    };
    for (const k of filtered) bins[difficultyTier(k.naverLatest?.marketSize)].push(k);
    return DIFFICULTY_ORDER.filter((t) => bins[t].length > 0).map((t) => ({
      key: t,
      label: `${TIER_INFO[t].label} — ${TIER_INFO[t].description}`,
      items: bins[t],
    }));
  }, [filtered, groupMode]);

  return (
    <>
      <div className="tier-summary">
        {DIFFICULTY_ORDER.filter((t) => tierCounts[t] > 0).map((t) => (
          <div key={t} className={`tier-chip tier-${t}`}>
            <span className="tier-chip-label">{TIER_INFO[t].label}</span>
            <strong className="tier-chip-count">{tierCounts[t]}</strong>
          </div>
        ))}
      </div>

      <div className="seo-controls">
        <input
          type="search"
          placeholder="키워드 검색…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ minWidth: 220 }}
        />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
          <option value="market_size_asc">쉬운 순 (마켓 작은 순)</option>
          <option value="market_size_desc">시장 큰 순</option>
          <option value="naver_rank_asc">Naver 순위 낮은 순</option>
          <option value="change_desc">최근 상승순</option>
          <option value="last_measured_desc">최근 측정 순</option>
          <option value="id">시드 순</option>
        </select>
        <select value={groupMode} onChange={(e) => setGroupMode(e.target.value as GroupMode)}>
          <option value="difficulty">난이도별 그룹</option>
          <option value="rank">순위별 그룹</option>
          <option value="none">그룹 없음</option>
        </select>
        <span className="faint" style={{ marginLeft: "auto" }}>
          {filtered.length} / {keywords.length} 표시
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="empty-state">검색 결과가 없습니다.</p>
      ) : groupedView ? (
        <>
          {groupedView.map((group) => (
            <React.Fragment key={group.key}>
              <h2 className="group-header">
                {group.label}{" "}
                <span className="faint" style={{ fontSize: 14, fontWeight: 400 }}>
                  ({group.items.length}개)
                </span>
              </h2>
              <div className="grid grid-seo">
                {group.items.map((k) => (
                  <Card key={k.id} kw={k} ownDomain={ownDomain} />
                ))}
              </div>
            </React.Fragment>
          ))}
        </>
      ) : (
        <div className="grid grid-seo">
          {filtered.map((k) => (
            <Card key={k.id} kw={k} ownDomain={ownDomain} />
          ))}
        </div>
      )}
    </>
  );
}
