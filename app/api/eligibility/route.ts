import { NextRequest } from "next/server";
import { ok, ERR, requireUser } from "@/lib/http";
import { evaluateBenefit, evaluateRule, getRules, questionFor } from "@/lib/ruleEngine";
import { benefitById } from "@/lib/kg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/eligibility { benefit_id?, rule_id?, attrs } → deterministic result
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  let body: { benefit_id?: string; rule_id?: string; attrs?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return ERR.badRequest();
  }
  const attrs = body.attrs ?? {};

  if (body.rule_id) {
    const rule = getRules().find((r) => r.rule_id === body.rule_id);
    if (!rule) return ERR.notFound("ไม่พบกฎนี้");
    const r = evaluateRule(rule.logic as Record<string, unknown>, attrs);
    return ok(shape(r.status, r, body.benefit_id));
  }

  if (body.benefit_id) {
    const evals = evaluateBenefit(body.benefit_id, attrs);
    if (!evals.length) return ERR.notFound("ไม่พบกฎสำหรับสิทธิประโยชน์นี้");
    const r = evals[0];
    return ok(shape(r.status, r, body.benefit_id));
  }

  return ERR.badRequest("ต้องระบุ benefit_id หรือ rule_id");
}

function shape(
  status: string,
  r: ReturnType<typeof evaluateRule>,
  benefitId?: string
) {
  const b = benefitId ? benefitById(benefitId) : undefined;
  return {
    status,
    value: r.value,
    missing_attrs: r.missing_attrs,
    ask_th: r.missing_attrs.length ? questionFor(r.missing_attrs[0]) : null,
    trace: r.trace,
    note: r.note,
    sources: b?.source_url ? [{ title: b.source_title, url: b.source_url, publisher: b.publisher }] : [],
  };
}
