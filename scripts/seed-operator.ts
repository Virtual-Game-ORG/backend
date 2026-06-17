/**
 * One-off bootstrap for the top-level Operator (operators have no HTTP creation
 * path). Boots a Nest application context so PrismaService/SupabaseService and
 * the config rules are honored — no direct process.env access here, only argv.
 *
 * Usage:
 *   npm run seed:operator -- --email ops@example.com --name "Main Operator" [--password '...']
 *
 * If the Supabase user already exists it is reused; otherwise --password is
 * required to create it.
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { OperatorsService } from '../src/features/operators/operators.service';
import { SupabaseService } from '../src/infrastructure/supabase/supabase.service';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function findUserIdByEmail(
  supabase: SupabaseService,
  email: string,
): Promise<string | undefined> {
  const { data, error } = await supabase.admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) throw new Error(`listUsers failed: ${error.message}`);
  return data.users.find((u) => u.email === email)?.id;
}

async function main(): Promise<void> {
  const email = arg('--email');
  const name = arg('--name');
  const password = arg('--password');

  if (!email || !name) {
    throw new Error('Required: --email <email> --name <name> [--password <pwd>]');
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const supabase = app.get(SupabaseService);
    const operators = app.get(OperatorsService);

    let supabaseUserId = await findUserIdByEmail(supabase, email);
    if (!supabaseUserId) {
      if (!password) {
        throw new Error(
          `No Supabase user for ${email}; pass --password to create one.`,
        );
      }
      const { data, error } = await supabase.admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error || !data.user) {
        throw new Error(`createUser failed: ${error?.message ?? 'unknown'}`);
      }
      supabaseUserId = data.user.id;
      // eslint-disable-next-line no-console
      console.log(`Created Supabase user ${supabaseUserId} for ${email}`);
    }

    const operator = await operators.provisionOperator({ supabaseUserId, name });
    // eslint-disable-next-line no-console
    console.log(`Operator provisioned: id=${operator.id} name="${operator.name}"`);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
