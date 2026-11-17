/**
 * EduLMS demo ma'lumotlari — panellarni qo'lda sinab ko'rish uchun.
 *
 *   node prisma/seed-demo.mjs
 *
 * Yaratadi: filiallar, xodimlar (barcha rollar), o'qituvchilar, fanlar,
 * kurslar (o'quv dasturi bilan), xonalar, guruhlar, o'quvchilar (kabinet
 * paroli bilan), to'lovlar, darslar va davomat, lidlar, xarajatlar,
 * topshiriqlar va test. Hamda IDOR (tashkilotlararo kirish) testi uchun
 * ikkinchi, alohida tashkilot.
 *
 * Takror ishga tushirilsa hech narsa ikkilanmaydi: asosiy yozuvlar upsert
 * qilinadi, hajmli ma'lumot (to'lov, dars, lid...) faqat birinchi marta
 * yoziladi. Hisoblarning paroli har safar qayta o'rnatiladi.
 *
 * Kirish ma'lumotlari: loyiha ildizidagi TEST_ACCOUNTS.md.
 * DIQQAT: faqat lokal / test bazasi uchun. Production'da ishga tushirmang.
 */
import 'dotenv/config';
import bcrypt from 'bcrypt';
import pg from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

if (process.env.NODE_ENV === 'production') {
  console.error('seed-demo production muhitida ishga tushirilmaydi.');
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const ORG_NAME = process.env.SEED_ORG_NAME || "EduLMS o'quv markazi";
const OTHER_ORG_NAME = 'Boshqa markaz (IDOR test)';
const SEED_TAG = 'Demo seed';

/** Barcha demo hisoblar paroli (TEST_ACCOUNTS.md bilan bir xil). */
const PASSWORDS = {
  staff: 'Demo#Admin2026',
  teacher: 'Demo#Teacher2026',
  student: 'Demo#Student2026',
  other: 'Demo#Other2026',
};

// ---------------------------------------------------------------------------
// Yordamchilar

let hashCache = new Map();
async function hash(password) {
  if (!hashCache.has(password)) {
    hashCache.set(password, await bcrypt.hash(password, 10));
  }
  return hashCache.get(password);
}

/** Deterministik "tasodif" — har safar bir xil natija. */
let seed = 20261117;
function rand() {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
}
const pick = (items) => items[Math.floor(rand() * items.length)];

const DAY = 24 * 60 * 60 * 1000;
const today = new Date();
today.setHours(0, 0, 0, 0);
const daysAgo = (n, hour = 10) => {
  const d = new Date(today.getTime() - n * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const ymd = (date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(date);

async function upsertUser({ email, phone, fullName, role, position, organizationId, branchId, password }) {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone }] },
  });
  const data = {
    fullName,
    phone,
    email,
    role,
    position,
    organizationId,
    branchId: branchId ?? null,
    status: 'ACTIVE',
    deleted_at: null,
    password: await hash(password),
  };
  return existing
    ? prisma.user.update({ where: { id: existing.id }, data })
    : prisma.user.create({ data: { ...data, hire_date: daysAgo(400) } });
}

async function upsertTeacher({ email, phone, fullName, specialization, experience, organizationId, branchId }) {
  const existing = await prisma.teacher.findFirst({
    where: { OR: [{ email }, { phone }] },
  });
  const data = {
    fullName,
    phone,
    email,
    specialization,
    experience,
    position: "O'qituvchi",
    organizationId,
    branchId,
    status: 'ACTIVE',
    deleted_at: null,
    password: await hash(PASSWORDS.teacher),
  };
  return existing
    ? prisma.teacher.update({ where: { id: existing.id }, data })
    : prisma.teacher.create({ data });
}

