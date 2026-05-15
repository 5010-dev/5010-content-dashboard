import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Search = { risk?: string; keyword?: string };

export default async function MentionsPage({ searchParams }: { searchParams: Search }) {
  const where: Record<string, unknown> = {};
  if (searchParams.risk) {
    where.assessment = { riskLevel: searchParams.risk };
  }
  if (searchParams.keyword) {
    where.keyword = { term: searchParams.keyword };
  }

  const [mentions, keywords] = await Promise.all([
    prisma.mention.findMany({
      where,
      orderBy: { fetchedAt: "desc" },
      take: 100,
      include: { assessment: true, keyword: true },
    }),
    prisma.keyword.findMany({ orderBy: { term: "asc" } }),
  ]);

  return (
    <>
      <h1>멘션</h1>

      <form className="inline" style={{ marginBottom: 16 }}>
        <select name="risk" defaultValue={searchParams.risk ?? ""}>
          <option value="">위험도 전체</option>
          <option value="critical">critical</option>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
        <select name="keyword" defaultValue={searchParams.keyword ?? ""}>
          <option value="">키워드 전체</option>
          {keywords.map((k) => (
            <option key={k.id} value={k.term}>
              {k.term}
            </option>
          ))}
        </select>
        <button type="submit">필터</button>
      </form>

      {mentions.length === 0 ? (
        <p className="muted">조건에 맞는 멘션이 없습니다.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>위험도</th>
              <th>키워드</th>
              <th>소스</th>
              <th>제목</th>
              <th>수집</th>
            </tr>
          </thead>
          <tbody>
            {mentions.map((m) => (
              <tr key={m.id}>
                <td>
                  {m.assessment ? (
                    <span className={`badge ${m.assessment.riskLevel}`}>
                      {m.assessment.riskLevel}
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>{m.keyword.term}</td>
                <td className="muted">{m.sourceType}</td>
                <td>
                  <Link href={`/mentions/${m.id}`}>{m.title}</Link>
                </td>
                <td className="muted">
                  {m.fetchedAt.toLocaleString("ko-KR", { hour12: false })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
