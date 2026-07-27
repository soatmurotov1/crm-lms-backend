import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from 'src/common/prisma/prisma.module';
import { VerificationService } from './verification.service';
import { SmsModule } from 'src/common/sms/sms.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        if (!process.env.JWT_SECRET) {
          throw new Error('JWT_SECRET environment variable is required');
        }

        return {
          secret: process.env.JWT_SECRET,
          signOptions: {
            expiresIn: '2h',
          },
        };
      },
    }),
    PrismaModule,
    SmsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, VerificationService],
  exports: [VerificationService],
})
export class AuthModule {}
