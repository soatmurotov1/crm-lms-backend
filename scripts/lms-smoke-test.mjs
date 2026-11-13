/**
 * LMS API smoke-test: ishlab turgan backendga qarshi asosiy oqimlarni
 * boshidan oxirigacha tekshiradi (login → fan → kurs → guruh → o'quvchi →
 * o'quv dasturi → topshiriq → test → baholar → progress → bildirishnoma → RBAC).
 *
 * Ishga tushirish (backend ishlab turgan bo'lsin):
 *   node scripts/lms-smoke-test.mjs
 *
 * Env: API_URL (standart http://localhost:4040/api/v2), SEED_OWNER_EMAIL,
 * SEED_OWNER_PASSWORD.
 * Har ishga tushirishda yangi test yozuvlari yaratiladi (nomlarida vaqt belgisi).
 */
import 'dotenv/config';
import { randomBytes } from 'node:crypto';

const API = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 4040}/api/v2`;
const OWNER_EMAIL = process.env.SEED_OWNER_EMAIL ?? 'owner@educrm.local';
const OWNER_PASSWORD = process.env.SEED_OWNER_PASSWORD;
const tag = Date.now().toString(36);

let passed = 0;
const failures = [];

async function call(token, method, path, body, { form } = {}) {
  const headers = { Authorization: `Bearer ${token}` };
  let payload;
  if (form) payload = form;
  else if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  }
}

async function expect(token, method, path, body, status, name, opts) {
  const res = await call(token, method, path, body, opts);
  check(`${name} [${method} ${path} → ${status}]`, res.status === status, res);
  return res.json;
}

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Login xatosi (${email}): ${res.status} ${JSON.stringify(json)}`);
  }
  return json.token ?? json.access_token ?? json.data?.token;
}

