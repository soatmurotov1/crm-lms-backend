import { Logger, Module } from '@nestjs/common';
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
        const secret = process.env.JWT_SECRET;
        if (!secret) {
          throw new Error('JWT_SECRET environment variable is required');
        }
        // Qisqa kalitni offline (hashcat) tanlab, istalgan foydalanuvchi
        // nomidan token yasash mumkin. Production'da kamida 32 belgi shart.
        if (secret.length < 32) {
          const message =
            'JWT_SECRET juda qisqa (kamida 32 belgi kerak). Yangisini yarating: ' +
            "node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"";
          if (process.env.NODE_ENV === 'production') throw new Error(message);
          new Logger('AuthModule').warn(message);
        }

        return {
          secret,
          signOptions: {
            expiresIn: '2h',
            algorithm: 'HS256',
          },
          // Algoritm qat'iy belgilanadi — `alg` sarlavhasini almashtirish
          // (algorithm confusion) hujumiga yo'l qo'yilmaydi.
          verifyOptions: { algorithms: ['HS256'] },
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
