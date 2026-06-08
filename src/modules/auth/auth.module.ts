import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from 'src/common/prisma/prisma.module';
import { TelegramModule } from 'src/common/telegram/telegram.module';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: {
        expiresIn: '2h',
      },
      global: true,
    }),
    PrismaModule,
    TelegramModule,
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
