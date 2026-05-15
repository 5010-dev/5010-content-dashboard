// 로컬에서 cron 라우트를 직접 호출하지 않고 동일한 로직을 실행하고 싶을 때 사용.
// 사용: pnpm cron:collect  (또는 pnpm tsx scripts/run-collect.ts)
import { prisma } from "@/lib/db";
import { collectFromNaver } from "@/lib/collectors/naver";
import { classifyMention } from "@/lib/classifier/claude";
import { notifyMention } from "@/lib/notifier/discord";
import { filterNewUrls } from "@/lib/dedupe";

async function main() {
  const keywords = await prisma.keyword.findMany({
    where: { active: true, category: { in: ["brand", "product"] } },
  });
  console.log(`active keywords: ${keywords.length}`);

  for (const kw of keywords) {
    console.log(`\n=== ${kw.term} ===`);
    const collected = await collectFromNaver(kw.term, { display: 20 });
    console.log(`collected: ${collected.length}`);
    const fresh = await filterNewUrls(collected);
    console.log(`fresh: ${fresh.length}`);

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
      const { assessment, model } = await classifyMention({
        sourceType: item.sourceType,
        title: item.title,
        content: item.content,
        url: item.url,
        keyword: kw.term,
      });
      await prisma.riskAssessment.create({
        data: { mentionId: mention.id, ...assessment, model },
      });
      console.log(`  [${assessment.riskLevel}] ${item.title.slice(0, 60)}`);
      await notifyMention({
        mentionId: mention.id,
        keyword: kw.term,
        sourceType: item.sourceType,
        title: item.title,
        url: item.url,
        publishedAt: item.publishedAt,
        ...assessment,
      });
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
