import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Status } from '@prisma/client';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import {
  buildPaginatedResult,
  resolvePagination,
} from 'src/common/utils/pagination.util';
import type { RequestUser } from 'src/common/guard/current-user.decorator';
import {
  orgFilter,
  resolveOwnerOrganizationId,
} from 'src/common/utils/org-scope.util';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async getAllRoom(user: RequestUser, query?: PaginationQueryDto) {
    const { take, skip } = resolvePagination(query);
    // Har bir tashkilot faqat o'z xonalarini ko'radi.
    const where = { status: Status.ACTIVE, ...orgFilter(user) };

    const [rooms, total] = await this.prisma.$transaction([
      this.prisma.room.findMany({
        where,
        orderBy: { id: 'desc' },
        take,
        skip,
      }),
      this.prisma.room.count({ where }),
    ]);

    return buildPaginatedResult(rooms, total, query, 'rooms/all');
  }

  async createRoom(user: RequestUser, payload: CreateRoomDto) {
    const organizationId = resolveOwnerOrganizationId(user);

    // Xona nomi faqat shu tashkilot ichida takrorlanmasligi kerak — boshqa
    // tashkilotda ham "101" xonasi bo'lishi mumkin.
    const existRoom = await this.prisma.room.findFirst({
      where: { name: payload.name, organizationId },
    });
    if (existRoom) {
      throw new ConflictException('Room name alread exist');
    }

    await this.prisma.room.create({
      data: { ...payload, organizationId },
    });

    return {
      success: true,
      message: 'Room created',
    };
  }

  async getRoomById(user: RequestUser, id: number) {
    const room = await this.prisma.room.findFirst({
      where: { id, status: Status.ACTIVE, ...orgFilter(user) },
    });

    if (!room) {
      throw new NotFoundException('Room is Not found');
    }

    return {
      success: true,
      data: room,
    };
  }

  async updateRoom(user: RequestUser, id: number, payload: UpdateRoomDto) {
    await this.ensureOwned(user, id);

    const updatedRoom = await this.prisma.room.update({
      where: { id },
      data: payload,
    });

    return {
      success: true,
      data: updatedRoom,
    };
  }

  async deleteRoom(user: RequestUser, id: number) {
    await this.ensureOwned(user, id);

    await this.prisma.room.update({
      where: { id },
      data: { status: Status.INACTIVE },
    });

    return {
      success: true,
      message: 'Room deleted',
    };
  }

  /** Xona shu tashkilotnikimi — bo'lmasa "topilmadi". */
  private async ensureOwned(user: RequestUser, id: number) {
    const room = await this.prisma.room.findFirst({
      where: { id, ...orgFilter(user) },
      select: { id: true },
    });

    if (!room) {
      throw new NotFoundException('Room is Not found');
    }

    return room;
  }
}
