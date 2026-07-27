import { BadRequestException, Injectable } from '@nestjs/common';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { comparePassword } from 'src/common/bcrypt/bcrypt';
import { PrismaService } from 'src/common/prisma/prisma.service';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private async generateToken(payload: {
    id: number;
    email: string;
    role: Role;
    fullName: string;
  }) {
    return await this.jwtService.sign(payload);
  }

  private async logAndNotifyLogin(
    email: string,
    ipAddress: string,
    deviceName: string,
    location: string,
    userAgent: string,
    loginType: string = 'user',
  ): Promise<void> {
    try {
      await this.prisma.loginLog.create({
        data: {
          userEmail: email,
          ipAddress,
          deviceName,
          location,
          userAgent,
          loginType,
          success: true,
        },
      });
    } catch (error) {
      console.error('Login logging xatosi:', error);
    }
  }

  async login(payload: LoginDto, ipAddress: string = '') {
    const email = String(payload?.email || '').trim();
    if (!email) {
      throw new BadRequestException('Email yoki parol xato');
    }

    const existEmail = await this.prisma.user.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });

    if (!existEmail) {
      throw new BadRequestException('Email yoki parol xato');
    }

    if (!(await comparePassword(payload.password, existEmail.password))) {
      throw new BadRequestException('Email yoki parol xato');
    }

    // Log login activity
    await this.logAndNotifyLogin(
      existEmail.email,
      ipAddress,
      payload.deviceName || 'N/A',
      payload.location || 'N/A',
      payload.userAgent || 'N/A',
      'user',
    );

    const accessToken = await this.generateToken({
      id: existEmail.id,
      email: existEmail.email,
      role: existEmail.role,
      fullName: existEmail.fullName,
    });
    return {
      success: true,
      accessToken: accessToken,
      access_token: accessToken,
      user: {
        id: existEmail.id,
        email: existEmail.email,
        fullName: existEmail.fullName,
        role: existEmail.role,
        position: existEmail.position,
      },
    };
  }

  async loginTeacher(payload: LoginDto, ipAddress: string = '') {
    const email = String(payload?.email || '').trim();
    if (!email) {
      throw new BadRequestException('Login or password wrong');
    }

    const existEmail = await this.prisma.teacher.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });

    if (!existEmail) {
      throw new BadRequestException('Login or password wrong');
    }

    if (!(await comparePassword(payload.password, existEmail.password))) {
      throw new BadRequestException('Login or password wrong');
    }

    // Log login activity
    await this.logAndNotifyLogin(
      existEmail.email,
      ipAddress,
      payload.deviceName || 'N/A',
      payload.location || 'N/A',
      payload.userAgent || 'N/A',
      'teacher',
    );

    const accessToken = await this.generateToken({
      id: existEmail.id,
      email: existEmail.email,
      role: Role.TEACHER,
      fullName: existEmail.fullName,
    });

    return {
      success: true,
      accessToken,
    };
  }

  async loginStudent(payload: LoginDto, ipAddress: string = '') {
    const email = String(payload?.email || '').trim();
    if (!email) {
      throw new BadRequestException('Login or password wrong');
    }

    const existEmail = await this.prisma.student.findFirst({
      where: {
        email: {
          equals: email,
          mode: 'insensitive',
        },
      },
    });

    if (!existEmail) {
      throw new BadRequestException('Login or password wrong');
    }
    if (!(await comparePassword(payload.password, existEmail.password))) {
      throw new BadRequestException('Login or password wrong');
    }

    // Log login activity
    await this.logAndNotifyLogin(
      existEmail.email,
      ipAddress,
      payload.deviceName || 'N/A',
      payload.location || 'N/A',
      payload.userAgent || 'N/A',
      'student',
    );

    const accessToken = await this.generateToken({
      id: existEmail.id,
      email: existEmail.email,
      role: Role.STUDENT,
      fullName: existEmail.fullName,
    });

    return {
      success: true,
      accessToken,
    };
  }
}
