import { NextRequest, NextResponse } from "next/server";
import { sendWeeklyDigest } from "@/lib/notifier/digest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const header = req.headers.get("x-cron-secret") ?? req.nextUrl.searchParams.get("secret");
  return header === secret;
}

// 기본 정책: 월요일 KST에만 전송. ?force=1 이면 요일 무시.
function isMondayKst(): boolean {
  const utc = new Date();
  const kstMs = utc.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  return kst.getUTCDay() === 1; // 1 = Monday
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const force = req.nextUrl.searchParams.get("force") === "1";
  if (!force && !isMondayKst()) {
    return NextResponse.json({ ok: true, skipped: "not monday KST" });
  }

  try {
    const result = await sendWeeklyDigest();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