async function upsertStudent({ phone, firstName, lastName, organizationId, branchId, courseId, learner, password, totalPrice, birth }) {
  const fullName = `${lastName} ${firstName}`;
  const existing = await prisma.student.findUnique({ where: { phone } });
  const data = {
    fullName,
    firstName,
    lastName,
    phone,
    organizationId,
    branchId,
    courseId,
    courseType: 'OFFLINE',
    totalPrice,
    paymentMethod: 'CASH',
    lifecycle: 'active',
    result: 'oqimoqda',
    status: 'ACTIVE',
    deleted_at: null,
    hasLearnerAccount: Boolean(learner),
    birth_date: birth,
    startDate: daysAgo(90),
    gender: rand() > 0.5 ? 'male' : 'female',
    password: await hash(learner ? password : `${PASSWORDS.student}-${phone}-locked`),
  };
  return existing
    ? prisma.student.update({ where: { id: existing.id }, data })
    : prisma.student.create({ data });
}

// ---------------------------------------------------------------------------
// Asosiy tashkilot

async function seedMainOrganization() {
  const org = await prisma.organization.upsert({
    where: { name: ORG_NAME },
    update: { status: 'ACTIVE' },
    create: {
      name: ORG_NAME,
      phone: '998712000000',
      address: 'Toshkent sh., Mirzo Ulug‘bek tumani',
      directorName: 'Markaz egasi',
    },
  });

  const branchSpecs = [
    { name: 'Asosiy filial', address: 'Mirzo Ulug‘bek tumani, 12-uy', phone: '998712000001' },
    { name: 'Chilonzor filiali', address: 'Chilonzor tumani, 7-mavze', phone: '998712000002' },
    { name: 'Yunusobod filiali', address: 'Yunusobod tumani, 4-kvartal', phone: '998712000003' },
  ];
  const branches = [];
  for (const spec of branchSpecs) {
    branches.push(
      await prisma.branch.upsert({
        where: { organizationId_name: { organizationId: org.id, name: spec.name } },
        update: { address: spec.address, phone: spec.phone, status: 'ACTIVE' },
        create: { ...spec, organizationId: org.id },
      }),
    );
  }
  const [main, chilonzor, yunusobod] = branches;

  // --- Xodimlar (barcha rollar) ---
  const staff = {
    owner: await upsertUser({ email: 'admin@edulms.test', phone: '998901000001', fullName: 'Aliyev Jasur (Direktor)', role: 'ADMIN', position: 'Direktor', organizationId: org.id, password: PASSWORDS.staff }),
    manager: await upsertUser({ email: 'manager@edulms.test', phone: '998901000002', fullName: 'Karimova Nilufar', role: 'MANAGEMENT', position: 'Filial menejeri', organizationId: org.id, branchId: main.id, password: PASSWORDS.staff }),
    operator: await upsertUser({ email: 'operator@edulms.test', phone: '998901000003', fullName: 'Rahimov Sardor', role: 'ADMINSTRATOR', position: 'Administrator', organizationId: org.id, branchId: main.id, password: PASSWORDS.staff }),
    accountant: await upsertUser({ email: 'accountant@edulms.test', phone: '998901000004', fullName: 'Tursunova Dilnoza', role: 'ACCOUNTANT', position: 'Buxgalter', organizationId: org.id, password: PASSWORDS.staff }),
    chilonzorManager: await upsertUser({ email: 'chilonzor@edulms.test', phone: '998901000005', fullName: 'Yusupov Bekzod', role: 'MANAGEMENT', position: 'Filial menejeri', organizationId: org.id, branchId: chilonzor.id, password: PASSWORDS.staff }),
  };
  await prisma.branch.update({ where: { id: main.id }, data: { managerId: staff.manager.id } });
  await prisma.branch.update({ where: { id: chilonzor.id }, data: { managerId: staff.chilonzorManager.id } });

  // --- O'qituvchilar ---
  const teachers = {
    frontend: await upsertTeacher({ email: 'teacher@edulms.test', phone: '998902000001', fullName: 'Nazarov Otabek', specialization: 'Frontend (React)', experience: 5, organizationId: org.id, branchId: main.id }),
    backend: await upsertTeacher({ email: 'teacher2@edulms.test', phone: '998902000002', fullName: 'Ergasheva Madina', specialization: 'Backend (Node.js)', experience: 4, organizationId: org.id, branchId: main.id }),
    english: await upsertTeacher({ email: 'teacher3@edulms.test', phone: '998902000003', fullName: 'Smith John', specialization: 'Ingliz tili', experience: 7, organizationId: org.id, branchId: chilonzor.id }),
    math: await upsertTeacher({ email: 'teacher4@edulms.test', phone: '998902000004', fullName: 'Qodirov Anvar', specialization: 'Matematika', experience: 10, organizationId: org.id, branchId: yunusobod.id }),
  };

  // --- Fanlar ---
  const subjects = {};
  for (const [key, name, color] of [
    ['it', 'Dasturlash', '#2563eb'],
    ['english', 'Ingliz tili', '#16a34a'],
    ['math', 'Matematika', '#d97706'],
  ]) {
    subjects[key] = await prisma.subject.upsert({
      where: { organizationId_name: { organizationId: org.id, name } },
      update: { color, deleted_at: null },
      create: { organizationId: org.id, name, color },
    });
  }

  // --- Kurslar ---
  const courseSpecs = [
    { key: 'frontend', name: 'Frontend dasturlash (React)', subject: 'it', price: 900000, months: 8, lessons: 96, level: 'BEGINNER', branch: main },
    { key: 'backend', name: 'Backend dasturlash (Node.js)', subject: 'it', price: 1000000, months: 8, lessons: 96, level: 'INTERMEDIATE', branch: main },
    { key: 'ielts', name: 'IELTS 7.0+', subject: 'english', price: 750000, months: 6, lessons: 72, level: 'ADVANCED', branch: chilonzor },
    { key: 'general', name: 'General English', subject: 'english', price: 550000, months: 6, lessons: 72, level: 'BEGINNER', branch: chilonzor },
    { key: 'math', name: 'Matematika (DTM tayyorlov)', subject: 'math', price: 500000, months: 9, lessons: 108, level: 'INTERMEDIATE', branch: yunusobod },
  ];
  const courses = {};
  for (const spec of courseSpecs) {
    const data = {
      price: spec.price,
      durationMonth: spec.months,
      durationLesson: spec.lessons,
      durationDays: spec.months * 30,
      level: spec.level,
      type: 'OFFLINE',
      status: 'ACTIVE',
      subjectId: subjects[spec.subject].id,
      branchId: spec.branch.id,
      description: `${spec.name} — ${spec.months} oylik kurs`,
      deleted_at: null,
    };
    courses[spec.key] = await prisma.course.upsert({
      where: { organizationId_name: { organizationId: org.id, name: spec.name } },
      update: data,
      create: { ...data, name: spec.name, organizationId: org.id },
    });
  }

  // --- Xonalar ---
  const rooms = [];
  for (const [name, capacity] of [['101-xona', 16], ['102-xona', 14], ['201-xona (IT lab)', 20], ['Konferens zal', 30]]) {
    rooms.push(
      await prisma.room.upsert({
        where: { organizationId_name: { organizationId: org.id, name } },
        update: { capacity },
        create: { name, capacity, organizationId: org.id },
      }),
    );
  }

  // --- Guruhlar ---
  const groupSpecs = [
    { key: 'fe1', name: 'FE-101 (Toq kunlar)', course: 'frontend', teacher: 'frontend', room: 2, branch: main, days: ['MONDAY', 'WEDNESDAY', 'FRIDAY'], time: '09:00' },
    { key: 'fe2', name: 'FE-102 (Juft kunlar)', course: 'frontend', teacher: 'frontend', room: 2, branch: main, days: ['TUESDAY', 'THURSDAY', 'SATURDAY'], time: '14:00' },
    { key: 'be1', name: 'BE-201', course: 'backend', teacher: 'backend', room: 0, branch: main, days: ['MONDAY', 'WEDNESDAY', 'FRIDAY'], time: '16:00' },
    { key: 'ielts1', name: 'IELTS-Pro', course: 'ielts', teacher: 'english', room: 1, branch: chilonzor, days: ['TUESDAY', 'THURSDAY', 'SATURDAY'], time: '10:00' },
    { key: 'gen1', name: 'English Beginner A1', course: 'general', teacher: 'english', room: 1, branch: chilonzor, days: ['MONDAY', 'WEDNESDAY', 'FRIDAY'], time: '18:00' },
    { key: 'math1', name: 'DTM Matematika-1', course: 'math', teacher: 'math', room: 3, branch: yunusobod, days: ['MONDAY', 'WEDNESDAY', 'FRIDAY'], time: '15:00' },
  ];
  const groups = {};
  for (const spec of groupSpecs) {
    const data = {
      teacherId: teachers[spec.teacher].id,
      roomId: rooms[spec.room].id,
      branchId: spec.branch.id,
      organizationId: org.id,
      startDate: daysAgo(90),
      startTime: spec.time,
      weekDays: spec.days,
      status: 'ACTIVE',
      courseType: 'OFFLINE',
      deleted_at: null,
    };
    groups[spec.key] = await prisma.group.upsert({
      where: { courseId_name: { courseId: courses[spec.course].id, name: spec.name } },
      update: data,
      create: { ...data, name: spec.name, courseId: courses[spec.course].id },
    });
  }

  // --- O'quvchilar ---
  const firstNames = ['Aziz', 'Malika', 'Javohir', 'Sevara', 'Bobur', 'Kamola', 'Doniyor', 'Shahzoda', 'Islom', 'Zarina', 'Sherzod', 'Mohira', 'Ulug‘bek', 'Gulnoza', 'Temur', 'Madina', 'Asadbek', 'Nodira', 'Farrux', 'Laylo', 'Abdulloh', 'Munisa', 'Ravshan', 'Dilfuza'];
  const lastNames = ['Abdullayev', 'Ismoilova', 'Xasanov', 'Mirzayeva', 'Toshpo‘latov', 'Yo‘ldosheva', 'Sobirov', 'Qosimova', 'Normatov', 'Raximova', 'Sultonov', 'Ahmedova'];

  const groupOrder = ['fe1', 'fe1', 'fe1', 'fe1', 'fe2', 'fe2', 'fe2', 'be1', 'be1', 'be1', 'be1', 'ielts1', 'ielts1', 'ielts1', 'gen1', 'gen1', 'gen1', 'gen1', 'math1', 'math1', 'math1', 'math1', 'fe2', 'math1'];
  const students = [];
  for (let i = 0; i < groupOrder.length; i += 1) {
    const groupKey = groupOrder[i];
    const group = groups[groupKey];
    const course = Object.values(courses).find((c) => c.id === group.courseId);
    const phone = `99893${String(3000001 + i).padStart(7, '0')}`;
    // Birinchi 4 ta o'quvchiga o'quvchi kabineti ochiladi.
    const learner = i < 4;
    const student = await upsertStudent({
      phone,
      firstName: firstNames[i % firstNames.length],
      lastName: lastNames[i % lastNames.length],
      organizationId: org.id,
      branchId: group.branchId,
      courseId: course.id,
      learner,
      password: PASSWORDS.student,
      totalPrice: Number(course.price) * course.durationMonth,
      birth: new Date(Date.UTC(2000 + (i % 9), i % 12, 1 + (i % 27))),
    });
    await prisma.studentGroup.upsert({
      where: { groupId_studentId: { groupId: group.id, studentId: student.id } },
      update: { status: 'ACTIVE' },
      create: { groupId: group.id, studentId: student.id, status: 'ACTIVE' },
    });
    students.push({ student, group, course });
  }

  // --- Hajmli ma'lumot: faqat bir marta ---
  const already = await prisma.payment.count({
    where: { recordedByName: SEED_TAG, branchId: { in: branches.map((b) => b.id) } },
  });
  if (already > 0) {
    console.log("  to'lov/dars/lid/xarajat avval yaratilgan — o'tkazib yuborildi");
  } else {
    await seedVolume({ org, branches, staff, teachers, courses, groups, students });
  }

  await seedCurriculum({ org, courses, groups, students, teachers });
  await seedUpcomingLessons(groups);

  return { org, branches, staff, teachers, courses, groups, students };
}

