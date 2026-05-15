import { NextRequest, NextResponse } from "next/server";

// /_next/static, /_next/image, /favicon.ico 는 자동 제외.
// /api/cron/* 는 CRON_SECRET 헤더로 별도 보호하므로 Basic Auth 패스.
export const config = {
  matcher: ["/((?!api/cron|_next/static|_next/image|favicon\\.ico).*)"],
};

export function middleware(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;

  // env 미설정 시 통과 (로컬에서 빠르게 끄고 싶을 때 두 변수 다 비워두면 됨)
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      try {
        const decoded = atob(encoded);
        const idx = decoded.indexOf(":");
        const u = decoded.slice(0, idx);
        const p = decoded.slice(idx + 1);
        if (u === user && p === pass) return NextResponse.next();
      } catch {
        // base64 decode 실패 시 401로 떨어짐
      }
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="5010 Content Tracker", charset="UTF-8"',
    },
  });
}
