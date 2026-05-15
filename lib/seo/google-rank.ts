import type { RankResult, TopResult } from "./naver-rank";

type GoogleRank = Omit<RankResult, "engine"> & { engine: "google" };

interface SerpApiOrganic {
  position: number;
  link: string;
  title: string;
  snippet?: string;
}

interface SerpApiResponse {
  organic_results?: SerpApiOrganic[];
  search_information?: { total_results?: number };
  error?: string;
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

export class SerpApiKeyMissingError extends Error {
  constructor() {
    super("SERPAPI_KEY 환경변수가 비어있습니다.");
    this.name = "SerpApiKeyMissingError";
  }
}

export async function measureGoogleRank(
  keyword: string,
  ownDomain: string,
): Promise<GoogleRank> {
  const key = process.env.SERPAPI_KEY;
  if (!key) throw new SerpApiKeyMissingError();

  const url = new URL("https://serpapi.com/search.json");
  url.searchParams.set("engine", "google");
  url.searchParams.set("q", keyword);
  url.searchParams.set("hl", "ko");
  url.searchParams.set("gl", "kr");
  url.searchParams.set("google_domain", "google.co.kr");
  url.searchParams.set("num", "30");
  url.searchParams.set("api_key", key);

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SerpAPI ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as SerpApiResponse;
  if (data.error) throw new Error(`SerpAPI error: ${data.error}`);

  const organic = data.organic_results ?? [];
  const topResults: TopResult[] = organic.slice(0, 30).map((r) => ({
    rank: r.position,
    url: r.link,
    title: r.title,
    snippet: r.snippet?.slice(0, 200),
    channel: "web",
  }));

  const hit = topResults.find((r) => hostMatches(r.url, ownDomain));

  return {
    engine: "google",
    rank: hit?.rank ?? null,
    url: hit?.url ?? null,
    topResults,
    marketSize: data.search_information?.total_results ?? null,
  };
}
