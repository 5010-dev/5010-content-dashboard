import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type RiskLevel = "low" | "medium" | "high" | "critical";

export default async function Home() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [riskCounts, recent, totalMentions, activeKeywords, seoKeywords] = await Promise.all([
    prisma.riskAssessment.groupBy({
      by: ["riskLevel"],
      where: { createdAt: { gte: since } },
      _count: true,
    }),
    prisma.mention.findMany({
      where: { fetchedAt: { gte: since } },
      orderBy: { fetchedAt: "desc" },
      take: 8,
      include: { assessment: true, keyword: true },
    }),
    prisma.mention.count(),
    prisma.keyword.count({ where: { active: true } }),
    prisma.keyword.findMany({
      where: { category: "seo", active: true },
      orderBy: { id: "asc" },
    }),
  ]);

  // SEO 건강도: 키워드별 최근 Naver 순위
  const latestNaverRows = await prisma.seoRanking.findMany({
    where: { engine: "naver", keywordId: { in: seoKeywords.map((k) => k.id) } },
    orderBy: { snapshotAt: "desc" },
    distinct: ["keywordId"],
    select: { keywordId: true, rank: true, url: true, snapshotAt: true },
  });

  let topTen = 0;
  let topThirty = 0;
  let outOf = 0;
  for (const r of latestNaverRows) {
    if (r.rank === null) outOf += 1;
    else if (r.rank <= 10) topTen += 1;
    else if (r.rank <= 30) topThirty += 1;
    else outOf += 1;
  }
  const measuredCount = latestNaverRows.length;
  const seoTotal = seoKeywords.length;

  const countByLevel = (lvl: RiskLevel) =>
    riskCounts.find((r) => r.riskLevel === lvl)?._count ?? 0;
  const criticalOrHigh = countByLevel("critical") + countByLevel("high");

  return (
    <>
      <h1>대시보드</h1>
      <p className="muted">최근 7일 기준 · 5010 콘텐츠 트래커</p>

      <div className="grid grid-summary" style={{ marginTop: 20 }}>
        <div className="card card-compact">
          <h3>긴급/위험 멘션</h3>
          <div className="metric-num" style={{ color: criticalOrHigh > 0 ? "var(--risk-critical)" : "var(--text)" }}>
            {criticalOrHigh}
          </div>
          <div className="metric-sub">
            critical {countByLevel("critical")} · high {countByLevel("high")}
          </div>
        </div>

        <div className="card card-compact">
          <h3>주의 멘션</h3>
          <div className="metric-num">{countByLevel("medium")}</div>
          <div className="metric-sub">사실 오인·오해 소지</div>
        </div>

        <div className="card card-compact">
          <h3>SEO Top 10</h3>
          <div className="metric-num">
            {topTen}
            <span className="metric-sub" style={{ marginLeft: 8 }}>/ {seoTotal}</span>
          </div>
          <div className="metric-sub">즉시 노출 가능 ({measuredCount}개 측정됨)</div>
        </div>

        <div className="card card-compact">
          <h3>30위 밖 SEO</h3>
          <div className="metric-num" style={{ color: outOf > 0 ? "var(--risk-high)" : "var(--text)" }}>
            {outOf}
          </div>
          <div className="metric-sub">콘텐츠 작업 필요</div>
        </div>
      </div>

      <div className="grid grid-summary" style={{ marginTop: 16 }}>
        <div className="card card-compact">
          <h3>총 멘션 누적</h3>
          <div className="metric-num small">{totalMentions}</div>
        </div>
        <div className="card card-compact">
          <h3>활성 키워드</h3>
          <div className="metric-num small">{activeKeywords}</div>
          <div className="metric-sub">
            <Link href="/keywords">관리하기 →</Link>
          </div>
        </div>
        <div className="card card-compact">
          <h3>빠른 이동</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
            <Link href="/seo">SEO 순위 →</Link>
            <Link href="/mentions">멘션 목록 →</Link>
          </div>
        </div>
      </div>

      <h2>최근 멘션</h2>
      {recent.length === 0 ? (
        <div className="empty-state">
          최근 7일간 수집된 멘션이 없습니다.
          <div style={{ marginTop: 12, fontSize: 13 }}>
            <code>curl http://localhost:3001/api/cron/collect</code> 로 수집을 트리거하세요.
          </div>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 80 }}>위험도</th>
              <th>키워드</th>
              <th>소스</th>
              <th>제목</th>
              <th style={{ width: 140 }}>수집</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.assessment ? (
                    <span className={`badge ${m.assessment.riskLevel}`}>
                      {m.assessment.riskLevel}
                    </span>
                  ) : (
                    <span className="faint">—</span>
                  )}
                </td>
                <td>{m.keyword.term}</td>
                <td className="faint">{m.sourceType}</td>
                <td>
                  <Link href={`/mentions/${m.id}`}>{m.title}</Link>
                </td>
                <td className="faint">{m.fetchedAt.toLocaleString("ko-KR", { hour12: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
