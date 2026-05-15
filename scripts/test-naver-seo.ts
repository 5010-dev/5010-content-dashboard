import { measureNaverRank } from "@/lib/seo/naver-rank";

const KEYWORDS = [
  "자동매매 프로그램",
  "비트코인 자동매매",
  "퀀트 자동매매",
  "암호화폐 그리드봇",
  "5010 퀀트",
];

async function main() {
  const domain = process.env.OWN_DOMAIN ?? "5010.tech";
  for (const kw of KEYWORDS) {
    try {
      const r = await measureNaverRank(kw, domain);
      const rank = r.rank ? `${r.rank}위` : "100위 밖";
      const hit = r.url ? ` → ${r.url}` : "";
      console.log(`[${kw}] ${rank}${hit}`);
      if (!r.rank) {
        // 상위 3개만 살짝 보여서 무슨 결과가 뜨는지 감 잡기
        const top3 = r.topResults.slice(0, 3);
        top3.forEach((t) => console.log(`    ${t.rank}. (${t.channel}) ${t.title.slice(0, 60)}`));
      }
    } catch (e) {
      console.error(`[${kw}] ERROR: ${(e as Error).message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
