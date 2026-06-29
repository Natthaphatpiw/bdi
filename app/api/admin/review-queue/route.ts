import { NextRequest } from "next/server";
import { ok, requireAdmin } from "@/lib/http";
import { readCypher } from "@/lib/neo4j";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/review-queue → KG nodes flagged review_required=true
// Gated by ADMIN_USER_IDS allow-list (requireAdmin).
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof Response) return auth;

  const rows = await readCypher<{ label: string; node_id: string; name: string; confidence: string }>(
    `MATCH (n) WHERE n.review_required = true
     RETURN labels(n)[0] AS label,
            coalesce(n.facility_id, n.benefit_id, n.condition_id, n.service_id, n.right_id, elementId(n)) AS node_id,
            coalesce(n.name, n.name_th, n.condition_name_th, n.service_name_th, n.benefit_name_th, n.title, '') AS name,
            coalesce(n.confidence,'') AS confidence
     ORDER BY label LIMIT 300`
  );
  return ok({ count: rows.length, items: rows });
}
