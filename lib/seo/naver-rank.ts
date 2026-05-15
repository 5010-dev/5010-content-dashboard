type Engine = "naver";

export interface TopResult {
  rank: number;
  url: string;
  title: string;
  snippet?: string;
  channel: "web" | "blog" | "news";
}

export interface RankResult {
  engine: Engine;
  rank: number | null;
  url: string | null;
  topResults: TopResult[];
  marketSize: number | null; // 검색 결과 총 건수 (Naver web 기준)
}

interface NaverItem {
  title: string;
  link: string;
  description: string;
}

interface NaverResponse {
  items: NaverItem[];
  total: number;
}

const ENDPOINTS = {
  web: "https://openapi.naver.com/v1/search/webkr.json",
  blog: "https://openapi.naver.com/v1/search/blog.json",
  news: "https://openapi.naver.com/v1/search/news.json",
} as const;

type Channel = keyof typeof ENDPOINTS;

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function hostMatches(url: string, domain: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    const d = domain.toLowerCase();
    return h === d || h.endsWith(`.${d}`);
  } catch {
    return false;
  }
}

async function searchChannel(
  channel: Channel,
  query: string,
  clientId: string,
  clientSecret: string,
  display = 30,
): Promise<{ items: TopResult[]; total: number }> {
  const url = new URL(ENDPOINTS[channel]);
  // query를 가공하지 않고 호출자가 넘긴 그대로 사용.
  // 호출자가 따옴표로 phrase 매칭을 원하면 직접 감싸서 전달.
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("sort", "sim");

  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Naver ${channel} ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as NaverResponse;
  return {
    total: data.total ?? 0,
    items: (data.items ?? []).map((item, i) => ({
      rank: i + 1,
      url: item.link,
      title: stripHtml(item.title),
      snippet: stripHtml(item.description).slice(0, 200),
      channel,
    })),
  };
}

export async function measureNaverRank(
  keyword: string,
  ownDomain: string,
): Promise<RankResult> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 비어있습니다.");
  }

  // 두 가지 호출을 병렬로:
  // 1. rank/topResults는 unquoted = 사용자가 실제 검색창에 치는 형태. Naver SERP를 가장 가깝게 재현.
  // 2. marketSize는 따옴표 phrase 매칭 total. 사용자 OR 매칭(부풀려진 수치) 대신 진짜 경쟁 페이지 수.
  const [ranking, phraseCount] = await Promise.all([
    searchChannel("web", keyword, clientId, clientSecret, 30),
    searchChannel("web", `"${keyword}"`, clientId, clientSecret, 1),
  ]);
  const hit = ranking.items.find((r) => hostMatches(r.url, ownDomain));

  return {
    engine: "naver",
    rank: hit?.rank ?? null,
    url: hit?.url ?? null,
    topResults: ranking.items.slice(0, 20),
    marketSize: phraseCount.total,
  };
}
