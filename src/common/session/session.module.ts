import { Global, Module } from '@nestjs/common';
import { SessionService } from './session.service';

/**
 * `AuthGuard` har bir modulda ishlatiladi, ya'ni `SessionService` hamma
 * joyda ko'rinishi kerak — `PrismaModule` kabi global qilingan.
 */
@Global()
@Module({
  providers: [SessionService],
  exports: [SessionService],
})
export class SessionModule {}
