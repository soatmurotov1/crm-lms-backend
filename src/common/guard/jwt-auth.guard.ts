import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  SessionService,
  type SessionUserType,
} from '../session/session.service';
import type { AuthedRequest } from './current-user.decorator';

type TokenPayload = {
  id: number;
  phone: string;
  role: Role;
  fullName: string;
  /** Sessiya identifikatori — tokenni bekor qilish shu orqali ishlaydi. */
  sid?: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    protected jwtService: JwtService,
    protected prisma: PrismaService,
    protected sessionService: SessionService,
  ) {}

  /**
   * Token qayerdan olinadi. Standart holatda faqat `Authorization: Bearer`.
   * `/api/v2` qatlami buni kengaytiradi: u yerda token httpOnly cookie
   * ichida ham kelishi mumkin.
   */
  protected extractToken(req: AuthedRequest): string | undefined {
    const [scheme, token] = (req.headers.authorization || '').split(' ');

    return scheme === 'Bearer' && token ? token : undefined;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: TokenPayload;
    try {
      // `verify` `any` qaytaradi — imzo to'g'ri bo'lsa ham ichidagi
      // maydonlar tekshirilmagan, shuning uchun tipni ochiq belgilaymiz.
      payload = await this.jwtService.verifyAsync<TokenPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    /*
      Tokenning o'zini bekor qilib bo'lmaydi — imzo qo'yilgandan keyin u
      muddati tugagunicha yaroqli. Shuning uchun tokenga sessiya raqami (`sid`)
      yoziladi va u bazadagi qatorga bog'lanadi: chiqish yoki "hamma
      qurilmadan chiqarish" o'sha qatorni yopadi va token darhol o'lik bo'ladi.

      `sid` yo'q token — bu yangilanishdan oldin berilgan eski token. Uni
      bekor qilishning iloji yo'q, shuning uchun qabul qilmaymiz: foydalanuvchi
      bir marta qaytadan kiradi.
    */
    if (!payload?.sid) {
      throw new UnauthorizedException('Sessiya eskirgan, qaytadan kiring');
    }

    const session = await this.sessionService.getActiveSession(payload.sid);

    if (!session) {
      throw new UnauthorizedException('Sessiya tugatilgan, qaytadan kiring');
    }

    /*
      Token boshqa sessiyaning `sid` si bilan yasalgan bo'lsa shu yerda
      to'xtaydi: sessiyada yozilgan hisob tokendagi bilan bir xil bo'lishi shart.
    */
    if (session.userId !== payload.id) {
      throw new UnauthorizedException('Sessiya mos kelmadi');
    }

    /*
      Sessiya ochiq bo'lsa ham hisob holati alohida tekshiriladi: token
      berilgandan keyin hisob o'chirilgan, muzlatilgan yoki roli pasaytirilgan
      bo'lishi mumkin.
    */
    const account = await this.loadAccount(payload.id, session.userType);

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

  /**
   * Hisoblar uch xil jadvalda va har birining ID hisoblagichi alohida:
   * 7-raqamli o'qituvchi ham, 7-raqamli o'quvchi ham bo'lishi mumkin.
   *
   * Shuning uchun jadvalni SESSIYA aytadi (`userType`), tokendagi rol emas.
   * Ilgari rol bo'yicha tanlanardi: `User` jadvalidagi hisobga TEACHER roli
   * berilgan bo'lsa (DTO buni taqiqlamasdi), guard uning ID si bilan
   * `Teacher` jadvaliga borardi va butunlay boshqa odamning holatini,
   * tashkilotini sessiyaga bog'lab qo'yardi.
   */
  private async loadAccount(
    id: number,
    userType: SessionUserType,
  ): Promise<{
    status: UserStatus;
    role: Role;
    organizationId: number | null;
  } | null> {
    if (!id) return null;

    if (userType === 'student') {
      const student = await this.prisma.student.findUnique({
        where: { id },
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

    if (userType === 'teacher') {
      const teacher = await this.prisma.teacher.findUnique({
        where: { id },
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

    const user = await this.prisma.user.findUnique({
      where: { id },
      select: { status: true, role: true, organizationId: true },
    });

    if (!user) return null;

    /*
      `User` jadvalidagi hisobda TEACHER yoki STUDENT roli turishi — ma'lumot
      xatosi. Bunday hisob rol bo'yicha o'qituvchi endpointlariga kirar, ID si
      esa Teacher jadvaliga tegishli emas edi: xizmatlar uni begona
      o'qituvchining ID si sifatida ishlatardi. Ochiq qoldirgandan ko'ra
      to'xtatib, adminga tuzattirgan xavfsizroq.
    */
    if (user.role === Role.TEACHER || user.role === Role.STUDENT) {
      return null;
    }

    return user;
  }
}
