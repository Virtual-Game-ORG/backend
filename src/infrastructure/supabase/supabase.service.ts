import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  readonly admin: ReturnType<typeof createClient>;

  constructor(config: ConfigService) {
    this.admin = createClient(
      config.getOrThrow<string>('supabase.url'),
      config.getOrThrow<string>('supabase.serviceRoleKey'),
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }
}
