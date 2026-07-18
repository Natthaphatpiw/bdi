import { z } from "zod";
import {
  PassportConsentScopeSchema,
  PassportExclusionSchema,
  PatientRelationSchema,
  SchemeSchema,
} from "./contracts";
import { CLIENT_ANALYTICS_EVENTS } from "./analytics";

const safeText = (max: number) => z.string().trim().min(1).max(max);

export const CreateCaseInputSchema = z.object({
  narrative: safeText(4_000),
  patientRelation: PatientRelationSchema,
  scheme: SchemeSchema,
  area: z.string().trim().max(160).default(""),
  demoSessionId: z.string().trim().min(12).max(200).optional(),
  demoScenarioId: z.string().trim().max(120).optional(),
  demo: z.boolean().default(false),
});

export const TurnCaseInputSchema = z
  .object({
    message: z.string().trim().max(1_000).optional(),
    answers: z.record(z.string().max(80), z.string().trim().max(500)).optional(),
    answer: z
      .object({
        questionId: z.string().max(160),
        slotKey: z.string().max(80),
        value: z.string().trim().min(1).max(500),
      })
      .optional(),
  })
  .refine((value) => Boolean(value.message || value.answer || Object.keys(value.answers ?? {}).length), {
    message: "ต้องมีคำตอบหรือข้อความ",
  });

export const ConfirmCaseInputSchema = z.object({
  confirmed: z.literal(true),
  updates: z.object({
    patientRelation: PatientRelationSchema,
    age: z.number().int().min(0).max(125).nullable(),
    scheme: SchemeSchema,
    area: safeText(160),
    symptoms: z.array(safeText(160)).max(20),
    duration: z.string().trim().max(120).default(""),
    userGoal: safeText(500),
  }),
});

export const CreatePassportInputSchema = z.object({
  consent: z.object({
    scope: z.array(PassportConsentScopeSchema).length(1),
    shareAllowed: z.boolean(),
    sensitiveFieldsExcluded: z.array(PassportExclusionSchema).max(30),
  }),
});

export const CreateShareInputSchema = z.object({
  consentGranted: z.literal(true),
  expiresInHours: z.number().int().min(1).max(72).default(72),
});

export const FollowUpInputSchema = z.object({
  question: safeText(1_000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(800),
      }),
    )
    .max(8)
    .default([]),
});

export const FeedbackInputSchema = z.object({
  outcome: z.enum([
    "RECEIVED_AS_PLANNED",
    "RECEIVED_WITH_EXTRA_COST",
    "RIGHT_NOT_ACCEPTED",
    "SERVICE_NOT_AVAILABLE",
    "FACILITY_CLOSED",
    "MISSING_DOCUMENTS",
    "TRANSFERRED_ELSEWHERE",
    "DID_NOT_GO",
    "OTHER",
  ]),
  rightAccepted: z.boolean().nullable(),
  discrepancy: z.string().trim().max(1_000).nullable(),
});

export const ResetDemoInputSchema = z.object({
  demoSessionId: z.string().trim().min(12).max(200),
});

export const TrackEventInputSchema = z.object({
  event: z.enum(CLIENT_ANALYTICS_EVENTS),
  payload: z.object({
    routeType: z.enum(["PRIMARY", "BACKUP"]).optional(),
    status: z.string().trim().max(80).optional(),
  }).strict().default({}),
});

export type CreateCaseInput = z.infer<typeof CreateCaseInputSchema>;
export type TurnCaseInput = z.infer<typeof TurnCaseInputSchema>;
export type ConfirmCaseInput = z.infer<typeof ConfirmCaseInputSchema>;
