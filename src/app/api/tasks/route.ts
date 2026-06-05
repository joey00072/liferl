import { jsonError, jsonOk, readJsonBody } from "../../../server/api-route";
import { createTask, today } from "../../../server/liferl-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const date = new URL(request.url).searchParams.get("date") ?? today();

  try {
    return jsonOk(await createTask(date, await readJsonBody(request)));
  } catch (error) {
    return jsonError(error);
  }
}
