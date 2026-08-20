#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * API yuk testi.
 *
 * Savol oddiy: tizim bir vaqtda nechta foydalanuvchini ko'taradi? Buni
 * taxmin qilib bo'lmaydi - o'lchash kerak. Skript login qiladi, keyin
 * panel ochilganda chaqiriladigan endpoint'larni belgilangan concurrency
 * bilan uradi va har biri uchun p50/p95/p99, RPS va xatolarni chiqaradi.
 *
 * Ishlatish:
 *   node scripts/load-test.js
 *   node scripts/load-test.js --connections 100 --duration 30
 *   node scripts/load-test.js --url https://api.example.com --only payments
 *
 * Kerakli env (yoki .env dan olinadi):
 *   LOADTEST_URL        - standart http://localhost:4041
 *   LOADTEST_PHONE      - login uchun telefon (SUPERADMIN_PHONE ham bo'ladi)
 *   LOADTEST_PASSWORD   - login uchun parol
 *
 * DIQQAT: bu skriptni ishlab chiqarish bazasiga qarshi ishlatmang.
 * Faqat GET so'rovlar yuboriladi, lekin yuk real foydalanuvchilarga tegadi.
 */

const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

let autocannon;
try {
  autocannon = require('autocannon');
} catch {
  console.error(
    "autocannon topilmadi. O'rnating:\n  npm install --save-dev autocannon",
  );
  process.exit(1);
}

/* ------------------------------------------------------------------ */
/* Argumentlar                                                         */
/* ------------------------------------------------------------------ */

function parseArgs(argv) {
  const args = {};

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;

    const key = token.slice(2);
    const next = argv[i + 1];

    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }

  return args;
}

const args = parseArgs(process.argv.slice(2));

const BASE_URL = (
  args.url ||
  process.env.LOADTEST_URL ||
  `http://localhost:${process.env.PORT || 4041}`
).replace(/\/$/, '');

const PHONE =
  args.phone || process.env.LOADTEST_PHONE || process.env.SUPERADMIN_PHONE;
const PASSWORD =
  args.password ||
  process.env.LOADTEST_PASSWORD ||
  process.env.SUPERADMIN_PASSWORD;

/** Bir vaqtda ochiq turadigan ulanishlar soni - "bir vaqtdagi foydalanuvchi". */
const CONNECTIONS = Number(args.connections || 50);
/** Har bir stsenariy necha soniya davom etadi. */
const DURATION = Number(args.duration || 15);
/** Yuk berishdan oldin qancha kutib turish (JIT qizishi uchun). */
const WARMUP_SECONDS = Number(args.warmup || 3);

/* ------------------------------------------------------------------ */
/* Stsenariylar                                                        */
/* ------------------------------------------------------------------ */

/**
 * `params` - URL ichidagi ID'lar login'dan keyin aniqlanadi (birinchi
 * mavjud guruh/o'quvchi olinadi). Topilmasa stsenariy o'tkazib yuboriladi.
 */
const SCENARIOS = [
  {
    name: 'students',
    path: () => '/api/students/all?page=1&limit=20',
    note: "O'quvchilar ro'yxati - sahifalangan",
  },
  {
    name: 'students-unpaged',
    path: () => '/api/students/all',
    note: 'Sahifalashsiz - MAX_UNPAGINATED_SIZE chegarasi ishlayaptimi?',
  },
  {
    name: 'groups',
    path: () => '/api/groups/all',
    note: "Guruhlar - og'ir include zanjiri",
  },
  {
    name: 'payments-monthly',
    path: () => '/api/payments/summary/monthly',
    note: "Oylik to'lov hisoboti - barcha ACTIVE studentGroup",
  },
  {
    name: 'payments-yearly',
    path: () => '/api/payments/summary/yearly',
    note: "Yillik hisobot - bir yillik barcha to'lovlar",
  },
  {
    name: 'notifications',
    path: () => '/api/notifications/all',
    note: 'Bildirishnomalar',
  },
  {
    name: 'group-students',
    path: (ctx) =>
      ctx.groupId ? `/api/groups/students/${ctx.groupId}` : null,
    note: "Bitta guruh o'quvchilari",
  },
  {
    name: 'lessons',
    path: (ctx) => (ctx.groupId ? `/api/lessons/group/${ctx.groupId}` : null),
    note: 'Bitta guruh darslari',
  },
];

/* ------------------------------------------------------------------ */
/* Yordamchi so'rovlar                                                 */
/* ------------------------------------------------------------------ */

