import { Module } from '@nestjs/common';
import { LedgerModule } from '../ledger/ledger.module';
import { CreditRequestsController } from './credit-requests.controller';
import { CreditRequestsService } from './credit-requests.service';

@Module({
  imports: [LedgerModule],
  controllers: [CreditRequestsController],
  providers: [CreditRequestsService],
})
export class CreditRequestsModule {}
