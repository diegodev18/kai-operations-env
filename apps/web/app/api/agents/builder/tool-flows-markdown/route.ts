import { NextRequest, NextResponse } from "next/server";

const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? "http://localhost:3001";

export const maxDuration = 300;

export const dynamic = "force-dynamic";

function forwardHeaders(req: NextRequest): HeadersInit {
  const headers: Record<string, string> = {
    "Content-Type": req.headers.get("content-type") ?? "application/json",
  };
  const cookie = req.headers.get("cookie");
  if (cookie) headers.Cookie = cookie;
  const auth = req.headers.get("authorization");
  if (auth) headers.Authorization = auth;
  return headers;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.text();
  const target = `${API_INTERNAL_URL}/api/agents/builder/tool-flows-markdown`;
  const upstream = await fetch(target, {
    method: "POST",
    headers: forwardHeaders(req),
    body,
  });
  const text = await upstream.text();
  const contentType =
    upstream.headers.get("content-type") ?? "application/json; charset=utf-8";
  return new NextResponse(text, {
    status: upstream.status,
    headers: { "Content-Type": contentType },
  });
}
