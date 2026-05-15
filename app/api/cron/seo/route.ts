import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { measureNaverRank } from "@/lib/seo/naver-rank";
import { measureGoogleRank, SerpApiKeyMissingError } from "@/lib/seo/google-rank";
import { notifyRankingDrop } from "@/lib/notifier/discord";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// SerpAPI 무료 250건/월 = 약 8건/일이 안전선. 키워드를 오래된 측정 순으로 정렬해
// 매일 이 한도 안에서만 Google 측정. 평균 키워드당 ~2.5~3일 주기로 갱신됨.
const DAILY_GOOGLE_BUDGET = 8;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  return header === secret;
}

async function previousRank(keywordId: number, engine: string): Promise<number | null | undefined> {
  const prev = await prisma.seoRanking.findFirst({
    where: { keywordId, engine },
    orderBy: { snapshotAt: "desc" },
    select: { rank: true },
  });
  return prev?.rank ?? undefined;
}

// 키워드별 마지막 Google 측정 시각을 가져와서 오래된 순으로 정렬.
// 한 번도 측정 안 한 키워드는 가장 우선.
async function pickGoogleCandidates(
  keywords: Array<{ id: number; term: string }>,
  budget: number,
): Promise<Set<number>> {
  if (budget <= 0) return new Set();

  const lastSnaps = await prisma.seoRanking.findMany({
    where: { engine: "google", keywordId: { in: keywords.map((k) => k.id) } },
    orderBy: { snapshotAt: "desc" },
    distinct: ["keywordId"],
    select: { keywordId: true, snapshotAt: true },
  });
  const lastByKw = new Map(lastSnaps.map((r) => [r.keywordId, r.snapshotAt.getTime()]));

  const sorted = [...keywords].sort((a, b) => {
    const la = lastByKw.get(a.id) ?? 0;
    const lb = lastByKw.get(b.id) ?? 0;
    return la - lb;
  });

  return new Set(sorted.slice(0, budget).map((k) => k.id));
}

export async function POST(req: NextRequest) {
  return handle(req);
}
export async function GET(req: NextRequest) {
  return handle(req);
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const ownDomain = process.env.OWN_DOMAIN ?? "5010.tech";
  const startedAt = Date.now();

  const keywords = await prisma.keyword.findMany({
    where: { active: true, category: "seo" },
    orderBy: { id: "asc" },
  });

  // 오늘의 Google 대상 선정 (오래된 측정부터 우선)
  const hasSerpKey = !!process.env.SERPAPI_KEY;
  const googleTodayIds = hasSerpKey
    ? await pickGoogleCandidates(keywords, DAILY_GOOGLE_BUDGET)
    : new Set<number>();

  const stats = {
    keywords: keywords.length,
    naverMeasured: 0,
    googleMeasured: 0,
    googleSkipped: 0,
    googleQueued: googleTodayIds.size,
    errors: [] as string[],
  };

  for (const [i, kw] of keywords.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 150)); // Naver rate limit 여유

    // --- Naver (전체 매일 측정) ---
    try {
      const prev = await previousRank(kw.id, "naver");
      const result = await measureNaverRank(kw.term, ownDomain);
      const saved = await prisma.seoRanking.create({
        data: {
          keywordId: kw.id,
          engine: "naver",
          rank: result.rank,
          url: result.url,
          topResults: result.topResults as object,
          marketSize: result.marketSize,
        },
      });
      stats.naverMeasured += 1;
      if (prev !== undefined) {
        try {
          await notifyRankingDrop({
            rankingId: saved.id,
            keyword: kw.term,
            engine: "naver",
            previousRank: prev,
            currentRank: result.rank,
          });
        } catch (e) {
          stats.errors.push(`naver-alert(${kw.term}): ${(e as Error).message}`);
        }
      }
    } catch (e) {
      stats.errors.push(`naver(${kw.term}): ${(e as Error).message}`);
    }

    // --- Google (예산 안에서만, 오래된 순으로) ---
    if (!googleTodayIds.has(kw.id)) {
      stats.googleSkipped += 1;
      continue;
    }
    try {
      const prev = await previousRank(kw.id, "google");
      const result = await measureGoogleRank(kw.term, ownDomain);
      const saved = await prisma.seoRanking.create({
        data: {
          keywordId: kw.id,
          engine: "google",
          rank: result.rank,
          url: result.url,
          topResults: result.topResults as object,
          marketSize: result.marketSize,
        },
      });
      stats.googleMeasured += 1;
      if (prev !== undefined) {
        try {
          await notifyRankingDrop({
            rankingId: saved.id,
            keyword: kw.term,
            engine: "google",
            previousRank: prev,
            currentRank: result.rank,
          });
        } catch (e) {
          stats.errors.push(`google-alert(${kw.term}): ${(e as Error).message}`);
        }
      }
    } catch (e) {
      if (e instanceof SerpApiKeyMissingError) {
        stats.googleSkipped += 1;
      } else {
        stats.errors.push(`google(${kw.term}): ${(e as Error).message}`);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    elapsedMs: Date.now() - startedAt,
    ...stats,
  });
}