async function seedVolume({ org, branches, staff, teachers, courses, groups, students }) {
  // To'lovlar: oxirgi 3 oy, ba'zi o'quvchilar qarzdor qoladi.
  const methods = ['CASH', 'CARD', 'TRANSFER', 'CASH', 'CARD'];
  let payments = 0;
  for (const [index, { student, group, course }] of students.entries()) {
    const monthsPaid = index % 5 === 0 ? 1 : index % 3 === 0 ? 2 : 3;
    for (let m = 0; m < monthsPaid; m += 1) {
      const paidAt = daysAgo(m * 30 + 3 + (index % 5), 11);
      const [year, month] = ymd(paidAt).split('-').map(Number);
      await prisma.payment.create({
        data: {
          studentId: student.id,
          groupId: group.id,
          courseId: course.id,
          branchId: student.branchId,
          amount: course.price,
          status: 'PAID',
          method: methods[(index + m) % methods.length],
          year,
          month,
          paidAt,
          recordedById: staff.operator.id,
          recordedByName: SEED_TAG,
        },
      });
      payments += 1;
    }
  }

  // Darslar va davomat: oxirgi 14 kun, guruh jadvaliga ko'ra.
  const weekdayName = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  let lessons = 0;
  for (const group of Object.values(groups)) {
    const members = students.filter((s) => s.group.id === group.id);
    const [hour] = (group.startTime || '10:00').split(':').map(Number);
    for (let d = 14; d >= 1; d -= 1) {
      const date = daysAgo(d, hour);
      if (!group.weekDays.includes(weekdayName[date.getDay()])) continue;
      lessons += 1;
      const lesson = await prisma.lesson.create({
        data: {
          groupId: group.id,
          teacherId: group.teacherId,
          title: `${lessons}-dars`,
          date,
          lessonType: lessons % 3 === 0 ? 'practice' : 'theory',
        },
      });
      for (const { student } of members) {
        const roll = rand();
        const status = roll < 0.78 ? 'PRESENT' : roll < 0.88 ? 'LATE' : roll < 0.94 ? 'EXCUSED' : 'ABSENT';
        await prisma.attendance.create({
          data: {
            lessonId: lesson.id,
            studentId: student.id,
            teacherId: group.teacherId,
            status,
            isPresent: status === 'PRESENT' || status === 'LATE',
          },
        });
      }
    }
  }

  // Lidlar.
  const leadSpecs = [
    ['Olimov Sanjar', 'NEW', 'instagram', 'frontend'],
    ['Komilova Feruza', 'CONTACTED', 'telegram', 'ielts'],
    ['Hamidov Akmal', 'TRIAL', 'referral', 'backend'],
    ['Salimova Robiya', 'CONTRACT', 'website', 'general'],
    ['Jo‘rayev Behruz', 'NEW', 'instagram', 'math'],
    ['Nurmatova Sabina', 'LOST', 'facebook', 'ielts'],
    ['Tojiboyev Elyor', 'CONTACTED', 'walk_in', 'frontend'],
    ['Ergasheva Lola', 'TRIAL', 'telegram', 'general'],
  ];
  for (const [i, [fullName, stage, source, courseKey]] of leadSpecs.entries()) {
    const [lastName, firstName] = fullName.split(' ');
    await prisma.lead.create({
      data: {
        fullName,
        firstName,
        lastName,
        phone: `99897${String(7000001 + i).padStart(7, '0')}`,
        source,
        stage,
        courseId: courses[courseKey].id,
        organizationId: org.id,
        branchId: courses[courseKey].branchId,
        assignedToId: staff.operator.id,
        createdById: staff.operator.id,
        nextContactAt: stage === 'LOST' ? null : daysAgo(-1 - (i % 3), 15),
        lostReason: stage === 'LOST' ? 'price' : null,
        note: 'Demo lid',
      },
    });
  }

  // Xarajatlar.
  const expenseSpecs = [
    ['Ofis ijarasi (noyabr)', 'rent', 6000000, 'PAID', branches[0]],
    ['Elektr va internet', 'utilities', 850000, 'PAID', branches[0]],
    ['Instagram reklama', 'marketing', 1500000, 'PAID', branches[1]],
    ['Doska va markerlar', 'supplies', 320000, 'PENDING', branches[2]],
    ['Ofis ijarasi (dekabr)', 'rent', 6000000, 'PENDING', branches[0]],
  ];
  for (const [i, [title, category, amount, status, branch]] of expenseSpecs.entries()) {
    await prisma.expense.create({
      data: {
        title,
        category,
        amount,
        status,
        paidAmount: status === 'PAID' ? amount : 0,
        paidAt: status === 'PAID' ? daysAgo(5 + i) : null,
        dueDate: status === 'PAID' ? daysAgo(5 + i) : daysAgo(-10 - i),
        expenseDate: daysAgo(5 + i),
        organizationId: org.id,
        branchId: branch.id,
        createdById: staff.accountant.id,
        payee: category === 'rent' ? 'Ijara beruvchi MChJ' : null,
      },
    });
  }

  console.log(`  ${payments} ta to'lov, ${lessons} ta dars (davomat bilan), ${leadSpecs.length} ta lid, ${expenseSpecs.length} ta xarajat`);
}

