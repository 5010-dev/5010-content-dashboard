import { prisma } from "@/lib/db";

export async function filterNewUrls<T extends { url: string }>(items: T[]): Promise<T[]> {
  if (items.length === 0) return [];
  const urls = items.map((i) => i.url);
  const existing = await prisma.mention.findMany({
    where: { url: { in: urls } },
    select: { url: true },
  });
  const existingSet = new Set(existing.map((e) => e.url));
  return items.filter((i) => !existingSet.has(i.url));
}
