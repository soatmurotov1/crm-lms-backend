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

type CurrentUser = { id: number; role: Role };

const STAFF_ROLES: Role[] = [
  Role.SUPERADMIN,
  Role.ADMIN,
  Role.MANAGEMENT,
  Role.ADMINSTRATOR,
];

@Injectable()
export class SupportService {
  constructor(private prisma: PrismaService) {}

  private isStaff(role: Role) {
    return STAFF_ROLES.includes(role);
  }

  async getAll(currentUser: CurrentUser, status?: string) {
    // Xodim bo'lmasa faqat o'z murojaatlarini ko'radi.
    const ownFilter = this.isStaff(currentUser.role)
      ? {}
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

  async getSummary() {
    const rows = await this.prisma.supportTicket.groupBy({
      by: ['status'],
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

    const ticket = await this.prisma.supportTicket.create({
      data: {
        subject: payload.subject,
        message: payload.message,
        priority: payload.priority,
        organizationId: payload.organizationId,
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
      select: { id: true, createdByRole: true, createdById: true },
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

  async update(id: number, payload: UpdateTicketDto) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!ticket) {
      throw new NotFoundException('Murojaat topilmadi');
    }

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
    ticket: { createdByRole: Role; createdById: number },
    currentUser: CurrentUser,
  ) {
    if (this.isStaff(currentUser.role)) return;

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
