import { resolvePoolConfig } from './pool-config';
import { resolveWorkerCount } from '../utils/concurrency.util';
import { isSchedulerProcess } from '../utils/scheduler.util';

/**
 * Cluster arifmetikasi.
 *
 * Bu uchta funksiya kichkina, lekin ular noto'g'ri hisoblasa oqibati katta:
 *
 *  - pool chegarasi PROCESS boshiga qo'yiladi, ya'ni Postgres'ga ketadigan
 *    ulanishlar soni `worker × max`. Bo'lish unutilsa, worker qo'shilishi
 *    `max_connections` ni bosib ketadi va butun ilova "too many clients"
 *    bilan yiqiladi;
 *  - `SCHEDULER_ENABLED` noto'g'ri o'qilsa, to'lov holatini yangilaydigan
 *    cron har bir worker'da takrorlanadi.
 */

const env = (values: Record<string, string>) => (key: string) => values[key];

describe('resolveWorkerCount', () => {
  it('WEB_CONCURRENCY berilgan bo‘lsa o‘shani oladi', () => {
    expect(resolveWorkerCount({ WEB_CONCURRENCY: '3' })).toBe(3);
  });

  it('cluster’ni o‘chirish uchun 1 ni qabul qiladi', () => {
    expect(resolveWorkerCount({ WEB_CONCURRENCY: '1' })).toBe(1);
  });

  it('yuqori chegaradan oshirmaydi', () => {
    expect(resolveWorkerCount({ WEB_CONCURRENCY: '64' })).toBe(8);
  });

  it('yaroqsiz qiymatda avtomatik aniqlashga tushadi', () => {
    for (const raw of ['0', '-2', 'abc', '']) {
      const workers = resolveWorkerCount({ WEB_CONCURRENCY: raw });

      expect(workers).toBeGreaterThanOrEqual(1);
      expect(workers).toBeLessThanOrEqual(8);
    }
  });

  it('sozlama umuman bo‘lmasa ham ishlaydi', () => {
    const workers = resolveWorkerCount({});

    expect(workers).toBeGreaterThanOrEqual(1);
    expect(workers).toBeLessThanOrEqual(8);
  });
});

describe('isSchedulerProcess', () => {
  it('sozlama berilmagan bo‘lsa cron shu process’da ishlaydi', () => {
    expect(isSchedulerProcess({})).toBe(true);
    expect(isSchedulerProcess({ SCHEDULER_ENABLED: '' })).toBe(true);
  });

  it('aniq yoqilgan bo‘lsa rost', () => {
    expect(isSchedulerProcess({ SCHEDULER_ENABLED: 'true' })).toBe(true);
    expect(isSchedulerProcess({ SCHEDULER_ENABLED: '1' })).toBe(true);
  });

  it('aniq o‘chirilgan bo‘lsa yolg‘on', () => {
    expect(isSchedulerProcess({ SCHEDULER_ENABLED: 'false' })).toBe(false);
    expect(isSchedulerProcess({ SCHEDULER_ENABLED: '0' })).toBe(false);
  });
});

describe('resolvePoolConfig', () => {
  const withWorkers = (count: string) => {
    process.env.WEB_CONCURRENCY = count;
  };

  afterEach(() => {
    delete process.env.WEB_CONCURRENCY;
  });

  it('budjetni worker soniga bo‘ladi', () => {
    withWorkers('4');

    const config = resolvePoolConfig(env({ DB_CONNECTION_BUDGET: '40' }));

    expect(config.max).toBe(10);
    expect(config.source).toContain('4 worker');
  });

  /*
    Eng muhim tekshiruv: worker soni oshganda BITTA process'ning ulushi
    kamayishi kerak, aks holda umumiy ulanishlar soni chegaradan oshadi.
  */
  it('worker qo‘shilganda process ulushini kamaytiradi', () => {
    withWorkers('2');
    const two = resolvePoolConfig(env({ DB_CONNECTION_BUDGET: '40' })).max;

    withWorkers('8');
    const eight = resolvePoolConfig(env({ DB_CONNECTION_BUDGET: '40' })).max;

    expect(eight).toBeLessThan(two);
    expect(eight * 8).toBeLessThanOrEqual(40);
  });

  it('DB_POOL_MAX berilsa bo‘lishni bekor qiladi', () => {
    withWorkers('4');

    const config = resolvePoolConfig(env({ DB_POOL_MAX: '7' }));

    expect(config.max).toBe(7);
    expect(config.source).toBe('DB_POOL_MAX');
  });

  it('juda past qiymatda ham kamida 2 ta ulanish qoldiradi', () => {
    withWorkers('8');

    // 8 ta worker uchun 4 ta ulanish — bo'lgandan keyin 0 chiqadi.
    const config = resolvePoolConfig(env({ DB_CONNECTION_BUDGET: '4' }));

    expect(config.max).toBe(2);
  });

  it('juda baland qiymatni yuqori chegara bilan cheklaydi', () => {
    withWorkers('1');

    const config = resolvePoolConfig(env({ DB_CONNECTION_BUDGET: '500' }));

    expect(config.max).toBe(20);
  });

  it('DB_POOL_MAX ham chegaralar ichida ushlanadi', () => {
    withWorkers('1');

    expect(resolvePoolConfig(env({ DB_POOL_MAX: '1' })).max).toBe(2);
    expect(resolvePoolConfig(env({ DB_POOL_MAX: '999' })).max).toBe(20);
  });

  it('taymautlar uchun oqilona standart qiymatlar beradi', () => {
    withWorkers('1');

    const config = resolvePoolConfig(env({}));

    // Nol bo'lsa so'rov cheksiz kutadi — bu "API qotib qoldi" degani.
    expect(config.connectionTimeoutMillis).toBeGreaterThan(0);
    expect(config.idleTimeoutMillis).toBeGreaterThan(0);
    expect(config.maxLifetimeSeconds).toBeGreaterThan(0);
  });

  it('yaroqsiz env qiymatini e’tiborsiz qoldiradi', () => {
    withWorkers('1');

    const config = resolvePoolConfig(
      env({ DB_POOL_MAX: 'abc', DB_POOL_IDLE_TIMEOUT_MS: '-5' }),
    );

    expect(config.source).not.toBe('DB_POOL_MAX');
    expect(config.idleTimeoutMillis).toBeGreaterThan(0);
  });
});
