import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../infrastructure/supabase/supabase.module';
import { LedgerModule } from '../ledger/ledger.module';
import { AgentsController } from './agents.controller';
import { AgentsService } from './agents.service';

@Module({
  imports: [SupabaseModule, LedgerModule],
  controllers: [AgentsController],
  providers: [AgentsService],
})
export class AgentsModule {}
