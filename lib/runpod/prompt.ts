// Faithful TS port of thai27b/system_prompt.py + prescreen/prompt.py.
// Builds the EXACT prompt the deployed ThaiLLM-27B-Prescreen model expects and
// parses its <disease>/<department>/<severity> XML output.
import vocab from "./vocab.json";

export const DISEASES: string[] = vocab.diseases;
export const DEPARTMENTS: string[] = vocab.departments;

// Upstream system prompt lists only these three (the model never emits
// "Observe at Home" in practice — that under-triage gap is covered by rails).
const SEVERITY_FOR_PROMPT = ["Emergency", "Visit Hospital / Clinic", "Observe at Home"];

const SYSTEM_PROMPT_TEMPLATE = `SYSTEM INSTRUCTION: think silently if needed. You are a clinical triage classification model.

Your goal is to classify a patient case into:
1. the most likely primary disease / diagnosis.
2. the most appropriate hospital department.
3. the triage severity level.

Possible severity levels (you must choose the single best match from this list):
${SEVERITY_FOR_PROMPT.map((s) => `- ${s}`).join("\n")}

Possible diseases (you must choose the single best match from this list):
{possible_diseases}

Possible departments (you must choose the single best match from this list):
{possible_departments}

Instructions:
- Think step by step.
- Use all available evidence from both the patient profile and the conversation history.
- If there is conflicting information, prefer the most recent and most specific clinical detail.
- Focus on the primary diagnosis, not every possible differential.
- Route to the department that should most appropriately take primary responsibility for the case.
- Assign severity based on clinical urgency and risk, not just symptom intensity.

After you are done thinking, always respond in the following XML format and nothing else outside of the thinking brackets:

<disease>[primary disease name]</disease>
<department>[department name]</department>
<severity>[severity level]</severity>
`;

const PROMPT_TEMPLATE = `
You are given a structured patient case for hospital triage.

## Patient Profile

### Demographics
- Age: {age}
- Gender: {gender}
- Height: {height} cm
- Weight: {weight} kg
- Occupation: {occupation}

### Presenting Problem
- Chief Complaint: {complaint}
- Primary Symptom: {primary_symptom}
- Secondary Symptoms: {secondary_symptoms}

### History of Present Illness (OLDCART)
- Onset: {oldcart_onset}
- Location: {oldcart_location}
- Duration: {oldcart_duration}
- Characteristics: {oldcart_characteristic}
- Aggravating Factors: {oldcart_aggravating}
- Relieving Factors: {oldcart_relieving}
- Timing: {oldcart_timing}
- Severity: {oldcart_severity}

### Past Medical History
- Underlying Diseases: {underlying_diseases}
- Medical History: {medical_history}
- Current Medication: {current_medication}
- Allergies: {drug_food_allergies}
- Surgical History: {surgical_history}

## Conversation History
{conversation}

## Task
Using both the structured patient profile and the conversation history:

1. Infer the single most likely primary disease or diagnosis.
2. Choose the single most appropriate hospital department for routing.
3. Choose the triage severity level.

## Important Rules
- Use the conversation history to refine or update the structured profile if newer details appear there.
- Prioritize urgent or dangerous conditions when symptoms suggest possible emergency illness.
- Do not invent facts that are not supported by the profile or conversation.
- If information is incomplete, choose the most likely answer based on the available evidence.
- Output only the final answer in the required XML format.
`;

export interface PatientCase {
  age?: number | string;
  gender?: string;
  height?: number | string;
  weight?: number | string;
  occupation?: string;
  complaint?: string;
  primary_symptom?: string;
  secondary_symptoms?: string[] | string;
  oldcart_onset?: string;
  oldcart_location?: string;
  oldcart_duration?: string;
  oldcart_characteristic?: string;
  oldcart_aggravating?: string;
  oldcart_relieving?: string;
  oldcart_timing?: string;
  oldcart_severity?: string;
  underlying_diseases?: string[] | string;
  medical_history?: string;
  current_medication?: string;
  drug_food_allergies?: string;
  surgical_history?: string;
  conversation?: { q?: string; a?: string }[] | string;
}

let _systemPrompt: string | null = null;
export function buildSystemPrompt(): string {
  if (_systemPrompt) return _systemPrompt;
  _systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace(
    "{possible_diseases}",
    DISEASES.map((d) => `- ${d}`).join("\n")
  ).replace("{possible_departments}", DEPARTMENTS.map((d) => `- ${d}`).join("\n"));
  return _systemPrompt;
}

function render(value: unknown): string {
  if (value === null || value === undefined || value === "") return "N/A";
  if (Array.isArray(value)) return value.length ? value.map(String).join(", ") : "N/A";
  return String(value);
}

function formatConversation(turns: PatientCase["conversation"]): string {
  if (!turns || turns === "") return "- (no conversation history)";
  if (typeof turns === "string") return turns;
  const lines = turns.map((t) => `- Q: ${t.q ?? "None"}\n  A: ${t.a ?? ""}`);
  return lines.length ? lines.join("\n") : "- (no conversation history)";
}

export function buildUserPrompt(c: PatientCase): string {
  const map: Record<string, string> = {
    age: render(c.age),
    gender: render(c.gender),
    height: render(c.height),
    weight: render(c.weight),
    occupation: render(c.occupation),
    complaint: render(c.complaint),
    primary_symptom: render(c.primary_symptom),
    secondary_symptoms: render(c.secondary_symptoms),
    oldcart_onset: render(c.oldcart_onset),
    oldcart_location: render(c.oldcart_location),
    oldcart_duration: render(c.oldcart_duration),
    oldcart_characteristic: render(c.oldcart_characteristic),
    oldcart_aggravating: render(c.oldcart_aggravating),
    oldcart_relieving: render(c.oldcart_relieving),
    oldcart_timing: render(c.oldcart_timing),
    oldcart_severity: render(c.oldcart_severity),
    underlying_diseases: render(c.underlying_diseases),
    medical_history: render(c.medical_history),
    current_medication: render(c.current_medication),
    drug_food_allergies: render(c.drug_food_allergies),
    surgical_history: render(c.surgical_history),
    conversation: formatConversation(c.conversation),
  };
  return PROMPT_TEMPLATE.replace(/\{(\w+)\}/g, (_, k: string) =>
    k in map ? map[k] : "N/A"
  );
}

export interface ParsedPrediction {
  disease: string | null;
  department: string | null;
  severity: string | null;
  raw: string;
}

export function parsePrediction(text: string): ParsedPrediction {
  const grab = (tag: string): string | null => {
    const m = (text || "").match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
    return m ? m[1].trim() : null;
  };
  return {
    disease: grab("disease"),
    department: grab("department"),
    severity: grab("severity"),
    raw: text,
  };
}
