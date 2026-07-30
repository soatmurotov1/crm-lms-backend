import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PaymeController } from './payme/payme.controller';
import { PaymeService } from './payme/payme.service';

@Module({
  controllers: [PaymentsController, PaymeController],
  providers: [PaymentsService, PaymeService],
})
export class PaymentsModule {}
