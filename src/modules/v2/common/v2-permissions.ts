import type { V2Role } from './v2.mapper';

/**
 * Ruxsatlar (`resource.action`) katalogi.
 *
 * Standart holatda xodim rol bo'yicha ishlaydi (`@V2Roles`). Egasi xodimga
 * ruxsatlarni qo'lda sozlasa (`PATCH /users/:id/access`), o'sha xodim uchun
 * aynan shu ro'yxat ishlaydi: rol bergan huquqlar meros bo'lib o'tmaydi.
 */
export type PermissionScope = 'company' | 'branch' | 'own';

export interface PermissionAssignment {
  permission: string;
  scope: PermissionScope;
  branch_id: string | null;
}

/** Xodim kartochkasidagi saqlanadigan holat (`User.permissions` JSON). */
export interface StoredAccess {
  grants: PermissionAssignment[];
  delegations: PermissionAssignment[];
  /** Xodim a'zo bo'lgan filiallar. Bo'sh — cheklov yo'q. */
  branch_ids: string[];
}

const CRUD = ['read', 'create', 'update', 'delete'];

const RESOURCES: Record<string, string[]> = {
  students: [...CRUD, 'restore'],
  groups: [...CRUD, 'restore'],
  courses: CRUD,
  lessons: CRUD,
  attendance: ['read', 'mark'],
  schedule: CRUD,
  exams: ['read', 'create'],
  training_programs: CRUD,
  training_enrollments: ['read', 'create', 'update'],
  driving_sessions: ['read', 'create', 'submit', 'review', 'cancel'],
  questions: CRUD,
  question_media: ['read', 'create'],
  test_templates: CRUD,
  test_assignments: ['read', 'create'],
  test_attempts: ['read'],
  payments: CRUD,
  expenses: CRUD,
  expense_payments: ['read', 'create', 'delete'],
  reports: ['read'],
  vehicles: CRUD,
  vehicle_documents: CRUD,
  vehicle_maintenance: CRUD,
  vehicle_transfers: ['read', 'create'],
  vehicle_defects: ['read', 'update'],
  vehicle_inspections: ['read', 'create', 'update', 'review'],
  fuel: ['read', 'create', 'update', 'review'],
  fuel_stations: CRUD,
  staff: [...CRUD, 'restore'],
  branches: [...CRUD, 'restore'],
  leads: CRUD,
  lead_stages: ['read', 'update'],
  lead_sources: ['read', 'create', 'delete'],
  audit: ['read'],
};

export const ALL_PERMISSIONS: string[] = Object.entries(RESOURCES).flatMap(
  ([resource, actions]) => actions.map((action) => `${resource}.${action}`),
);

/** "Faqat o'zinikini" doirasi ma'noli bo'lgan resurslar. */
export const OWN_RESOURCES = [
  'students',
  'lessons',
  'attendance',
  'driving_sessions',
  'leads',
  'questions',
  'test_templates',
  'vehicle_inspections',
  'fuel',
];

const pick = (resources: string[], actions?: string[]) =>
  ALL_PERMISSIONS.filter((key) => {
    const [resource, action] = key.split('.');
    return resources.includes(resource) && (!actions || actions.includes(action));
  });

/** Rollarning tayyor shablonlari (UI "shablonni qo'llash" uchun). */
export const ROLE_TEMPLATES: Record<string, string[]> = {
  manager: ALL_PERMISSIONS.filter(
    (key) =>
      !key.startsWith('branches.') &&
      !key.startsWith('audit.') &&
      !key.endsWith('.restore'),
  ),
  operator: [
    ...pick(['students', 'payments', 'leads'], ['read', 'create', 'update']),
    ...pick(['groups', 'courses', 'lessons', 'schedule'], ['read', 'create']),
    'attendance.read',
    'attendance.mark',
    'driving_sessions.read',
    'driving_sessions.create',
    'driving_sessions.cancel',
    'vehicles.read',
  ],
  accountant: [
    ...pick(['payments', 'reports'], ['read']),
    ...pick(['expenses', 'expense_payments']),
    'fuel.read',
    'fuel.review',
  ],
  teacher: [
    ...pick(
      ['students', 'groups', 'lessons', 'vehicles', 'training_programs'],
      ['read'],
    ),
    'attendance.read',
    'attendance.mark',
    'lessons.create',
    'lessons.update',
    'driving_sessions.read',
    'driving_sessions.submit',
    ...pick(['questions', 'test_templates', 'test_assignments']),
    'vehicle_inspections.read',
    'vehicle_inspections.create',
    'fuel.read',
    'fuel.create',
  ],
};

const SCOPES: PermissionScope[] = ['company', 'branch', 'own'];

function isAssignment(value: unknown): value is PermissionAssignment {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;

  return (
    typeof row.permission === 'string' &&
    SCOPES.includes(row.scope as PermissionScope) &&
    (row.branch_id === null || typeof row.branch_id === 'string')
  );
}

/** Bazadagi JSON → saqlangan holat. Buzuq qism jimgina tashlab yuboriladi. */
export function parseStoredAccess(raw: unknown): StoredAccess {
  const source =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const list = (value: unknown) =>
    Array.isArray(value) ? value.filter(isAssignment) : [];

  return {
    grants: Array.isArray(raw) ? raw.filter(isAssignment) : list(source.grants),
    delegations: list(source.delegations),
    branch_ids: Array.isArray(source.branch_ids)
      ? source.branch_ids.filter(
          (id): id is string => typeof id === 'string',
        )
      : [],
  };
}

export const parseAssignments = (raw: unknown): PermissionAssignment[] =>
  parseStoredAccess(raw).grants;

/**
 * Aktor shu ruxsatga egami. Ruxsatlari qo'lda sozlanmagan bo'lsa — ha:
 * u holda rol tekshiruvi (`@V2Roles`) yakuniy so'zni aytadi.
 */
export function isGranted(
  actor: { role: V2Role; permissions: PermissionAssignment[] | null },
  permission: string,
  branchId: number | null,
): boolean {
  if (actor.role === 'owner' || actor.role === 'dev') return true;
  if (!actor.permissions) return true;

  const branch = branchId ? String(branchId) : null;

  return actor.permissions.some(
    (grant) =>
      grant.permission === permission &&
      (grant.scope === 'company' ||
        !branch ||
        !grant.branch_id ||
        grant.branch_id === branch),
  );
}
