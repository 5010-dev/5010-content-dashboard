const ENDPOINTS = {
  naver_news: "https://openapi.naver.com/v1/search/news.json",
  naver_blog: "https://openapi.naver.com/v1/search/blog.json",
  naver_cafe: "https://openapi.naver.com/v1/search/cafearticle.json",
  naver_web: "https://openapi.naver.com/v1/search/webkr.json", // 일반 웹 (외부 블로그·미디어·크몽·와디즈 등 포함)
} as const;

export type NaverSourceType = keyof typeof ENDPOINTS;

export interface CollectedMention {
  sourceType: NaverSourceType;
  url: string;
  title: string;
  content: string;
  author?: string;
  publishedAt?: Date;
}

interface NaverItem {
  title: string;
  link: string;
  description: string;
  bloggername?: string;
  cafename?: string;
  pubDate?: string; // 뉴스: RFC822, 블로그/카페: 미제공 또는 다른 형식
  postdate?: string; // 블로그: yyyyMMdd
}

interface NaverSearchResponse {
  items: NaverItem[];
  total: number;
}

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

function parseDate(item: NaverItem): Date | undefined {
  if (item.pubDate) {
    const d = new Date(item.pubDate);
    if (!isNaN(d.getTime())) return d;
  }
  if (item.postdate && /^\d{8}$/.test(item.postdate)) {
    const y = item.postdate.slice(0, 4);
    const m = item.postdate.slice(4, 6);
    const d = item.postdate.slice(6, 8);
    return new Date(`${y}-${m}-${d}`);
  }
  return undefined;
}

async function searchOne(
  sourceType: NaverSourceType,
  query: string,
  display: number,
  clientId: string,
  clientSecret: string,
): Promise<CollectedMention[]> {
  const url = new URL(ENDPOINTS[sourceType]);
  // 부분 매칭 허용 (recall 우선) → 응답 후 정확 substring으로 후필터링해서 정밀도 보강
  // "오공일공"을 따옴표로 묶으면 Naver가 0건 반환하는 경우가 많아 phrase 강제는 안 함
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("sort", "date");

  const res = await fetch(url, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Naver ${sourceType} ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as NaverSearchResponse;
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, "");

  return (data.items ?? [])
    .map((item) => {
      const title = stripHtml(item.title);
      const content = stripHtml(item.description);
      return {
        sourceType,
        url: item.link,
        title,
        content,
        author: item.bloggername || item.cafename || undefined,
        publishedAt: parseDate(item),
      };
    })
    .filter((m) => {
      // 안전망: 제목 또는 본문에 키워드가 실제로 포함되어야 통과
      const hay = `${m.title} ${m.content}`.toLowerCase().replace(/\s+/g, "");
      return hay.includes(normalizedQuery);
    });
}

export async function collectFromNaver(
  query: string,
  opts: { display?: number; sources?: NaverSourceType[] } = {},
): Promise<CollectedMention[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 비어있습니다.");
  }

  const display = opts.display ?? 20;
  const sources = opts.sources ?? (Object.keys(ENDPOINTS) as NaverSourceType[]);

  const results = await Promise.all(
    sources.map((s) =>
      searchOne(s, query, display, clientId, clientSecret).catch((err) => {
        console.error(`[naver:${s}] 수집 실패: ${err.message}`);
        return [] as CollectedMention[];
      }),
    ),
  );

  return results.flat();
}

export async function searchNaverSerp(
  query: string,
  display = 100,
): Promise<CollectedMention[]> {
  // SEO 순위 측정용. 100개까지 한 번에.
  return collectFromNaver(query, { display, sources: ["naver_news", "naver_blog"] });
}
