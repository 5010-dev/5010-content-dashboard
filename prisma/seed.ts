import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KEYWORDS: Array<{ term: string; category: "brand" | "product" | "seo" }> = [
  // 브랜드 멘션 추적용
  { term: "주식회사 오공일공", category: "brand" },
  { term: "오공일공", category: "brand" },
  { term: "팀 오공일공", category: "brand" },
  { term: "5010 Technologies", category: "brand" },
  { term: "5010.tech", category: "brand" },
  { term: "5010 Quant", category: "brand" },
  { term: "5010 Indicator", category: "brand" },
  { term: "5010 Academy", category: "brand" },
  { term: "5010 퀀트", category: "brand" }, // 한국어 표기
  { term: "5010 인디케이터", category: "brand" },
  { term: "5010 아카데미", category: "brand" },

  // SEO 순위 추적용 — 핵심
  { term: "자동매매 프로그램", category: "seo" },
  { term: "비트코인 자동매매", category: "seo" },
  { term: "이더리움 자동매매", category: "seo" },
  { term: "퀀트 자동매매", category: "seo" },
  { term: "5010 퀀트", category: "seo" },

  // SEO — 거래소 계열 (코빗 제거)
  { term: "업비트 자동매매", category: "seo" },
  { term: "빗썸 자동매매", category: "seo" },
  { term: "바이낸스 자동매매", category: "seo" },
  { term: "바이비트 자동매매", category: "seo" },

  // SEO — 일반 트레이딩
  { term: "코인 자동매매", category: "seo" },
  { term: "코인 봇", category: "seo" },
  { term: "가상화폐 자동매매", category: "seo" },
  { term: "트레이딩 봇", category: "seo" },

  // SEO — 투자 스타일
  { term: "코인 단타", category: "seo" },
  { term: "코인 스캘핑", category: "seo" },
  { term: "코인 투자 방법", category: "seo" },
  { term: "비트코인 매매 전략", category: "seo" },

  // SEO — 1차 신규 (AI/후기/사기 방어/퀀트/트뷰)
  { term: "AI 자동매매", category: "seo" },
  { term: "자동매매 후기", category: "seo" },
  { term: "자동매매 사기", category: "seo" },
  { term: "퀀트 트레이딩", category: "seo" },
  { term: "트레이딩뷰 인디케이터", category: "seo" },

  // SEO — 2차 신규: 매우 쉬움 그룹 (phrase 매칭 < 100건). 콘텐츠 1개로 즉시 잡을 만.
  { term: "코인 봇 추천", category: "seo" }, // 1건
  { term: "비트코인 자동매매 추천", category: "seo" }, // 3건
  { term: "5010 르네상스", category: "seo" }, // 5건 — 자체 제품 별칭
  { term: "자동매매 뜻", category: "seo" }, // 19건
  { term: "자동매매 봇 추천", category: "seo" }, // 23건
  { term: "코인 자동매매 사기", category: "seo" }, // 25건 (방어형)
  { term: "비트코인 그리드봇", category: "seo" }, // 31건 — 5010 Quant 직결
  { term: "코인 자동매매 추천", category: "seo" }, // 32건
  { term: "코인 자동매매 후기", category: "seo" }, // 42건
  { term: "BTC 자동매매", category: "seo" }, // 53건
  { term: "트레이딩봇 추천", category: "seo" }, // 59건

  // SEO — 2차 신규: 쉬움 그룹 (100~500건)
  { term: "자동매매 무료체험", category: "seo" }, // 117건 — 30일 무료체험 직결
  { term: "퀀트 봇", category: "seo" }, // 141건
  { term: "자동매매 수익인증", category: "seo" }, // 275건
  { term: "가상자산 자동매매", category: "seo" }, // 329건
  { term: "암호화폐 봇", category: "seo" }, // 479건
];

async function main() {
  // 1. Upsert desired keywords as active
  for (const k of KEYWORDS) {
    await prisma.keyword.upsert({
      where: { term: k.term },
      update: { category: k.category, active: true },
      create: { ...k, active: true },
    });
    console.log(`✓ ${k.term} (${k.category})`);
  }

  // 2. Deactivate any other keywords (preserves historical SeoRanking data)
  const wantedTerms = KEYWORDS.map((k) => k.term);
  const deactivated = await prisma.keyword.updateMany({
    where: {
      term: { notIn: wantedTerms },
      active: true,
    },
    data: { active: false },
  });
  if (deactivated.count > 0) {
    console.log(`\n△ ${deactivated.count}개 키워드 비활성화 (히스토리는 유지)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
