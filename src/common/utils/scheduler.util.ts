/**
 * Shu process rejalashtirilgan ishlarni (`@Cron`) bajarishi kerakmi?
 *
 * Cluster/replica'da bu savol muhim: `ScheduleModule` har bir process'da
 * yuklansa, `payments` dagi 5 daqiqalik job ham, kechasi 3 da ishlaydigan
 * token tozalash ham worker soniga karrali marta bajariladi.
 *
 * Qoida oddiy: `SCHEDULER_ENABLED` aniq berilgan bo'lsa - o'shanga
 * bo'ysunamiz (cluster primary uni faqat bitta worker'ga `true` qilib
 * uzatadi; docker replica'da esa alohida worker servisiga qo'yiladi).
 * Berilmagan bo'lsa - bu yakka process, demak cron shu yerda ishlaydi.
 */
export function isSchedulerProcess(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.SCHEDULER_ENABLED;

  if (raw === undefined || raw === '') return true;

  return raw === 'true' || raw === '1';
}
