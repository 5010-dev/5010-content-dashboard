import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { collectFromNaver } from "@/lib/collectors/naver";
import { classifyMention } from "@/lib/classifier/claude";
import { notifyMention } from "@/lib/notifier/discord";
import { filterNewUrls } from "@/lib/dedupe";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // 로컬 개발: 시크릿 안 걸어두면 통과
  const header = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  return header === secret;
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

  const startedAt = Date.now();
  const keywords = await prisma.keyword.findMany({
    where: { active: true, category: { in: ["brand", "product"] } },
  });

  const stats = {
    keywords: keywords.length,
    collected: 0,
    newMentions: 0,
    classified: 0,
    notified: 0,
    errors: [] as string[],
  };

  for (const kw of keywords) {
    try {
      const collected = await collectFromNaver(kw.term, { display: 20 });
      stats.collected += collected.length;

      const fresh = await filterNewUrls(collected);
      if (fresh.length === 0) continue;

      for (const item of fresh) {
        const mention = await prisma.mention.create({
          data: {
            sourceType: item.sourceType,
            url: item.url,
            title: item.title,
            content: item.content,
            author: item.author,
            publishedAt: item.publishedAt,
            keywordId: kw.id,
          },
        });
        stats.newMentions += 1;

        try {
          const { assessment, model } = await classifyMention({
            sourceType: item.sourceType,
            title: item.title,
            content: item.content,
            url: item.url,
            keyword: kw.term,
          });
          await prisma.riskAssessment.create({
            data: {
              mentionId: mention.id,
              riskLevel: assessment.riskLevel,
              sentiment: assessment.sentiment,
              summary: assessment.summary,
              recommendedAction: assessment.recommendedAction,
              model,
            },
          });
          stats.classified += 1;

          try {
            await notifyMention({
              mentionId: mention.id,
              keyword: kw.term,
              sourceType: item.sourceType,
              title: item.title,
              url: item.url,
              publishedAt: item.publishedAt,
              riskLevel: assessment.riskLevel,
              sentiment: assessment.sentiment,
              summary: assessment.summary,
              recommendedAction: assessment.recommendedAction,
            });
            stats.notified += 1;
          } catch (e) {
            stats.errors.push(`notify(${mention.id}): ${(e as Error).message}`);
          }
        } catch (e) {
          stats.errors.push(`classify(${mention.id}): ${(e as Error).message}`);
        }
      }
    } catch (e) {
      stats.errors.push(`keyword(${kw.term}): ${(e as Error).message}`);
    }
  }

  return NextResponse.json({
    ok: true,
    elapsedMs: Date.now() - startedAt,
    ...stats,
  });
}
