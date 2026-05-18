import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const ContentIdeaSchema = z.object({
  title: z.string(),
  format: z.enum([
    "blog_post",
    "guide",
    "comparison",
    "case_study",
    "tutorial",
    "landing_page",
    "faq",
    "video_script",
  ]),
  outline: z.array(z.string()).min(3).max(8),
  targetKeywords: z.array(z.string()),
  angle: z.string(),
  priority: z.enum(["high", "medium", "low"]),
});

const SuggestionSchema = z.object({
  analysis: z.string(),
  contentIdeas: z.array(ContentIdeaSchema).min(3).max(6),
  strategy: z.string(),
});

export type ContentIdea = z.infer<typeof ContentIdeaSchema>;
export type Suggestion = z.infer<typeof SuggestionSchema>;

const COMPANY_CONTEXT = `[자사 정보]
- 회사명: 주식회사 오공일공 (5010 Technologies)
- 도메인: 5010.tech
- 사업: AI 기반 암호화폐 퀀트 자동매매 솔루션 + 트레이딩 교육
- 주요 제품:
  · 5010 Quant 3.0 — BTC/ETH 선물 자동매매 (동적 그리드 + 리스크 알고리즘, 30일 무료체험)
  · 5010 Indicator 2.0 — 가격 액션 분석 기반 차트 보조지표
  · 5010 Academy — 1:1 코칭 기반 퀀트 트레이딩 교육
- 슬로건: "월가의 퀀트 전략을 누구나 사용할 수 있게"
- 타깃: 초보~숙련된 개인 투자자, 시스템적·감정 없는 매매 추구
- 실적: 5,000+ 사용자, $5M+ AUM, $4B+ 누적 거래량`;

const SYSTEM_PROMPT = `당신은 한국 검색엔진(네이버·구글) SEO와 콘텐츠 마케팅 전문가입니다.
주어진 타깃 키워드의 검색 결과 상위 노출 콘텐츠를 분석해, 자사가 그 키워드로 상위 노출되기 위한 콘텐츠 전략과 구체적 글감을 제안하세요.

${COMPANY_CONTEXT}

# 작업 흐름 (반드시 이 순서로)
1. **web_fetch**로 사용자가 제공한 상위 결과 중 **1~3위 URL을 직접 fetch**해서 다음을 파악:
   - 글 길이 (어림 문단 수)
   - 톤 (정보형 / 후기 / 비교형 / 단순 광고 페이지 / 가이드 / 영상)
   - 도메인 종류 (개인 블로그 / 미디어 / 광고 사이트 / 위키 / 자사 제품 페이지 / 유튜브)
   - 사용된 부가 키워드 (H1/H2/소제목에 등장하는 단어)
   - CTA 종류 (무료체험 / 회원가입 / 영상 시청 / 외부 링크)
2. 필요하면 **web_search**로 long-tail 변형(1~2회)을 탐색 (e.g. "비트코인 자동매매 무료", "5010 quant 후기").
3. 모든 정보를 종합해 자사가 어떤 콘텐츠를 어떤 각도로 만들면 상위 노출 가능성이 높은지 판단.

# 우선순위 기준
- "high": 자사 제품 자연 노출 + 상위 노출 가능성 높음 + 작성 난이도 적정 — 모두 충족
- "medium": 위 셋 중 둘 충족
- "low": 하나만 충족하거나 검색 의도 불일치

# 출력 규칙 (매우 중요)
중간에는 분석 메모를 자유롭게 텍스트로 남겨도 좋습니다. 하지만 **마지막 응답 메시지는 반드시 아래 스키마에 정확히 부합하는 JSON 한 덩어리**여야 합니다 (다른 텍스트 일체 금지):

\`\`\`json
{
  "analysis": "한국어 4~6문장. 상위 노출 공통 패턴 + 자사가 빠진 이유 + 실제 fetch 결과 근거 인용.",
  "contentIdeas": [
    {
      "title": "구체적 글 제목 (한국어, 60자 이내)",
      "format": "blog_post|guide|comparison|case_study|tutorial|landing_page|faq|video_script",
      "outline": ["섹션1 제목", "섹션2 제목", "..."],
      "targetKeywords": ["메인 키워드", "long-tail 키워드", "..."],
      "angle": "왜 차별화되고 상위 노출 가능성 있는지 1~2문장",
      "priority": "high|medium|low"
    }
  ],
  "strategy": "한국어 4~6문장. 키워드 클러스터, 내부 링크, 백링크, 자사 제품 자연스러운 노출 방법."
}
\`\`\`

작성 원칙:
- contentIdeas는 **반드시 3개 이상 6개 이하**.
- 자사 제품(5010 Quant/Indicator/Academy)을 자연스럽게 녹일 수 있는 글감 우선.
- 키워드 검색 의도를 정확히 짚을 것 (정보형 vs 비교형 vs 구매형).
- 네이버 SEO는 블로그·VIEW 탭 영향이 크고, 구글은 E-E-A-T(전문성·경험·권위·신뢰) 중요.
- 키워드가 자사 사업과 무관해 보이면 analysis에 명시하고 priority 모두 low로 매겨도 됨.`;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (client) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY 환경변수가 비어있습니다.");
  client = new Anthropic({ apiKey });
  return client;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`JSON not found in: ${text.slice(0, 300)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1));
}

export interface SuggesterInput {
  keyword: string;
  engine: "naver" | "google";
  currentRank: number | null;
  ownDomain: string;
  topResults: Array<{
    rank: number;
    url: string;
    title: string;
    snippet?: string;
    channel?: string;
  }>;
}

export async function generateSeoSuggestion(
  input: SuggesterInput,
): Promise<{ suggestion: Suggestion; model: string }> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const rankLine = input.currentRank
    ? `현재 ${input.engine} 순위: ${input.currentRank}위`
    : `현재 ${input.engine} 순위: 상위 노출 안 됨 (30위 밖)`;

  const topBlock = input.topResults
    .slice(0, 20)
    .map(
      (r) =>
        `${r.rank}. [${r.channel ?? "web"}] ${r.title}\n   ${r.url}${r.snippet ? `\n   ${r.snippet}` : ""}`,
    )
    .join("\n");

  const userBlock = [
    `타깃 키워드: ${input.keyword}`,
    `자사 도메인: ${input.ownDomain}`,
    rankLine,
    "",
    `상위 노출 결과 (${input.engine}, Top ${Math.min(20, input.topResults.length)}):`,
    topBlock || "(결과 없음)",
    "",
    "위 상위 결과 중 1~3위 URL을 web_fetch로 직접 읽고 패턴을 파악한 뒤, 최종 JSON을 반환하세요.",
  ].join("\n");

  const resp = await getClient().messages.create(
    {
      model,
      max_tokens: 6000,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium" },
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
        },
      ],
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 2 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
      ],
      messages: [{ role: "user", content: userBlock }],
    },
    {
      // 무한 hang 방지. 4분 안에 응답 없으면 throw → catch에서 DB에 에러 기록.
      timeout: 4 * 60 * 1000,
    },
  );

  if (resp.stop_reason === "pause_turn") {
    throw new Error(
      "도구 사용 한도 도달(pause_turn). max_uses를 늘리거나 후속 호출로 재개 필요.",
    );
  }

  const textBlocks = resp.content.filter(
    (c): c is Anthropic.TextBlock => c.type === "text",
  );
  const lastText = textBlocks[textBlocks.length - 1];
  if (!lastText) {
    throw new Error("Claude 응답에 텍스트 블록이 없습니다.");
  }

  const parsed = SuggestionSchema.parse(extractJson(lastText.text));
  return { suggestion: parsed, model };
}
