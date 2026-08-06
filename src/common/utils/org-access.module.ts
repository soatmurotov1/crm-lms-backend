import { Global, Module } from '@nestjs/common';

import { PrismaModule } from '../prisma/prisma.module';
import { OrgAccessService } from './org-access.service';

/**
 * `OrgAccessService` deyarli hamma modulga kerak, shuning uchun global —
 * har bir modulda alohida import qilib o'tirilmaydi.
 */
@Global()
@Module({
  imports: [PrismaModule],
  providers: [OrgAccessService],
  exports: [OrgAccessService],
})
export class OrgAccessModule {}
