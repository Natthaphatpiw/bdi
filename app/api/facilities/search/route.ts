import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { searchFacilities } from "@/lib/kg";
import type { Scheme } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/facilities/search
// { scheme, condition_id?, area?, lat?, lng?, limit? } → { facilities }
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: {
    scheme?: Scheme;
    condition_id?: string;
    service_id?: string;
    area?: string;
    lat?: number;
    lng?: number;
    limit?: number;
  };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest();
  }
  if (!body.scheme) return ERR.badRequest("ต้องระบุสิทธิ (scheme)");

  const facilities = await searchFacilities({
    scheme: body.scheme,
    conditionId: body.condition_id,
    serviceId: body.service_id,
    area: body.area,
    lat: body.lat,
    lng: body.lng,
    limit: body.limit ?? 3,
  });
  return ok({ facilities });
}
