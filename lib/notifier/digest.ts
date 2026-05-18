import { prisma } from "@/lib/db";

const PUBLIC_URL =
  process.env.PUBLIC_APP_URL ??
  "https://5010-content-dashboard-production.up.railway.app";

function formatNum(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(n);
}

function rankLabel(rank: number | null | undefined): string {
  if (rank === null || rank === undefined) return "out";
  return `${rank}위`;
}

async function postDiscord(payload: object): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) throw new Error("DISCORD_WEBHOOK_URL 환경변수가 비어있습니다.");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord ${res.status}: ${body.slice(0, 200)}`);
  }
}

export async function sendWeeklyDigest(): Promise<{
  mentionCount: number;
  upMovers: number;
  downMovers: number;
}> {
  const now = new Date();
  const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  // 1. 멘션 위험도 분포
  const riskCounts = await prisma.riskAssessment.groupBy({
    by: ["riskLevel"],
    where: { createdAt: { gte: since7 } },
    _count: true,
  });
  const cnt = (lvl: string) =>
    riskCounts.find((r) => r.riskLevel === lvl)?._count ?? 0;
  const totalMentions = riskCounts.reduce((s, r) => s + r._count, 0);

  // 2. 핵심 멘션 (high/critical, 최신 3)
  const importantMentions = await prisma.mention.findMany({
    where: {
      fetchedAt: { gte: since7 },
      assessment: { riskLevel: { in: ["high", "critical"] } },
    },
    include: { assessment: true, keyword: true },
    orderBy: { fetchedAt: "desc" },
    take: 3,
  });

  // 3. SEO 변동 — 최근 14일 데이터로 비교 (오늘 latest vs 7일 전 가까운 측정)
  const seoKeywords = await prisma.keyword.findMany({
    where: { category: "seo", active: true },
    select: { id: true, term: true },
  });
  const allRanks = await prisma.seoRanking.findMany({
    where: {
      keywordId: { in: seoKeywords.map((k) => k.id) },
      engine: "naver",
      snapshotAt: { gte: since14 },
    },
    orderBy: { snapshotAt: "desc" },
    select: { keywordId: true, rank: true, snapshotAt: true, marketSize: true },
  });

  type Mover = {
    term: string;
    oldRank: number | null;
    newRank: number | null;
    delta: number;
  };
  const movers: Mover[] = [];
  const missed: { term: string; marketSize: number }[] = [];

  for (const kw of seoKeywords) {
    const ranks = allRanks.filter((r) => r.keywordId === kw.id);
    if (ranks.length === 0) continue;
    const latest = ranks[0];

    // 시장 큰데 30위 밖인 키워드 = "미노출 기회"
    if (latest.rank === null && (latest.marketSize ?? 0) > 0) {
      missed.push({ term: kw.term, marketSize: latest.marketSize ?? 0 });
    }

    if (ranks.length < 2) continue;
    // 7일 전 측정 = since7 이전 중 가장 최신
    const before = ranks.find((r) => r.snapshotAt.getTime() <= since7.getTime());
    if (!before) continue;

    const oldRank = before.rank;
    const newRank = latest.rank;
    if (oldRank === newRank) continue;

    let delta: number;
    if (oldRank === null && newRank !== null) delta = 100; // 신규 진입
    else if (oldRank !== null && newRank === null) delta = -100; // 이탈
    else delta = (oldRank ?? 100) - (newRank ?? 100); // +면 상승

    movers.push({ term: kw.term, oldRank, newRank, delta });
  }

  const upMovers = movers
    .filter((m) => m.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 3);
  const downMovers = movers
    .filter((m) => m.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 3);
  const topMissed = missed.sort((a, b) => b.marketSize - a.marketSize).slice(0, 5);

  // Embed fields 조립
  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];

  fields.push({
    name: "🚨 위험도",
    value: `critical **${cnt("critical")}** · high **${cnt("high")}** · medium **${cnt("medium")}** · low **${cnt("low")}**`,
    inline: false,
  });

  if (importantMentions.length > 0) {
    fields.push({
      name: "🔥 핵심 멘션 (high+)",
      value: importantMentions
        .map((m) => {
          const lvl = m.assessment?.riskLevel ?? "?";
          const title = m.title.slice(0, 70);
          return `[\`${lvl}\`] [${title}](${m.url})`;
        })
        .join("\n")
        .slice(0, 1024),
    });
  } else {
    fields.push({
      name: "🔥 핵심 멘션",
      value: "지난 7일 high+ 위험 멘션 없음 ✓",
    });
  }

  if (upMovers.length > 0) {
    fields.push({
      name: "📈 SEO 상승 top 3",
      value: upMovers
        .map((m) => `\`${m.term}\` ${rankLabel(m.oldRank)} → ${rankLabel(m.newRank)}`)
        .join("\n"),
      inline: true,
    });
  }
  if (downMovers.length > 0) {
    fields.push({
      name: "📉 SEO 하락 top 3",
      value: downMovers
        .map((m) => `\`${m.term}\` ${rankLabel(m.oldRank)} → ${rankLabel(m.newRank)}`)
        .join("\n"),
      inline: true,
    });
  }

  if (topMissed.length > 0) {
    fields.push({
      name: "🎯 미노출 키워드 (시장 큰 순)",
      value: topMissed
        .map((o) => `\`${o.term}\` (${formatNum(o.marketSize)}건)`)
        .join("\n"),
    });
  }

  const sinceLabel = since7.toISOString().slice(0, 10);
  const todayLabel = now.toISOString().slice(0, 10);

  const payload = {
    embeds: [
      {
        title: "📅 5010 Tracker 주간 다이제스트",
        url: PUBLIC_URL,
        description: `**${sinceLabel} ~ ${todayLabel}** · 총 멘션 ${totalMentions}건`,
        color: 0x6ea8ff,
        fields,
        footer: { text: "5010 Content Tracker · /seo /mentions" },
        timestamp: now.toISOString(),
      },
    ],
  };

  await postDiscord(payload);

  return {
    mentionCount: totalMentions,
    upMovers: upMovers.length,
    downMovers: downMovers.length,
  };
}
