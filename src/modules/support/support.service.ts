import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role, SupportStatus } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { ReplyTicketDto } from './dto/reply-ticket.dto';
import { UpdateTicketDto } from './dto/update-ticket.dto';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import { isSuperAdmin, orgFilter } from 'src/common/utils/org-scope.util';
import { STAFF_ROLES } from 'src/common/utils/staff-roles.util';

/**
 * `AuthGuard` biriktirgan to'liq foydalanuvchi. Ilgari bu yerda faqat
 * `{ id, role }` turardi, shuning uchun murojaatlarni tashkilot bo'yicha
 * ajratib bo'lmasdi.
 */
type CurrentUser = RequestUser;

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  private isStaff(role: Role) {
    return STAFF_ROLES.includes(role);
  }

  async getAll(currentUser: CurrentUser, status?: string) {
    /*
      Uch daraja:
        - SUPERADMIN (platforma egasi) — hamma murojaatni ko'radi;
        - tashkilot xodimi — faqat o'z tashkilotinikini. Ilgari "xodim" degan
          bitta shart bor edi, ya'ni har qanday markaz admini boshqa
          markazlarning murojaatlarini, matni bilan birga o'qiy olardi;
        - qolganlar — faqat o'zi yozganini.
    */
    const ownFilter = isSuperAdmin(currentUser)
      ? {}
      : this.isStaff(currentUser.role)
        ? orgFilter(currentUser)
        : { createdByRole: currentUser.role, createdById: currentUser.id };

    const tickets = await this.prisma.supportTicket.findMany({
      where: {
        ...ownFilter,
        ...(status && status !== 'ALL'
          ? { status: status as SupportStatus }
          : {}),
      },
      include: {
        organization: { select: { id: true, name: true } },
        _count: { select: { messages: true } },
      },
      orderBy: [{ status: 'asc' }, { created_at: 'desc' }],
    });

    return { success: true, data: tickets };
  }

  async getOne(id: number, currentUser: CurrentUser) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      include: {
        organization: { select: { id: true, name: true } },
        messages: { orderBy: { created_at: 'asc' } },
      },
    });

    if (!ticket) {
      throw new NotFoundException('Murojaat topilmadi');
    }

    this.ensureCanAccess(ticket, currentUser);

    return { success: true, data: ticket };
  }

  async getSummary(currentUser: CurrentUser) {
    // Hisob ham tashkilot bo'yicha ajratiladi — aks holda markaz admini
    // butun platformadagi murojaatlar sonini ko'rardi.
    const rows = await this.prisma.supportTicket.groupBy({
      by: ['status'],
      where: isSuperAdmin(currentUser) ? {} : orgFilter(currentUser),
      _count: { _all: true },
    });

    const counts = { OPEN: 0, IN_PROGRESS: 0, ANSWERED: 0, CLOSED: 0 };
    rows.forEach((row) => {
      counts[row.status] = row._count._all;
    });

    return {
      success: true,
      data: {
        ...counts,
        total: rows.reduce((sum, row) => sum + row._count._all, 0),
      },
    };
  }

  async create(payload: CreateTicketDto, currentUser: CurrentUser) {
    const senderName = await this.getSenderName(currentUser);

    /*
      Tashkilot so'rovdan emas, sessiyadan olinadi. Ilgari `organizationId`
      to'g'ridan-to'g'ri mijozdan kelardi: murojaatni boshqa markaz nomidan
      yozib qo'yish ham, o'zinikini begona markazga "yashirish" ham mumkin
      edi. SUPERADMIN tashkilotga biriktirilmagani uchun u ko'rsatishi mumkin.
    */
    const organizationId = isSuperAdmin(currentUser)
      ? (payload.organizationId ?? null)
      : (currentUser.organizationId ?? null);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        subject: payload.subject,
        message: payload.message,
        priority: payload.priority,
        organizationId,
        contactPhone: payload.contactPhone,
        createdByRole: currentUser.role,
        createdById: currentUser.id,
        createdByName: senderName,
        messages: {
          create: {
            senderRole: currentUser.role,
            senderId: currentUser.id,
            senderName: senderName,
            message: payload.message,
          },
        },
      },
      include: { messages: true },
    });

    return { success: true, message: 'Murojaat yuborildi', data: ticket };
  }

  async reply(id: number, payload: ReplyTicketDto, currentUser: CurrentUser) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: {
        id: true,
        createdByRole: true,
        createdById: true,
        organizationId: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Murojaat topilmadi');
    }

    this.ensureCanAccess(ticket, currentUser);

    const senderName = await this.getSenderName(currentUser);

    const message = await this.prisma.supportMessage.create({
      data: {
        ticketId: id,
        senderRole: currentUser.role,
        senderId: currentUser.id,
        senderName,
        message: payload.message,
      },
    });

    // Xodim javob bersa — "javob berildi", murojaat egasi yozsa — "ochiq".
    await this.prisma.supportTicket.update({
      where: { id },
      data: {
        status: this.isStaff(currentUser.role)
          ? SupportStatus.ANSWERED
          : SupportStatus.OPEN,
      },
    });

    return { success: true, message: 'Javob yuborildi', data: message };
  }

  async update(id: number, payload: UpdateTicketDto, currentUser: CurrentUser) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: {
        id: true,
        createdByRole: true,
        createdById: true,
        organizationId: true,
      },
    });

    if (!ticket) {
      throw new NotFoundException('Murojaat topilmadi');
    }

    // Ilgari tekshiruv yo'q edi: boshqa markazning murojaatini yopib
    // qo'yish mumkin edi.
    this.ensureCanAccess(ticket, currentUser);

    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        ...(payload.status
          ? {
              status: payload.status,
              closedAt:
                payload.status === SupportStatus.CLOSED ? new Date() : null,
            }
          : {}),
        ...(payload.priority ? { priority: payload.priority } : {}),
      },
    });

    return { success: true, message: 'Murojaat yangilandi', data: updated };
  }

  async remove(id: number) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException('Murojaat topilmadi');
    }

    await this.prisma.supportTicket.delete({ where: { id } });

    return { success: true, message: "Murojaat o'chirildi" };
  }

  private ensureCanAccess(
    ticket: {
      createdByRole: Role;
      createdById: number;
      organizationId: number | null;
    },
    currentUser: CurrentUser,
  ) {
    // Platforma egasi hamma murojaatni ko'radi — ular unga yozilgan.
    if (isSuperAdmin(currentUser)) return;

    /*
      Tashkilot xodimi faqat o'z tashkilotining murojaatini ko'radi. Ilgari
      "xodim bo'lsa — o'tsin" degan bitta shart bor edi va begona `id`
      yuborilsa boshqa markazning yozishmasi to'liq ochilardi.
    */
    if (this.isStaff(currentUser.role)) {
      if (ticket.organizationId !== (currentUser.organizationId ?? null)) {
        throw new ForbiddenException('Bu sizning murojaatingiz emas');
      }
      return;
    }

    /*
      Rol ham solishtiriladi, faqat ID emas: hisoblar uch xil jadvalda va
      ID hisoblagichi alohida, ya'ni 7-raqamli o'quvchi 7-raqamli
      o'qituvchining murojaatiga tushib qolmasligi kerak.
    */
    if (
      ticket.createdByRole !== currentUser.role ||
      ticket.createdById !== currentUser.id
    ) {
      throw new ForbiddenException('Bu sizning murojaatingiz emas');
    }
  }

  private async getSenderName(currentUser: CurrentUser) {
    if (currentUser.role === Role.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { id: currentUser.id },
        select: { fullName: true },
      });
      return teacher?.fullName || null;
    }

    if (currentUser.role === Role.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { id: currentUser.id },
        select: { fullName: true },
      });
      return student?.fullName || null;
    }

    const user = await this.prisma.user.findUnique({
      where: { id: currentUser.id },
      select: { fullName: true },
    });
    return user?.fullName || null;
  }
}
