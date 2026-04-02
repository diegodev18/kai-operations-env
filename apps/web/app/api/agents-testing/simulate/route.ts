import { NextRequest, NextResponse } from "next/server";

const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? "http://localhost:3001";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const cookie = request.headers.get("cookie") ?? "";

  const upstreamResponse = await fetch(
    `${API_INTERNAL_URL}/api/agents-testing/simulate`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: cookie,
      },
      body: JSON.stringify(body),
    },
  );

  if (!upstreamResponse.ok) {
    const errorBody = await upstreamResponse.json().catch(() => ({}));
    return NextResponse.json(errorBody, { status: upstreamResponse.status });
  }

  const contentType = upstreamResponse.headers.get("content-type") ?? "";

  if (contentType.includes("text/event-stream") && upstreamResponse.body) {
    const responseStream = new TransformStream();
    const writer = responseStream.writable.getWriter();
    const reader = upstreamResponse.body.getReader();

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            await writer.close();
            return;
          }
          await writer.write(value);
        }
      } catch (err) {
        console.error("SSE proxy error:", err);
        try {
          await writer.close();
        } catch {
          /* ignore */
        }
      }
    };

    pump().catch(() => {});

    return new Response(responseStream.readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  const data = await upstreamResponse.json();
  return NextResponse.json(data);
}
