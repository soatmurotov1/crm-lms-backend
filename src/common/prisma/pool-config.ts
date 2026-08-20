import { resolveWorkerCount } from '../utils/concurrency.util';

/**
 * Postgres'dagi ulanishlarning shu ilova uchun ajratilgan ulushi.
 *
 * Postgres'ning `max_connections` standarti 100, undan bir nechtasi
 * superuser uchun zaxiralangan. Migratsiya, `psql`, backup skripti va
 * monitoring ham ulanadi - shuning uchun ilovaga hammasini bermaymiz.
 */
const DEFAULT_CONNECTION_BUDGET = 60;

/** Bitta process uchun pool chegaralari. */
const MIN_POOL_MAX = 2;
const MAX_POOL_MAX = 20;

const DEFAULT_IDLE_TIMEOUT_MS = 10_000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 5_000;
const DEFAULT_MAX_LIFETIME_SECONDS = 1_800;

export interface PoolConfig {
  max: number;
  idleTimeoutMillis: number;
  connectionTimeoutMillis: number;
  maxLifetimeSeconds: number;
  /** `max` qayerdan kelgani - log'da ko'rinadi. */
  source: string;
}

type EnvReader = (key: string) => string | undefined;

function readInt(read: EnvReader, key: string): number | undefined {
  const value = Number(read(key));
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Har bir process uchun `pg` pool sozlamalarini hisoblaydi.
 *
 * Muhimi shundaki, chegara **process boshiga** qo'yiladi. Cluster N ta
 * worker ko'tarsa, Postgres'ga ketadigan ulanishlar soni `N * max` bo'ladi.
 * Shuning uchun `DB_POOL_MAX` aniq berilmagan bo'lsa, uni umumiy budjetni
 * worker soniga bo'lib olamiz - shunda worker qo'shilishi `max_connections`
 * ni oshirib yubormaydi.
 */
export function resolvePoolConfig(read: EnvReader): PoolConfig {
  const explicitMax = readInt(read, 'DB_POOL_MAX');
  const budget =
    readInt(read, 'DB_CONNECTION_BUDGET') ?? DEFAULT_CONNECTION_BUDGET;
  const workers = resolveWorkerCount();

  const max = explicitMax
    ? clamp(explicitMax, MIN_POOL_MAX, MAX_POOL_MAX)
    : clamp(Math.floor(budget / workers), MIN_POOL_MAX, MAX_POOL_MAX);

  const source = explicitMax
    ? 'DB_POOL_MAX'
    : `budjet ${budget} / ${workers} worker`;

  return {
    max,
    idleTimeoutMillis:
      readInt(read, 'DB_POOL_IDLE_TIMEOUT_MS') ?? DEFAULT_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis:
      readInt(read, 'DB_POOL_CONNECTION_TIMEOUT_MS') ??
      DEFAULT_CONNECTION_TIMEOUT_MS,
    maxLifetimeSeconds:
      readInt(read, 'DB_POOL_MAX_LIFETIME_SECONDS') ??
      DEFAULT_MAX_LIFETIME_SECONDS,
    source,
  };
}