async function request(method, urlPath, { token, body } = {}) {
  const response = await fetch(`${BASE_URL}${urlPath}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = undefined;
  }

  return { status: response.status, json, text };
}

async function login() {
  if (!PHONE || !PASSWORD) {
    console.error(
      'LOADTEST_PHONE va LOADTEST_PASSWORD (yoki SUPERADMIN_*) sozlanmagan.',
    );
    process.exit(1);
  }

  const { status, json, text } = await request('POST', '/api/auth/login', {
    body: { phone: PHONE, password: PASSWORD },
  });

  const token = json?.access_token || json?.accessToken;

  if (status !== 200 && status !== 201) {
    console.error(`Login muvaffaqiyatsiz (${status}): ${text.slice(0, 300)}`);
    process.exit(1);
  }

  if (!token) {
    console.error('Login javobida token yo’q:', text.slice(0, 300));
    process.exit(1);
  }

  return token;
}

/** Stsenariylardagi ID'larni to'ldirish uchun bitta guruh topamiz. */
async function buildContext(token) {
  const ctx = {};

  const groups = await request('GET', '/api/groups/all?page=1&limit=1', {
    token,
  });
  ctx.groupId = groups.json?.data?.[0]?.id ?? null;

  if (!ctx.groupId) {
    console.warn(
      "Ogohlantirish: guruh topilmadi - guruhga bog'liq stsenariylar o'tkazib yuboriladi.",
    );
  }

  return ctx;
}

/* ------------------------------------------------------------------ */
/* Yuk berish                                                          */
/* ------------------------------------------------------------------ */

function runScenario(urlPath, token) {
  return new Promise((resolve, reject) => {
    const instance = autocannon(
      {
        url: `${BASE_URL}${urlPath}`,
        connections: CONNECTIONS,
        duration: DURATION,
        headers: { Authorization: `Bearer ${token}` },
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    );

    autocannon.track(instance, {
      renderProgressBar: true,
      renderResultsTable: false,
    });
  });
}

function formatResult(scenario, result) {
  /*
    Throttler `short` chegarasi 1 soniyada 30 so'rov (IP bo'yicha). Yuk testi
    bitta IP dan keladi, shuning uchun 4xx ustunidagi raqamlar asosan 429 -
    ular xato emas, chegara ishlayotganining belgisi. Haqiqiy muammo 5xx va
    `xato` ustunlarida ko'rinadi.
  */
  return {
    stsenariy: scenario.name,
    "RPS (o'rtacha)": Math.round(result.requests.average),
    'p50 ms': result.latency.p50,
    'p97.5 ms': result.latency.p97_5,
    'p99 ms': result.latency.p99,
    'max ms': result.latency.max,
    jami: result.requests.total,
    '4xx': result['4xx'] || 0,
    '5xx': result['5xx'] || 0,
    xato: result.errors + result.timeouts,
  };
}

async function main() {
  console.log(`\nManzil:      ${BASE_URL}`);
  console.log(`Ulanishlar:  ${CONNECTIONS}`);
  console.log(`Davomiylik:  ${DURATION}s (har bir stsenariy)\n`);

  const token = await login();
  console.log('Login OK\n');

  const ctx = await buildContext(token);

  const only = typeof args.only === 'string' ? args.only.split(',') : null;
  const rows = [];

  for (const scenario of SCENARIOS) {
    if (only && !only.includes(scenario.name)) continue;

    const urlPath = scenario.path(ctx);

    if (!urlPath) {
      console.log(`- ${scenario.name}: o'tkazib yuborildi (ID topilmadi)\n`);
      continue;
    }

    console.log(`▶ ${scenario.name}  ${urlPath}`);
    console.log(`  ${scenario.note}`);

    // Birinchi so'rov sekin bo'ladi (ulanish, Prisma query plan). Uni
    // o'lchovga qo'shmaslik uchun oldindan bir marta chaqiramiz.
    await request('GET', urlPath, { token });
    await new Promise((r) => setTimeout(r, WARMUP_SECONDS * 1000));

    const result = await runScenario(urlPath, token);
    rows.push(formatResult(scenario, result));
    console.log('');
  }

  if (!rows.length) {
    console.log('Hech qanday stsenariy bajarilmadi.');
    return;
  }

  console.log('\n=== NATIJA ===\n');
  console.table(rows);

  /*
    Xulosani odam o'qiy oladigan qilib aytamiz - raqamlar jadvalda,
    lekin "bu yaxshimi yoki yomonmi" degan savolga javob kerak.
  */
  const slow = rows.filter((row) => row['p97.5 ms'] > 500);
  const failing = rows.filter((row) => row['5xx'] > 0 || row.xato > 0);

  if (failing.length) {
    console.log(
      `⚠ Xato qaytargan stsenariylar: ${failing.map((r) => r.stsenariy).join(', ')}`,
    );
  }

  if (slow.length) {
    console.log(
      `⚠ p97.5 > 500ms: ${slow.map((r) => r.stsenariy).join(', ')} - shu endpoint'lar sahifalash yoki indeks talab qiladi.`,
    );
  }

  if (!slow.length && !failing.length) {
    console.log(
      `✓ ${CONNECTIONS} ta bir vaqtdagi ulanishda hamma stsenariy p97.5 < 500ms.`,
    );
  }

  console.log(
    "\nKeyingi qadam: --connections ni oshirib takrorlang (50 -> 100 -> 200) va p95 qayerda buzilishini toping.\n",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
