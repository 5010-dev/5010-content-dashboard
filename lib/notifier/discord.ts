import { prisma } from "@/lib/db";

type RiskLevel = "low" | "medium" | "high" | "critical";

const COLOR: Record<RiskLevel, number> = {
  low: 0x6c757d,
  medium: 0xd4a017,
  high: 0xe0732b,
  critical: 0xd23838,
};

const RISK_LABEL: Record<RiskLevel, string> = {
  low: "낮음",
  medium: "주의",
  high: "위험",
  critical: "긴급",
};

const RISK_ORDER: RiskLevel[] = ["low", "medium", "high", "critical"];
const THRESHOLD: RiskLevel = "medium";

function meetsThreshold(level: RiskLevel): boolean {
  return RISK_ORDER.indexOf(level) >= RISK_ORDER.indexOf(THRESHOLD);
}

async function postWebhook(payload: object): Promise<void> {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) throw new Error("DISCORD_WEBHOOK_URL 환경변수가 비어있습니다.");

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord webhook ${res.status}: ${body.slice(0, 200)}`);
  }
}

export async function notifyMention(args: {
  mentionId: number;
  keyword: string;
  sourceType: string;
  title: string;
  url: string;
  publishedAt?: Date | null;
  riskLevel: RiskLevel;
  sentiment: string;
  summary: string;
  recommendedAction: string;
}): Promise<void> {
  if (!meetsThreshold(args.riskLevel)) return;

  const exists = await prisma.alertLog.findFirst({
    where: { refType: "mention", refId: args.mentionId, status: "sent" },
  });
  if (exists) return;

  const payload = {
    content: args.riskLevel === "critical" ? "@here 긴급 브랜드 위험 감지" : undefined,
    embeds: [
      {
        title: `[${RISK_LABEL[args.riskLevel]}] ${args.title}`.slice(0, 250),
        url: args.url,
        color: COLOR[args.riskLevel],
        fields: [
          { name: "키워드", value: args.keyword, inline: true },
          { name: "소스", value: args.sourceType, inline: true },
          { name: "감정", value: args.sentiment, inline: true },
          { name: "요약", value: args.summary.slice(0, 1000) },
          { name: "권장 대응", value: args.recommendedAction.slice(0, 1000) },
        ],
        timestamp: (args.publishedAt ?? new Date()).toISOString(),
      },
    ],
  };

  try {
    await postWebhook(payload);
    await prisma.alertLog.create({
      data: { refType: "mention", refId: args.mentionId, channel: "discord", status: "sent" },
    });
  } catch (err) {
    await prisma.alertLog.create({
      data: {
        refType: "mention",
        refId: args.mentionId,
        channel: "discord",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}

export async function notifyRankingDrop(args: {
  rankingId: number;
  keyword: string;
  engine: "naver" | "google";
  previousRank: number | null;
  currentRank: number | null;
}): Promise<void> {
  const prev = args.previousRank ?? 101;
  const curr = args.currentRank ?? 101;
  const droppedOut = args.previousRank !== null && args.currentRank === null;
  const significantDrop = curr - prev >= 5;
  if (!droppedOut && !significantDrop) return;

  const exists = await prisma.alertLog.findFirst({
    where: { refType: "ranking", refId: args.rankingId, status: "sent" },
  });
  if (exists) return;

  const desc = droppedOut
    ? `이전 ${args.previousRank}위 → 100위 밖으로 이탈`
    : `이전 ${args.previousRank}위 → 현재 ${args.currentRank}위 (${curr - prev}단계 하락)`;

  const payload = {
    embeds: [
      {
        title: `[SEO 경고] ${args.engine.toUpperCase()} "${args.keyword}"`,
        color: 0xe0732b,
        description: desc,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    await postWebhook(payload);
    await prisma.alertLog.create({
      data: { refType: "ranking", refId: args.rankingId, channel: "discord", status: "sent" },
    });
  } catch (err) {
    await prisma.alertLog.create({
      data: {
        refType: "ranking",
        refId: args.rankingId,
        channel: "discord",
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }
}