/** Kelgusi 7 kunlik darslar — jadval va "yaqin darslar" bo'sh qolmasin. */
async function seedUpcomingLessons(groups) {
  const weekdayName = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
  let created = 0;
  for (const group of Object.values(groups)) {
    const [hour] = (group.startTime || '10:00').split(':').map(Number);
    for (let d = 0; d <= 7; d += 1) {
      const date = daysAgo(-d, hour);
      if (!group.weekDays.includes(weekdayName[date.getDay()])) continue;
      const exists = await prisma.lesson.count({
        where: { groupId: group.id, date },
      });
      if (exists) continue;
      await prisma.lesson.create({
        data: {
          groupId: group.id,
          teacherId: group.teacherId,
          title: 'Rejalashtirilgan dars',
          date,
          lessonType: 'theory',
        },
      });
      created += 1;
    }
  }
  if (created) console.log(`  ${created} ta kelgusi dars rejalashtirildi`);
}

async function seedCurriculum({ org, courses, groups, students, teachers }) {
  const curriculum = {
    frontend: [
      ['HTML va CSS asoslari', ['HTML tuzilmasi', 'CSS selektorlar', 'Flexbox va Grid']],
      ['JavaScript', ["O'zgaruvchilar va turlar", 'Funksiyalar', 'DOM bilan ishlash']],
      ['React', ['Komponentlar', 'State va props', 'Hooklar']],
    ],
    backend: [
      ['Node.js asoslari', ['Modullar', 'Fayl tizimi', 'Express']],
      ['Ma’lumotlar bazasi', ['SQL asoslari', 'PostgreSQL', 'Prisma ORM']],
    ],
    ielts: [
      ['Listening', ['Section 1–2', 'Section 3–4']],
      ['Writing', ['Task 1', 'Task 2']],
    ],
    general: [['Beginner', ['Greetings', 'Present Simple', 'My family']]],
    math: [
      ['Algebra', ['Tenglamalar', 'Tengsizliklar', 'Funksiyalar']],
      ['Geometriya', ['Uchburchaklar', 'Aylana']],
    ],
  };

  for (const [key, modules] of Object.entries(curriculum)) {
    const course = courses[key];
    const exists = await prisma.courseModule.count({ where: { courseId: course.id } });
    if (exists) continue;

    for (const [mi, [title, lessons]] of modules.entries()) {
      const module = await prisma.courseModule.create({
        data: { courseId: course.id, title, position: mi },
      });
      for (const [li, lessonTitle] of lessons.entries()) {
        await prisma.courseLesson.create({
          data: {
            moduleId: module.id,
            title: lessonTitle,
            content: `${lessonTitle} — dars matni. Mavzuni o'qib chiqing va amaliy topshiriqni bajaring.`,
            videoUrl: li === 0 ? 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' : null,
            durationMin: 45 + li * 15,
            position: li,
          },
        });
      }
    }
  }

  // Topshiriq va test (frontend guruhi uchun).
  const fe1 = groups.fe1;
  const hasAssignment = await prisma.assignment.count({ where: { groupId: fe1.id } });
  if (!hasAssignment) {
    const assignment = await prisma.assignment.create({
      data: {
        organizationId: org.id,
        courseId: courses.frontend.id,
        groupId: fe1.id,
        title: 'Shaxsiy landing sahifa',
        description: 'HTML va CSS yordamida o‘zingiz haqingizda bitta sahifa yarating.',
        dueDate: daysAgo(-7, 23),
        maxScore: 100,
        status: 'published',
        createdByName: teachers.frontend.fullName,
      },
    });
    const first = students.find((s) => s.group.id === fe1.id);
    if (first) {
      await prisma.assignmentSubmission.create({
        data: {
          assignmentId: assignment.id,
          studentId: first.student.id,
          text: 'Sahifa havolasi: https://example.com/portfolio',
          status: 'graded',
          score: 92,
          feedback: 'Juda yaxshi, responsive qismini yaxshilang.',
          gradedAt: daysAgo(1),
          gradedByName: teachers.frontend.fullName,
        },
      });
    }

    const quiz = await prisma.quiz.create({
      data: {
        organizationId: org.id,
        courseId: courses.frontend.id,
        groupId: fe1.id,
        title: 'JavaScript asoslari — test',
        description: '5 ta savol, 15 daqiqa',
        kind: 'quiz',
        durationMin: 15,
        passPercent: 60,
        maxAttempts: 2,
        status: 'published',
        createdByName: teachers.frontend.fullName,
      },
    });
    const questions = [
      ['`typeof null` nima qaytaradi?', ['"null"', '"object"', '"undefined"', '"number"'], [1]],
      ['Qaysi kalit so‘z o‘zgarmas e’lon qiladi?', ['var', 'let', 'const', 'static'], [2]],
      ['`[1,2,3].length` qiymati?', ['2', '3', '4', 'undefined'], [1]],
      ['Qaysilari primitiv tur? (bir nechta)', ['string', 'object', 'boolean', 'array'], [0, 2]],
      ['`2 + "2"` natijasi?', ['4', '"22"', 'NaN', 'xato'], [1]],
    ];
    for (const [qi, [text, options, correct]] of questions.entries()) {
      await prisma.quizQuestion.create({
        data: {
          quizId: quiz.id,
          text,
          type: correct.length > 1 ? 'multiple' : 'single',
          options,
          correct,
          points: 1,
          position: qi,
        },
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Ikkinchi tashkilot — IDOR (tashkilotlararo kirish) testi uchun

async function seedOtherOrganization() {
  const org = await prisma.organization.upsert({
    where: { name: OTHER_ORG_NAME },
    update: {},
    create: { name: OTHER_ORG_NAME },
  });
  const branch = await prisma.branch.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Markaziy filial' } },
    update: {},
    create: { name: 'Markaziy filial', organizationId: org.id },
  });
  const owner = await upsertUser({ email: 'other-admin@edulms.test', phone: '998909000001', fullName: 'Boshqa markaz egasi', role: 'ADMIN', position: 'Direktor', organizationId: org.id, password: PASSWORDS.other });
  const course = await prisma.course.upsert({
    where: { organizationId_name: { organizationId: org.id, name: 'Maxfiy kurs' } },
    update: {},
    create: { name: 'Maxfiy kurs', organizationId: org.id, branchId: branch.id, price: 400000, durationMonth: 3, durationLesson: 36 },
  });
  const student = await upsertStudent({ phone: '998939900001', firstName: 'Maxfiy', lastName: 'O‘quvchi', organizationId: org.id, branchId: branch.id, courseId: course.id, learner: false, totalPrice: 1200000 });
  return { org, branch, owner, course, student };
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('Demo seed boshlandi...');
  const main = await seedMainOrganization();
  const other = await seedOtherOrganization();

  console.log(`Tayyor:
  Tashkilot #${main.org.id} "${main.org.name}": ${main.branches.length} filial, ${Object.keys(main.courses).length} kurs, ${Object.keys(main.groups).length} guruh, ${main.students.length} o'quvchi, ${Object.keys(main.teachers).length} o'qituvchi
  IDOR test tashkiloti #${other.org.id}: o'quvchi #${other.student.id}, kurs #${other.course.id}
  Kirish ma'lumotlari: TEST_ACCOUNTS.md`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
