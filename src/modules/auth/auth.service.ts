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

  async login(payload: LoginDto) {
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

  async loginTeacher(payload: LoginDto) {
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

    const passwordMatches = await comparePassword(
      payload.password,
      existEmail.password,
    );
    const plainPasswordMatches = payload.password === existEmail.password;
    if (!passwordMatches && !plainPasswordMatches) {
      throw new BadRequestException('Login or password wrong');
    }

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
  async loginStudent(payload: LoginDto) {
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
