import { Module } from '@nestjs/common';
import { CommissionModule } from '../commission/commission.module';
import { LedgerModule } from '../ledger/ledger.module';
import { BettingController } from './betting.controller';
import { BettingService } from './betting.service';

@Module({
  imports: [LedgerModule, CommissionModule],
  controllers: [BettingController],
  providers: [BettingService],
})
export class BettingModule {}
