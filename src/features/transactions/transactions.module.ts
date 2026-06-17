import { Module } from '@nestjs/common';
import { CommissionModule } from '../commission/commission.module';
import { LedgerModule } from '../ledger/ledger.module';
import { TransactionsController } from './transactions.controller';
import { TransactionsService } from './transactions.service';

@Module({
  imports: [LedgerModule, CommissionModule],
  controllers: [TransactionsController],
  providers: [TransactionsService],
})
export class TransactionsModule {}
