import { Role } from '@prisma/client';

/**
 * `User` jadvalida turishi mumkin bo'lgan rollar.
 *
 * O'qituvchi `Teacher`, o'quvchi esa `Student` jadvalida yashaydi va ularning
 * ID hisoblagichi alohida. Shuning uchun `User` yozuviga TEACHER yoki STUDENT
 * roli berilsa, o'sha hisob rol bo'yicha o'qituvchi endpointlariga kirar, ID
 * si esa butunlay boshqa odamning o'qituvchi yozuviga tushardi.
 */
export const STAFF_ROLES: Role[] = [
  Role.SUPERADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.ADMINSTRATOR,
];

export const isStaffRole = (role?: Role | null): boolean =>
  Boolean(role && STAFF_ROLES.includes(role));
