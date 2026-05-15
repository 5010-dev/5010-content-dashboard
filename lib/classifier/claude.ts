import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const AssessmentSchema = z.object({
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  sentiment: z.enum(["positive", "neutral", "negative"]),
  summary: z.string(),
  recommendedAction: z.string(),
});

export type Assessment = z.infer<typeof AssessmentSchema>;

const SYSTEM_PROMPT = `당신은 주식회사 오공일공(브랜드명: 오공일공, 팀 오공일공, 도메인: 5010.tech)의 브랜드 평판 분석가입니다.

주어진 외부 콘텐츠(뉴스/블로그/카페/SNS 등)가 자사 브랜드에 미칠 영향을 평가하세요.

# 위험도 정의
- "critical": 명백한 비방, 소송/법적 위험, 고객 안전 이슈, 대규모 부정 확산 가능성. 즉시 대응 필요.
- "high": 부정적 후기나 비교에서 불리한 묘사, 신뢰도 훼손, 노출 영향 큼. 24시간 내 대응 권장.
- "medium": 사실 오인·오해 소지, 부분적 부정 신호. 모니터링하며 필요 시 대응.
- "low": 중립/긍정/단순 언급. 별도 대응 불필요.

# 감정
- "positive": 호의적 톤, 추천, 긍정적 경험 공유
- "neutral": 단순 사실 전달, 정보성
- "negative": 비판, 불만, 부정적 경험

# 권장 대응 (recommendedAction)
한국어 1~2문장으로 구체적이고 실행 가능한 액션을 제시. 예시:
- "고객지원팀이 24시간 내 비공개 채널로 사과 및 환불 안내"
- "공식 블로그에 사실관계 정정 포스트 게시"
- "별도 대응 불필요. 트래커에 기록만 유지"

# 출력 형식 (반드시 JSON, 다른 텍스트 금지)
{
  "riskLevel": "low" | "medium" | "high" | "critical",
  "sentiment": "positive" | "neutral" | "negative",
  "summary": "한국어 2문장 이내. 무슨 내용이고 왜 그 위험도인지.",
  "recommendedAction": "한국어 1~2문장."
}`;

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
  if (start === -1 || end === -1) throw new Error(`JSON not found in: ${text.slice(0, 200)}`);
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function classifyMention(input: {
  sourceType: string;
  title: string;
  content: string;
  url: string;
  keyword: string;
}): Promise<{ assessment: Assessment; model: string }> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const userBlock = [
    `매칭 키워드: ${input.keyword}`,
    `소스: ${input.sourceType}`,
    `URL: ${input.url}`,
    `제목: ${input.title}`,
    "",
    "본문/요약:",
    input.content,
  ].join("\n");

  const resp = await getClient().messages.create({
    model,
    max_tokens: 512,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userBlock }],
  });

  const textBlock = resp.content.find((c) => c.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude 응답에 text 블록이 없습니다.");
  }
  const parsed = AssessmentSchema.parse(extractJson(textBlock.text));
  return { assessment: parsed, model };
}
