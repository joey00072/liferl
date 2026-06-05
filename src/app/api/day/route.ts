import { jsonError, jsonOk, readJsonBody } from "../../../server/api-route";
import { updateDay } from "../../../server/liferl-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(request: Request) {
  try {
    return jsonOk(await updateDay(await readJsonBody(request)));
  } catch (error) {
    return jsonError(error);
  }
}
