import type { Prisma } from '@prisma/client';

/**
 * O'quvchi kabineti bo'limlari. Markaz egasi har birini yoqib-o'chira oladi;
 * `enabled = false` — kabinet butunlay yopiq (o'quvchi kira olmaydi).
 */
export const LEARNER_SECTIONS = [
  'schedule',
  'courses',
  'assignments',
  'quizzes',
  'grades',
  'attendance',
  'payments',
  'notifications',
] as const;

export type LearnerSection = (typeof LEARNER_SECTIONS)[number];

export type LearnerPortalSettings = { enabled: boolean } & Record<
  LearnerSection,
  boolean
>;

export const DEFAULT_LEARNER_PORTAL: LearnerPortalSettings = {
  enabled: true,
  schedule: true,
  courses: true,
  assignments: true,
  quizzes: true,
  grades: true,
  attendance: true,
  payments: true,
  notifications: true,
};

/** Bazadagi JSON → to'liq sozlama (yo'q kalitlar standart qiymatda). */
export function parseLearnerPortal(
  raw: Prisma.JsonValue | null | undefined,
): LearnerPortalSettings {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const result = { ...DEFAULT_LEARNER_PORTAL };
  for (const key of ['enabled', ...LEARNER_SECTIONS] as const) {
    if (typeof source[key] === 'boolean') result[key] = source[key];
  }
  return result;
}
