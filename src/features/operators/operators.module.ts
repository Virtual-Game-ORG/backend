import { Module } from '@nestjs/common';
import { SupabaseModule } from '../../infrastructure/supabase/supabase.module';
import { OperatorsService } from './operators.service';

@Module({
  imports: [SupabaseModule],
  providers: [OperatorsService],
  exports: [OperatorsService],
})
export class OperatorsModule {}
