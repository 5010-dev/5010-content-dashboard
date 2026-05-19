import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const KEYWORDS: Array<{ term: string; category: "brand" | "product" | "seo" }> = [
  // 브랜드 멘션 추적용 (영문 변형은 멘션 수집, 한글은 SEO에서)
  { term: "주식회사 오공일공", category: "brand" },
  { term: "오공일공", category: "brand" },
  { term: "팀 오공일공", category: "brand" },
  { term: "5010 Technologies", category: "brand" },
  { term: "5010.tech", category: "brand" },
  { term: "5010 Quant", category: "brand" },
  { term: "5010 Indicator", category: "brand" },
  { term: "5010 Academy", category: "brand" },

  // SEO — 제품 직결 (블로그 카테고리 1: 제품 업데이트)
  { term: "5010 퀀트", category: "seo" },
  { term: "5010 르네상스", category: "seo" },
  { term: "5010 인디케이터", category: "seo" }, // 신규 (기존 brand → seo)
  { term: "5010 아카데미", category: "seo" }, // 신규 (기존 brand → seo)
  { term: "트레이딩뷰 인디케이터", category: "seo" },
  { term: "보조지표 추천", category: "seo" },

  // SEO — 시장 인사이트·트레이딩 전략 (블로그 카테고리 2)
  { term: "비트코인 매매 전략", category: "seo" },
  { term: "가상화폐 매매전략", category: "seo" },
  { term: "자동매매 전략", category: "seo" },
  { term: "퀀트 자동매매", category: "seo" },
  { term: "퀀트 트레이딩", category: "seo" },
  { term: "AI 자동매매", category: "seo" },
  { term: "코인 단타", category: "seo" },
  { term: "코인 스캘핑", category: "seo" },
  { term: "스캘핑 봇", category: "seo" },
  { term: "트레이딩뷰 사용법", category: "seo" },

  // SEO — 기술 의사결정 (블로그 카테고리 3: 기술적·전략적 의사결정)
  { term: "DCA 자동매매", category: "seo" },
  { term: "그리드 자동매매", category: "seo" },
  { term: "그리드 트레이딩", category: "seo" }, // 신규 — 5010 Quant 핵심 원리
  { term: "마틴게일 자동매매", category: "seo" },
  { term: "RSI 자동매매", category: "seo" },
  { term: "비트코인 그리드봇", category: "seo" },
  { term: "변동성 거래", category: "seo" }, // 신규 — 동적 그리드 원리
  { term: "퀀트 알고리즘", category: "seo" }, // 신규 — 회사 블로그 톤

  // SEO — 거래소 (제품 호환성 콘텐츠)
  { term: "업비트 자동매매", category: "seo" },
  { term: "빗썸 자동매매", category: "seo" },
  { term: "바이낸스 자동매매", category: "seo" },
  { term: "바이비트 자동매매", category: "seo" },

  // SEO — 카테고리/포괄 (제품 카테고리 정의 글 가능)
  { term: "자동매매 프로그램", category: "seo" },
  { term: "비트코인 자동매매", category: "seo" },
  { term: "이더리움 자동매매", category: "seo" },
  { term: "코인 자동매매", category: "seo" },
  { term: "가상화폐 자동매매", category: "seo" },
  { term: "가상자산 자동매매", category: "seo" },
  { term: "코인 봇", category: "seo" },
  { term: "트레이딩 봇", category: "seo" },
  { term: "퀀트 봇", category: "seo" },
  { term: "암호화폐 봇", category: "seo" },

  // SEO — 교육/입문 (블로그 카테고리: Academy 연계)
  { term: "자동매매 뜻", category: "seo" },
  { term: "코인 투자 방법", category: "seo" },
  { term: "자동매매 무료체험", category: "seo" },
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