async function main() {
  if (!OWNER_PASSWORD) throw new Error('SEED_OWNER_PASSWORD sozlanmagan');
  console.log(`API: ${API}`);

  console.log('\n1. Autentifikatsiya');
  const owner = await login(OWNER_EMAIL, OWNER_PASSWORD);
  check('owner login → token', !!owner);
  await expect(owner, 'GET', '/auth/me', undefined, 200, 'joriy foydalanuvchi');
  await expect('noto-g-ri-token', 'GET', '/subjects', undefined, 401, 'tokensiz so‘rov rad etiladi');

  const branches = await expect(owner, 'GET', '/branches', undefined, 200, 'filiallar');
  const branchId = branches?.data?.[0]?.id;

  console.log('\n2. Fanlar va kategoriyalar');
  const category = await expect(owner, 'POST', '/subjects', { name: `Aniq fanlar ${tag}`, color: '#2563eb' }, 201, 'kategoriya yaratish');
  const subject = await expect(owner, 'POST', '/subjects', { name: `Matematika ${tag}`, parent_id: category.data.id }, 201, 'fan yaratish');
  await expect(owner, 'POST', '/subjects', { name: `matematika ${tag}` }, 409, 'takroriy nom rad etiladi');
  await expect(owner, 'POST', '/subjects', { name: '' }, 400, 'bo‘sh nom — validatsiya xatosi');
  const subjectList = await expect(owner, 'GET', `/subjects?search=${encodeURIComponent(tag)}`, undefined, 200, 'fanlar qidiruvi');
  check('qidiruv 2 ta natija', subjectList?.data?.length === 2, subjectList?.meta);
  await expect(owner, 'PATCH', `/subjects/${subject.data.id}`, { description: 'Algebra va geometriya' }, 200, 'fanni tahrirlash');

  console.log('\n3. Kurs, o‘qituvchi, guruh, o‘quvchilar');
  const course = await expect(owner, 'POST', '/courses', { name: `Algebra asoslari ${tag}`, course_type: 'offline', duration_days: 90, price: 500000, branch_id: branchId }, 201, 'kurs yaratish');
  const courseId = course?.data?.id;
  const teacherEmail = `teacher-${tag}@educrm.local`;
  const teacherPassword = `T${randomBytes(9).toString('base64url')}9a`;
  const teacher = await expect(owner, 'POST', '/users', { fullName: `O‘qituvchi ${tag}`, role: 'teacher', email: teacherEmail, password: teacherPassword, phone: `+99890${String(Date.now()).slice(-7)}`, specialization: 'Matematika', branchId }, 201, 'o‘qituvchi yaratish');
  const teacherId = teacher?.data?.id ?? teacher?.id;
  const group = await expect(owner, 'POST', '/groups', { name: `ALG-${tag}`, branchId, courseType: 'offline', teacherId, courseId }, 201, 'guruh yaratish (kursga bog‘langan)');
  check('guruh kursga bog‘langan', group?.data?.course_id === courseId, group?.data);
  const groupId = group?.data?.id;

  const students = [];
  for (const n of [1, 2]) {
    const st = await expect(owner, 'POST', '/students', {
      first_name: `Talaba${n}`, last_name: tag, phone: `+99891${String(Date.now() + n).slice(-7)}`,
      course_type: 'offline', total_price: 500000, branch_id: branchId, idempotency_key: `${tag}-${n}`,
    }, 201, `o‘quvchi ${n} yaratish`);
    students.push(st?.data?.id ?? st?.id);
  }

  console.log('\n4. Kursga yozish (enrollment)');
  await expect(owner, 'POST', `/courses/${courseId}/enrollments`, { student_id: students[0], group_id: groupId }, 201, '1-o‘quvchini guruh bilan yozish');
  const enrolled = await expect(owner, 'POST', `/courses/${courseId}/enrollments`, { student_id: students[1], group_id: groupId }, 201, '2-o‘quvchini yozish');
  check('kursda 2 o‘quvchi', enrolled?.data?.length === 2, enrolled);

  console.log('\n5. O‘quv dasturi: modul → dars → material');
  const module = await expect(owner, 'POST', `/courses/${courseId}/modules`, { title: '1-modul: Tenglamalar' }, 201, 'modul yaratish');
  const lesson = await expect(owner, 'POST', `/modules/${module.data.id}/lessons`, { title: 'Chiziqli tenglamalar', video_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', duration_min: 45, content: '# Mavzu' }, 201, 'dars yaratish');
  await expect(owner, 'POST', `/modules/${module.data.id}/lessons`, { title: 'X', video_url: 'not-a-url' }, 400, 'noto‘g‘ri video havola rad etiladi');
  await expect(owner, 'POST', `/course-lessons/${lesson.data.id}/materials`, { kind: 'link', title: 'Qo‘llanma', url: 'https://example.com/guide' }, 201, 'havola material');
  const form = new FormData();
  form.append('kind', 'file');
  form.append('title', 'Mashqlar');
  form.append('file', new Blob(['1) 2x+3=7'], { type: 'text/plain' }), 'mashqlar.txt');
  const fileMat = await expect(owner, 'POST', `/course-lessons/${lesson.data.id}/materials`, undefined, 201, 'fayl material (multipart)', { form });
  const dl = await call(owner, 'GET', `/materials/${fileMat?.data?.id}/download`);
  check('materialni yuklab olish', dl.status === 200 && String(dl.json).includes('2x+3=7'), dl.status);
  await expect(owner, 'POST', `/course-lessons/${lesson.data.id}/progress`, { student_id: students[0], completed: true }, 201, 'darsni tugatgan deb belgilash');
  const cur = await expect(owner, 'GET', `/courses/${courseId}/curriculum`, undefined, 200, 'o‘quv dasturini olish');
  check('dasturda 1 modul, 1 dars, 2 material, 50% bajarilgan',
    cur?.data?.modules_count === 1 && cur?.data?.modules?.[0]?.lessons?.[0]?.materials?.length === 2 && cur?.data?.modules?.[0]?.lessons?.[0]?.completion_rate === 50,
    cur?.data);

  console.log('\n6. Topshiriqlar');
  const asg = await expect(owner, 'POST', '/assignments', { title: `Uy vazifasi ${tag}`, group_id: groupId, max_score: 10, due_date: new Date(Date.now() + 86400000).toISOString() }, 201, 'topshiriq yaratish');
  await expect(owner, 'POST', '/assignments', { title: 'Kurssiz' }, 400, 'kurs/guruhsiz topshiriq rad etiladi');
  const subs = await expect(owner, 'POST', `/assignments/${asg.data.id}/submissions`, { student_id: students[0], text: 'x = 2' }, 201, 'javobni qayd etish');
  const sub = subs?.data?.find((row) => row.student_id === students[0]);
  check('javoblar ro‘yxatida topshirmagan ham bor', subs?.data?.some((row) => row.status === 'missing'), subs?.data);
  await expect(owner, 'PATCH', `/submissions/${sub?.id}/grade`, { score: 11 }, 400, 'max balldan oshgan baho rad etiladi');
  await expect(owner, 'PATCH', `/submissions/${sub?.id}/grade`, { score: 9, feedback: 'Yaxshi' }, 200, 'baholash');
  const asgList = await expect(owner, 'GET', `/assignments?group_id=${groupId}`, undefined, 200, 'topshiriqlar ro‘yxati (filter)');
  check('graded_count = 1', asgList?.data?.[0]?.graded_count === 1, asgList?.data?.[0]);

  console.log('\n7. Testlar / imtihonlar');
  const quiz = await expect(owner, 'POST', '/exams', { title: `Nazorat testi ${tag}`, group_id: groupId, kind: 'exam', pass_percent: 50 }, 201, 'test yaratish');
  await expect(owner, 'PATCH', `/exams/${quiz.data.id}`, { status: 'published' }, 400, 'savolsiz e’lon qilish rad etiladi');
  const q1 = await expect(owner, 'POST', `/exams/${quiz.data.id}/questions`, { text: '2+2=?', type: 'single', options: ['3', '4', '5'], correct: [1], points: 2 }, 201, 'bitta javobli savol');
  const q2 = await expect(owner, 'POST', `/exams/${quiz.data.id}/questions`, { text: 'Juft sonlar', type: 'multiple', options: ['1', '2', '4'], correct: [1, 2], points: 2 }, 201, 'ko‘p javobli savol');
  const q3 = await expect(owner, 'POST', `/exams/${quiz.data.id}/questions`, { text: 'Poytaxt?', type: 'text', correct: ['Toshkent'], points: 1 }, 201, 'matnli savol');
  await expect(owner, 'POST', `/exams/${quiz.data.id}/questions`, { text: 'Xato', type: 'single', options: ['a', 'b'], correct: [5] }, 400, 'noto‘g‘ri javob indeksi rad etiladi');
  await expect(owner, 'PATCH', `/exams/${quiz.data.id}`, { status: 'published' }, 200, 'testni e’lon qilish');
  const attempt = await expect(owner, 'POST', `/exams/${quiz.data.id}/attempts`, {
    student_id: students[0],
    answers: { [q1.data.id]: 1, [q2.data.id]: [2, 1], [q3.data.id]: ' toshkent ' },
  }, 201, 'javoblarni topshirish');
  check('avtomatik ball 5/5, o‘tdi', attempt?.data?.score === 5 && attempt?.data?.passed === true, attempt?.data);
  await expect(owner, 'POST', `/exams/${quiz.data.id}/attempts`, { student_id: students[0], answers: {} }, 400, 'urinishlar soni cheklovi');
  const att2 = await expect(owner, 'POST', `/exams/${quiz.data.id}/attempts`, { student_id: students[1], answers: { [q1.data.id]: 0 } }, 201, '2-o‘quvchi (xato javob)');
  check('2-o‘quvchi o‘tmadi', att2?.data?.passed === false && att2?.data?.score === 0, att2?.data);
  const results = await expect(owner, 'GET', `/exams/${quiz.data.id}/results`, undefined, 200, 'natijalar');
  check('natijalar xulosasi: 2 urinish, 1 o‘tdi', results?.data?.summary?.attempted === 2 && results?.data?.summary?.passed === 1, results?.data?.summary);
  await expect(owner, 'PATCH', `/exam-attempts/${att2?.data?.id}/review`, { score: 3, feedback: 'Qayta ko‘rildi' }, 200, 'natijani qo‘lda tuzatish');

  console.log('\n8. Baholar, progress, dashboard');
  const grades = await expect(owner, 'GET', `/grades?group_id=${groupId}`, undefined, 200, 'baholar jurnali');
  check('jurnalda 3 ta baho (1 topshiriq + 2 test)', grades?.data?.length === 3, grades?.data);
  const prog = await expect(owner, 'GET', `/progress/students/${students[0]}`, undefined, 200, 'o‘quvchi progressi');
  check('progress: kurs 100%, test 100%, topshiriq 90%',
    prog?.data?.courses?.[0]?.progress === 100 && prog?.data?.quizzes?.average_percent === 100 && prog?.data?.assignments?.average_percent === 90,
    prog?.data);
  await expect(owner, 'GET', `/progress/courses/${courseId}`, undefined, 200, 'kurs progressi');
  const summary = await expect(owner, 'GET', '/lms/summary', undefined, 200, 'LMS dashboard');
  check('dashboardda kurslar va testlar bor', summary?.data?.courses >= 1 && summary?.data?.published_quizzes >= 1, summary?.data);

  console.log('\n9. Bildirishnomalar');
  await expect(owner, 'POST', '/notifications', { title: 'Imtihon', message: 'Ertaga nazorat', audience: 'group', group_id: groupId, type: 'lesson' }, 201, 'guruhga yuborish');
  await expect(owner, 'POST', '/notifications', { title: 'Yig‘ilish', message: 'Soat 15:00', audience: 'teachers' }, 201, 'o‘qituvchilarga yuborish');
  await expect(owner, 'POST', '/notifications', { title: 'X', message: 'Y', audience: 'galaxy' }, 400, 'noto‘g‘ri auditoriya');

  console.log('\n10. Rollar va ruxsatlar (o‘qituvchi)');
  const teacherToken = await login(teacherEmail, teacherPassword);
  check('o‘qituvchi login', !!teacherToken);
  await expect(teacherToken, 'POST', '/subjects', { name: `Taqiqlangan ${tag}` }, 403, 'o‘qituvchi fan yarata olmaydi');
  await expect(teacherToken, 'DELETE', `/subjects/${subject.data.id}`, undefined, 403, 'o‘qituvchi fan o‘chira olmaydi');
  const tAsg = await expect(teacherToken, 'GET', '/assignments', undefined, 200, 'o‘qituvchi o‘z topshiriqlarini ko‘radi');
  check('o‘qituvchi ro‘yxatida guruhi topshirig‘i', tAsg?.data?.some((row) => row.id === asg.data.id), tAsg?.data);
  await expect(teacherToken, 'POST', '/assignments', { title: `O‘qituvchi topshirig‘i ${tag}`, group_id: groupId }, 201, 'o‘qituvchi o‘z guruhiga topshiriq yaratadi');
  const tNotes = await expect(teacherToken, 'GET', '/notifications', undefined, 200, 'o‘qituvchi bildirishnomalari');
  check('o‘qituvchi 2 ta bildirishnoma ko‘radi (guruh + o‘qituvchilar)', tNotes?.data?.length >= 2 && tNotes?.unread_count >= 2, tNotes);
  await expect(teacherToken, 'POST', '/notifications/read-all', undefined, 200, 'hammasini o‘qilgan deb belgilash');
  const unread = await expect(teacherToken, 'GET', '/notifications/unread-count', undefined, 200, 'o‘qilmaganlar soni');
  check('o‘qilmaganlar 0', unread?.data?.unread_count === 0, unread);
  await expect(teacherToken, 'POST', `/courses/${courseId}/enrollments`, { student_id: students[0] }, 403, 'o‘qituvchi kursga yoza olmaydi');

  console.log('\n11. Tozalash (soft delete)');
  await expect(owner, 'DELETE', `/subjects/${category.data.id}`, undefined, 204, 'kategoriyani o‘chirish');
  await expect(owner, 'DELETE', `/assignments/${asg.data.id}`, undefined, 204, 'topshiriqni o‘chirish');
  await expect(owner, 'GET', `/assignments/${asg.data.id}`, undefined, 404, 'o‘chirilgan topshiriq topilmaydi');
  await expect(owner, 'DELETE', `/courses/${courseId}/enrollments/${students[1]}`, undefined, 204, 'o‘quvchini kursdan chiqarish');
  await expect(owner, 'DELETE', `/modules/${module.data.id}`, undefined, 204, 'modulni o‘chirish');

  console.log(`\nNatija: ${passed} ta o‘tdi, ${failures.length} ta xato`);
  if (failures.length) {
    console.log(failures.map((f) => ` - ${f}`).join('\n'));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
