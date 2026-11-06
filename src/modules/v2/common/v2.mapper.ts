import { NotFoundException } from '@nestjs/common';
import { CourseType, PaymentMethod, Prisma, Role } from '@prisma/client';
import { tashkentDateKey } from 'src/common/utils/tashkent-time.util';

/**
 * `/api/v2` — Automaktab tenant frontendi (`autodrive-frontend`) kutadigan
 * shartnoma. Bu faylda ikki dunyo orasidagi tarjima turadi:
 *
 *  - maydonlar `snake_case` da;
 *  - id'lar matn (frontend ularni shaffof kalit sifatida ishlatadi);
 *  - rollar va kurs turlari boshqa nom bilan yuradi.
 *
 * Eski `/api/...` endpointlari (mobil ilova va avvalgi panel) o'zgarmaydi.
 */
export type V2Role =
  | 'dev'
  | 'owner'
  | 'manager'
  | 'accountant'
  | 'operator'
  | 'teacher';

const ROLE_MAP: Record<Role, V2Role | null> = {
  [Role.SUPERADMIN]: 'dev',
  [Role.ADMIN]: 'owner',
  [Role.MANAGEMENT]: 'manager',
  [Role.ADMINSTRATOR]: 'operator',
  [Role.ACCOUNTANT]: 'accountant',
  [Role.TEACHER]: 'teacher',
  // O'quvchi bu panelga kirmaydi.
  [Role.STUDENT]: null,
};

export const toV2Role = (role: Role): V2Role | null => ROLE_MAP[role];

/** Frontend rolidan `User` jadvalidagi rolga (o'qituvchi alohida jadvalda). */
export const USER_ROLE_OF: Partial<Record<V2Role, Role>> = {
  dev: Role.SUPERADMIN,
  owner: Role.ADMIN,
  manager: Role.MANAGEMENT,
  operator: Role.ADMINSTRATOR,
  accountant: Role.ACCOUNTANT,
};

export type V2CourseType = 'tezkor' | 'avto_maktab';

export const toV2CourseType = (type: CourseType): V2CourseType =>
  type === CourseType.EXPRESS ? 'tezkor' : 'avto_maktab';

export const fromV2CourseType = (
  type?: V2CourseType | string | null,
): CourseType | undefined =>
  type === 'tezkor'
    ? CourseType.EXPRESS
    : type === 'avto_maktab'
      ? CourseType.AUTO_SCHOOL
      : undefined;

export type V2PaymentMethod = 'naqd' | 'karta' | 'perechisleniya';

const METHOD_TO_DB: Record<V2PaymentMethod, PaymentMethod> = {
  naqd: PaymentMethod.CASH,
  karta: PaymentMethod.CARD,
  perechisleniya: PaymentMethod.TRANSFER,
};

export const fromV2PaymentMethod = (
  method?: V2PaymentMethod | string | null,
): PaymentMethod | undefined =>
  method ? METHOD_TO_DB[method as V2PaymentMethod] : undefined;

/** Payme va eski "qo'lda" to'lovlar frontendda karta / naqd bo'lib ko'rinadi. */
export const toV2PaymentMethod = (
  method: PaymentMethod | null | undefined,
): V2PaymentMethod | null => {
  switch (method) {
    case PaymentMethod.CASH:
    case PaymentMethod.MANUAL:
      return 'naqd';
    case PaymentMethod.CARD:
    case PaymentMethod.PAYME:
      return 'karta';
    case PaymentMethod.TRANSFER:
      return 'perechisleniya';
    default:
      return null;
  }
};

export const toId = (id: number): string => String(id);

/**
 * `Teacher` va `User` jadvallarining ID hisoblagichi alohida, frontendda esa
 * ular bitta "xodimlar" ro'yxatida turadi. To'qnashmasligi uchun o'qituvchi
 * id'si `t` bilan boshlanadi: `t12`.
 */
export const toTeacherId = (id: number): string => `t${id}`;

export type StaffRef = { kind: 'user' | 'teacher'; id: number };

/** `"12"` → xodim, `"t12"` → o'qituvchi. Yaroqsiz qiymat — `null`. */
export function parseStaffId(value: string | null | undefined): StaffRef | null {
  if (!value) return null;
  const match = /^(t?)(\d{1,9})$/.exec(value.trim());
  if (!match) return null;

  const id = Number(match[2]);
  if (id < 1) return null;

  return { kind: match[1] ? 'teacher' : 'user', id };
}

export const staffIdOf = (ref: StaffRef): string =>
  ref.kind === 'teacher' ? toTeacherId(ref.id) : toId(ref.id);

/**
 * Yo'ldagi id'ni songa aylantiradi. Yaroqsiz qiymat — "topilmadi": 400 emas,
 * chunki frontend uchun bu shunchaki mavjud bo'lmagan yozuv.
 */
export function parseId(value: string | undefined, label = 'Yozuv'): number {
  const id = Number(value);

  if (!value || !/^\d{1,9}$/.test(value) || id < 1) {
    throw new NotFoundException(`${label} topilmadi`);
  }

  return id;
}

/** Ixtiyoriy id: bo'sh bo'lsa `undefined`, yaroqsiz bo'lsa `null`. */
export function optionalId(value?: string | null): number | null | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return /^\d{1,9}$/.test(value) && Number(value) > 0 ? Number(value) : null;
}

/** Foiz, bitta kasr xonasigacha. Maxraj 0 bo'lsa — 0. */
export function percent(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}

/** Pul matn ko'rinishida: `"1500000.00"`. */
export const money = (value: Prisma.Decimal | number | null | undefined) =>
  new Prisma.Decimal(value ?? 0).toFixed(2);

/** Pul son ko'rinishida (o'quvchi va to'lov ekranlari son kutadi). */
export const num = (value: Prisma.Decimal | number | null | undefined) =>
  new Prisma.Decimal(value ?? 0).toNumber();

export const iso = (value: Date | null | undefined): string | null =>
  value ? value.toISOString() : null;

/** Toshkent kalendar kuni: `YYYY-MM-DD`. */
export const dateKey = (value: Date | null | undefined): string | null =>
  value ? tashkentDateKey(value) : null;

/** `"Ali Valiyev"` → ism va familiya (birinchi bo'shliq bo'yicha). */
export function splitName(fullName: string): {
  first: string;
  last: string;
} {
  const trimmed = (fullName ?? '').trim();
  const index = trimmed.indexOf(' ');

  return index > 0
    ? { first: trimmed.slice(0, index), last: trimmed.slice(index + 1) }
    : { first: trimmed, last: '' };
}

export const joinName = (...parts: (string | null | undefined)[]) =>
  parts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join(' ');
