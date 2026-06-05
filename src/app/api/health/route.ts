import { jsonError, jsonOk } from "../../../server/api-route";
import { getHealth } from "../../../server/liferl-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return jsonOk(getHealth());
  } catch (error) {
    return jsonError(error);
  }
}
