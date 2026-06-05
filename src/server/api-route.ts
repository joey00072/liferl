import { NextResponse } from "next/server";
import { getErrorResponse } from "./liferl-store";

export function jsonOk(data: unknown) {
  return NextResponse.json(data);
}

export function jsonError(error: unknown) {
  const response = getErrorResponse(error);
  return NextResponse.json({ error: response.message }, { status: response.status });
}

export async function readJsonBody(request: Request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
