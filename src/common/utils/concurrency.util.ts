import * as os from 'node:os';

/** Bir konteynerda ko'tariladigan HTTP worker'larining eng ko'p soni. */
const MAX_WORKERS = 8;

/**
 * Konteynerga ajratilgan CPU sonini aniqlaydi.
 *
 * `os.cpus().length` xost mashinasining barcha yadrolarini qaytaradi -
 * Docker'da `--cpus=2` bilan cheklangan bo'lsa ham. Shuning uchun avval
 * cgroup kvotasiga qaraymiz, bo'lmasa `availableParallelism` ga tushamiz.
 */
function detectCpuCount(): number {
  // Node 18.14+ da bor va cgroup cheklovini hisobga oladi.
  const available = (
    os as unknown as { availableParallelism?: () => number }
  ).availableParallelism?.();

  if (available && available > 0) return available;

  return os.cpus().length || 1;
}

/**
 * Nechta HTTP worker ishga tushishini hisoblaydi.
 *
 * `WEB_CONCURRENCY=1` - cluster butunlay o'chadi (development va debug uchun).
 * `WEB_CONCURRENCY=0` yoki berilmagan - CPU soniga qarab avtomatik.
 */
export function resolveWorkerCount(
  env: NodeJS.ProcessEnv = process.env,
): number {
  const raw = Number(env.WEB_CONCURRENCY);

  if (Number.isInteger(raw) && raw > 0) {
    return Math.min(raw, MAX_WORKERS);
  }

  return Math.min(detectCpuCount(), MAX_WORKERS);
}
