import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

async function addKeyword(formData: FormData) {
  "use server";
  const term = String(formData.get("term") ?? "").trim();
  const category = String(formData.get("category") ?? "brand");
  if (!term) return;
  await prisma.keyword.upsert({
    where: { term },
    update: { active: true, category },
    create: { term, category, active: true },
  });
  revalidatePath("/keywords");
}

async function toggleKeyword(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  const k = await prisma.keyword.findUnique({ where: { id } });
  if (!k) return;
  await prisma.keyword.update({ where: { id }, data: { active: !k.active } });
  revalidatePath("/keywords");
}

async function deleteKeyword(formData: FormData) {
  "use server";
  const id = Number(formData.get("id"));
  await prisma.keyword.delete({ where: { id } });
  revalidatePath("/keywords");
}

export default async function KeywordsPage() {
  const keywords = await prisma.keyword.findMany({ orderBy: { createdAt: "asc" } });

  return (
    <>
      <h1>키워드</h1>
      <p className="muted">
        brand/product 카테고리는 멘션 수집 대상, seo 카테고리는 SEO 순위 측정 대상입니다.
      </p>

      <form action={addKeyword} className="inline" style={{ marginTop: 16 }}>
        <input name="term" placeholder="예: 주식회사 오공일공" required style={{ minWidth: 240 }} />
        <select name="category" defaultValue="brand">
          <option value="brand">brand</option>
          <option value="product">product</option>
          <option value="seo">seo</option>
        </select>
        <button type="submit">추가</button>
      </form>

      <table style={{ marginTop: 20 }}>
        <thead>
          <tr>
            <th>키워드</th>
            <th>카테고리</th>
            <th>활성</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {keywords.map((k) => (
            <tr key={k.id}>
              <td>{k.term}</td>
              <td className="muted">{k.category}</td>
              <td>
                <form action={toggleKeyword} className="inline">
                  <input type="hidden" name="id" value={k.id} />
                  <button type="submit" className="ghost">
                    {k.active ? "활성" : "비활성"}
                  </button>
                </form>
              </td>
              <td>
                <form action={deleteKeyword} className="inline">
                  <input type="hidden" name="id" value={k.id} />
                  <button type="submit" className="ghost">삭제</button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
