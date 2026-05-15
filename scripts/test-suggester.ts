import { prisma } from "@/lib/db";
import { generateSeoSuggestion } from "@/lib/seo/suggester";

async function main() {
  const targetTerm = process.argv[2] ?? "비트코인 자동매매";
  const ownDomain = process.env.OWN_DOMAIN ?? "5010.tech";

  const keyword = await prisma.keyword.findUnique({ where: { term: targetTerm } });
  if (!keyword) {
    console.error(`키워드 없음: ${targetTerm}`);
    process.exit(1);
  }

  const latest = await prisma.seoRanking.findFirst({
    where: { keywordId: keyword.id, engine: "naver" },
    orderBy: { snapshotAt: "desc" },
  });
  if (!latest) {
    console.error(`측정 기록 없음: ${targetTerm}`);
    process.exit(1);
  }

  console.log(`\n=== ${targetTerm} ===`);
  console.log(`현재 Naver 순위: ${latest.rank ? `${latest.rank}위` : "30위 밖"}`);
  console.log(`상위 결과 수: ${(latest.topResults as unknown[])?.length ?? 0}`);
  console.log(`\nClaude 호출 중...\n`);

  const t0 = Date.now();
  const { suggestion, model } = await generateSeoSuggestion({
    keyword: targetTerm,
    engine: "naver",
    currentRank: latest.rank,
    ownDomain,
    topResults: (latest.topResults as Array<{
      rank: number; url: string; title: string; snippet?: string; channel?: string;
    }>) ?? [],
  });
  console.log(`완료 (${Date.now() - t0}ms, model=${model})\n`);

  console.log(`📊 분석`);
  console.log(suggestion.analysis);

  console.log(`\n💡 콘텐츠 아이디어 (${suggestion.contentIdeas.length}개)`);
  suggestion.contentIdeas.forEach((idea, i) => {
    console.log(`\n  ${i + 1}. [${idea.priority.toUpperCase()}] ${idea.title} (${idea.format})`);
    console.log(`     ${idea.angle}`);
    console.log(`     아웃라인:`);
    idea.outline.forEach((o) => console.log(`       - ${o}`));
    console.log(`     타깃 키워드: ${idea.targetKeywords.join(", ")}`);
  });

  console.log(`\n🎯 전략`);
  console.log(suggestion.strategy);

  // DB에도 저장해서 /seo 페이지에서 바로 볼 수 있게
  await prisma.seoSuggestion.upsert({
    where: { keywordId: keyword.id },
    update: {
      analysis: suggestion.analysis,
      contentIdeas: suggestion.contentIdeas as object,
      strategy: suggestion.strategy,
      basedOnRank: latest.rank,
      basedOnEngine: "naver",
      model,
    },
    create: {
      keywordId: keyword.id,
      analysis: suggestion.analysis,
      contentIdeas: suggestion.contentIdeas as object,
      strategy: suggestion.strategy,
      basedOnRank: latest.rank,
      basedOnEngine: "naver",
      model,
    },
  });
  console.log(`\n✓ DB에 저장 완료 (/seo 페이지에서 확인 가능)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
