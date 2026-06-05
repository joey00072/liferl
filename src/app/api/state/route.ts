import { jsonError, jsonOk } from "../../../server/api-route";
import { getState, today } from "../../../server/liferl-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? today();

  try {
    return jsonOk(await getState(date));
  } catch (error) {
    return jsonError(error);
  }
}
