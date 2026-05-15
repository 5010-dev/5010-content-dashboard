import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MentionDetail({ params }: { params: { id: string } }) {
  const id = Number(params.id);
  if (!Number.isFinite(id)) notFound();

  const m = await prisma.mention.findUnique({
    where: { id },
    include: { assessment: true, keyword: true },
  });
  if (!m) notFound();

  return (
    <>
      <h1>{m.title}</h1>
      <p className="muted">
        키워드 <strong>{m.keyword.term}</strong> · 소스 {m.sourceType} ·{" "}
        {m.publishedAt
          ? `발행 ${m.publishedAt.toLocaleString("ko-KR", { hour12: false })}`
          : "발행일 없음"}{" "}
        · 수집 {m.fetchedAt.toLocaleString("ko-KR", { hour12: false })}
      </p>
      <p>
        <a href={m.url} target="_blank" rel="noopener noreferrer">
          원문 보기 →
        </a>
      </p>

      <div className="card" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>본문/요약</h3>
        <p style={{ whiteSpace: "pre-wrap" }}>{m.content}</p>
      </div>

      {m.assessment ? (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>
            위험도 분석{" "}
            <span className={`badge ${m.assessment.riskLevel}`}>
              {m.assessment.riskLevel}
            </span>{" "}
            <span className="muted" style={{ fontWeight: 400, fontSize: 13 }}>
              · {m.assessment.sentiment} · {m.assessment.model}
            </span>
          </h3>
          <p>
            <strong>요약.</strong> {m.assessment.summary}
          </p>
          <p>
            <strong>권장 대응.</strong> {m.assessment.recommendedAction}
          </p>
        </div>
      ) : (
        <p className="muted">아직 분석 결과가 없습니다.</p>
      )}
    </>
  );
}
