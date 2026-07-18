export type EligibilityResult = "ELIGIBLE" | "NOT_ELIGIBLE" | "INDETERMINATE";
export type PredicateResult = boolean | null;

export interface EligibilityTraceItem {
  path: string;
  attr: string;
  operator: string;
  expected: unknown;
  actual: unknown;
  result: PredicateResult;
}

export interface EligibilityDecision {
  result: EligibilityResult;
  missingAttrs: string[];
  trace: EligibilityTraceItem[];
}

type Logic = Record<string, unknown>;

export function evaluateEligibilityRule(
  logic: Logic,
  requiredAttrs: string[],
  facts: Record<string, unknown>,
): EligibilityDecision {
  const trace: EligibilityTraceItem[] = [];
  const missingRequired = requiredAttrs.filter((attr) => !known(facts[attr]));
  const evaluated = evaluateNode(logic, facts, trace, "root");
  const missingFromTrace = trace.filter((item) => item.result === null).map((item) => item.attr);
  const missingAttrs = unique([...missingRequired, ...missingFromTrace]);
  // A known disqualifying predicate in an `all` rule is conclusive even when
  // unrelated attributes are missing. Missing values may never turn a
  // potentially eligible case into eligible, however.
  const result: EligibilityResult = evaluated === false
    ? "NOT_ELIGIBLE"
    : missingAttrs.length
      ? "INDETERMINATE"
      : evaluated === true
        ? "ELIGIBLE"
        : "INDETERMINATE";
  return { result, missingAttrs, trace };
}

function evaluateNode(
  node: Logic,
  facts: Record<string, unknown>,
  trace: EligibilityTraceItem[],
  path: string,
): PredicateResult {
  if (typeof node.attr === "string") return evaluateLeaf(node, facts, trace, path);
  if (Array.isArray(node.all)) {
    const values = node.all.map((child, index) =>
      evaluateNode(asLogic(child), facts, trace, `${path}.all[${index}]`),
    );
    if (values.some((value) => value === false)) return false;
    if (values.some((value) => value === null)) return null;
    return true;
  }
  if (Array.isArray(node.any)) {
    const values = node.any.map((child, index) =>
      evaluateNode(asLogic(child), facts, trace, `${path}.any[${index}]`),
    );
    if (values.some((value) => value === true)) return true;
    if (values.some((value) => value === null)) return null;
    return false;
  }
  if (node.not !== undefined) {
    const value = evaluateNode(asLogic(node.not), facts, trace, `${path}.not`);
    return value === null ? null : !value;
  }
  return null;
}

function evaluateLeaf(
  node: Logic,
  facts: Record<string, unknown>,
  trace: EligibilityTraceItem[],
  path: string,
): PredicateResult {
  const attr = String(node.attr);
  const operator = String(node.op ?? node.operator ?? "==");
  const expected = node.value;
  const actual = facts[attr];
  let result: PredicateResult = null;
  if (known(actual)) {
    if (operator === "exists") result = true;
    else if (operator === "==") result = actual === expected;
    else if (operator === "!=") result = actual !== expected;
    else if (operator === "in") result = Array.isArray(expected) ? expected.includes(actual) : null;
    else if ([">", ">=", "<", "<="].includes(operator)) {
      const left = Number(actual);
      const right = Number(expected);
      if (Number.isFinite(left) && Number.isFinite(right)) {
        result = operator === ">" ? left > right : operator === ">=" ? left >= right : operator === "<" ? left < right : left <= right;
      }
    }
  }
  trace.push({ path, attr, operator, expected, actual: known(actual) ? actual : null, result });
  return result;
}

function asLogic(value: unknown): Logic {
  return value !== null && typeof value === "object" ? (value as Logic) : {};
}

function known(value: unknown): boolean {
  return value !== null && value !== undefined && value !== "";
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}
