import { archiveTask, today, updateTask } from "../../../../server/liferl-store";
import { jsonError, jsonOk, readJsonBody } from "../../../../server/api-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type TaskRouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: TaskRouteContext) {
  const date = new URL(request.url).searchParams.get("date") ?? today();
  const { id } = await context.params;

  try {
    return jsonOk(await updateTask(date, id, await readJsonBody(request)));
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request: Request, context: TaskRouteContext) {
  const date = new URL(request.url).searchParams.get("date") ?? today();
  const { id } = await context.params;

  try {
    return jsonOk(await archiveTask(date, id));
  } catch (error) {
    return jsonError(error);
  }
}
