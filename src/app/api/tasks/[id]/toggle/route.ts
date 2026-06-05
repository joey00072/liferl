import { jsonError, jsonOk } from "../../../../../server/api-route";
import { today, toggleTask } from "../../../../../server/liferl-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskRouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: TaskRouteContext) {
  const date = new URL(request.url).searchParams.get("date") ?? today();
  const { id } = await context.params;

  try {
    return jsonOk(await toggleTask(date, id));
  } catch (error) {
    return jsonError(error);
  }
}
