import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { CreateRoomDto } from './dto/create-room.dto';
import { UpdateRoomDto } from './dto/update-room.dto';
import { PaginationQueryDto } from 'src/common/dto/pagination.dto';
import {
  buildPaginatedResult,
  resolvePagination,
} from 'src/common/utils/pagination.util';

@Injectable()
export class RoomsService {
  constructor(private prisma: PrismaService) {}

  async getAllRoom(query?: PaginationQueryDto) {
    const { take, skip } = resolvePagination(query);
    const where = { status: 'ACTIVE' } as const;

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

  async createRoom(payload: CreateRoomDto) {
    const existRoom = await this.prisma.room.findUnique({
      where: { name: payload.name },
    });
    if (existRoom) {
      throw new ConflictException('Room name alread exist');
    }

    await this.prisma.room.create({
      data: payload,
    });

    return {
      success: true,
      message: 'Room created',
    };
  }

  async getRoomById(id: number) {
    const room = await this.prisma.room.findFirst({
      where: { id, status: 'ACTIVE' },
    });

    if (!room) {
      throw new NotFoundException('Room is Not found');
    }

    return {
      success: true,
      data: room,
    };
  }

  async updateRoom(id: number, payload: UpdateRoomDto) {
    const room = await this.prisma.room.findUnique({ where: { id } });

    if (!room) {
      throw new NotFoundException('Room is Not found');
    }

    const updatedRoom = await this.prisma.room.update({
      where: { id },
      data: payload,
    });

    return {
      success: true,
      data: updatedRoom,
    };
  }

  async deleteRoom(id: number) {
    const room = await this.prisma.room.findUnique({ where: { id } });

    if (!room) {
      throw new NotFoundException('Room is Not found');
    }

    await this.prisma.room.update({
      where: { id },
      data: { status: 'INACTIVE' },
    });

    return {
      success: true,
      message: 'Room deleted',
    };
  }
}
