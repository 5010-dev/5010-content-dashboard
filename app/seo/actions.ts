"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { generateSeoSuggestion } from "@/lib/seo/suggester";

const STALE_MS = 7 * 24 * 60 * 60 * 1000;
const GENERATION_TIMEOUT_MS = 10 * 60 * 1000; // 10분 넘으면 stale → 다시 시도 허용

export type SuggestionState = {
  status: "idle" | "ok" | "cached" | "in_progress" | "error";
  error?: string;
};

export async function generateSuggestionAction(
  _prev: SuggestionState,
  formData: FormData,
): Promise<SuggestionState> {
  const keywordId = Number(formData.get("keywordId"));
  const force = formData.get("force") === "1";

  const keyword = await prisma.keyword.findUnique({
    where: { id: keywordId },
    include: { suggestion: true },
  });
  if (!keyword) return { status: "error", error: "키워드를 찾을 수 없습니다." };

  // 다른 사용자/탭이 이미 생성 중이면 중복 호출 방지
  if (
    keyword.suggestionGeneratingSince &&
    Date.now() - keyword.suggestionGeneratingSince.getTime() < GENERATION_TIMEOUT_MS
  ) {
    revalidatePath("/seo");
    return { status: "in_progress" };
  }

  if (
    !force &&
    keyword.suggestion &&
    Date.now() - keyword.suggestion.updatedAt.getTime() < STALE_MS
  ) {
    return { status: "cached" };
  }

  const latest =
    (await prisma.seoRanking.findFirst({
      where: { keywordId, engine: "naver" },
      orderBy: { snapshotAt: "desc" },
    })) ??
    (await prisma.seoRanking.findFirst({
      where: { keywordId, engine: "google" },
      orderBy: { snapshotAt: "desc" },
    }));

  if (!latest) {
    return {
      status: "error",
      error: "먼저 /api/cron/seo 로 순위를 측정해야 제안을 생성할 수 있습니다.",
    };
  }

  // DB에 "진행 중" 상태 저장 + 이전 에러 clear
  await prisma.keyword.update({
    where: { id: keywordId },
    data: {
      suggestionGeneratingSince: new Date(),
      suggestionLastError: null,
      suggestionLastErrorAt: null,
    },
  });
  revalidatePath("/seo");

  try {
    const ownDomain = process.env.OWN_DOMAIN ?? "5010.tech";

    const { suggestion, model } = await generateSeoSuggestion({
      keyword: keyword.term,
      engine: latest.engine as "naver" | "google",
      currentRank: latest.rank,
      ownDomain,
      topResults:
        (latest.topResults as Array<{
          rank: number;
          url: string;
          title: string;
          snippet?: string;
          channel?: string;
        }>) ?? [],
    });

    await prisma.seoSuggestion.upsert({
      where: { keywordId },
      update: {
        analysis: suggestion.analysis,
        contentIdeas: suggestion.contentIdeas as object,
        strategy: suggestion.strategy,
        basedOnRank: latest.rank,
        basedOnEngine: latest.engine,
        model,
      },
      create: {
        keywordId,
        analysis: suggestion.analysis,
        contentIdeas: suggestion.contentIdeas as object,
        strategy: suggestion.strategy,
        basedOnRank: latest.rank,
        basedOnEngine: latest.engine,
        model,
      },
    });

    revalidatePath("/seo");
    return { status: "ok" };
  } catch (e) {
    const msg = (e as Error).message || "알 수 없는 오류";
    // 에러를 DB에 영구 기록 → 페이지 다시 와도 표시됨
    try {
      await prisma.keyword.update({
        where: { id: keywordId },
        data: {
          suggestionLastError: msg.slice(0, 2000),
          suggestionLastErrorAt: new Date(),
        },
      });
    } catch {
      // DB write 실패해도 catch 자체는 무시
    }
    return { status: "error", error: msg };
  } finally {
    // 성공/실패 무관하게 진행 중 플래그 해제
    await prisma.keyword.update({
      where: { id: keywordId },
      data: { suggestionGeneratingSince: null },
    });
    revalidatePath("/seo");
  }
}
