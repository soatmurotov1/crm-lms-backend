import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type TokenPayload = {
  id: number;
  phone: string;
  role: Role;
  fullName: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const [scheme, token] = (req.headers.authorization || '').split(' ');

    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException();
    }

    let payload: TokenPayload;
    try {
      payload = await this.jwtService.verify(token);
    } catch {
      throw new UnauthorizedException();
    }

    /*
      Imzo to'g'ri bo'lishi yetarli emas. Token 2 soat amal qiladi va shu vaqt
      ichida hisob o'chirilgan, muzlatilgan yoki roli pasaytirilgan bo'lishi
      mumkin. Faqat tokenga ishonsak, ishdan bo'shatilgan xodim yana 2 soat
      to'liq huquq bilan ishlayveradi.
    */
    const account = await this.loadAccount(payload);

    if (!account) {
      throw new UnauthorizedException('Hisob topilmadi');
    }

    if (account.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('Hisob faol emas');
    }

    /*
      Rol ham, tashkilot ham doim bazadan olinadi — tokenda yozilganiga emas.
      Tashkilot tokenga yozilsa, admin boshqa tashkilotga ko'chirilgach ham
      eski tashkilot ma'lumotini 2 soat davomida ko'rishda davom etardi.
    */
    req.user = {
      ...payload,
      role: account.role,
      organizationId: account.organizationId,
    };

    return true;
  }

  /** Hisoblar uch xil jadvalda: rol qaysi jadvalga qarashni ko'rsatadi. */
  private async loadAccount(payload: TokenPayload): Promise<{
    status: UserStatus;
    role: Role;
    organizationId: number | null;
  } | null> {
    if (!payload?.id || !payload.role) return null;

    if (payload.role === Role.STUDENT) {
      const student = await this.prisma.student.findUnique({
        where: { id: payload.id },
        select: { status: true, organizationId: true },
      });
      return student
        ? {
            status: student.status,
            role: Role.STUDENT,
            organizationId: student.organizationId,
          }
        : null;
    }

    if (payload.role === Role.TEACHER) {
      const teacher = await this.prisma.teacher.findUnique({
        where: { id: payload.id },
        select: { status: true, organizationId: true },
      });
      return teacher
        ? {
            status: teacher.status,
            role: Role.TEACHER,
            organizationId: teacher.organizationId,
          }
        : null;
    }

    return this.prisma.user.findUnique({
      where: { id: payload.id },
      select: { status: true, role: true, organizationId: true },
    });
  }
}
