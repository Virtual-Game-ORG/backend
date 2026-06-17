import { Injectable } from '@nestjs/common';
import { Operator } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { SupabaseService } from '../../infrastructure/supabase/supabase.service';
import { CURRENCY } from '../transactions/transactions.constants';
import { ProvisionOperatorInput } from './operators.types';

@Injectable()
export class OperatorsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly supabase: SupabaseService,
  ) {}

  /**
   * Provision the top-level Operator for an existing Supabase user. Idempotent:
   * re-running for the same user returns the existing record. Mirrors the player
   * provisioning flow in AuthService — create the financial account + bridge,
   * then promote the user's JWT claims via app_metadata.
   */
  async provisionOperator(input: ProvisionOperatorInput): Promise<Operator> {
    const existing = await this.prisma.operator.findUnique({
      where: { supabaseUserId: input.supabaseUserId },
    });
    if (existing) return existing;

    const operator = await this.prisma.$transaction(async (tx) => {
      const account = await tx.operatorAccount.create({
        data: { currency: CURRENCY },
      });
      const op = await tx.operator.create({
        data: {
          supabaseUserId: input.supabaseUserId,
          name: input.name,
          status: 'ACTIVE',
        },
      });
      await tx.operatorWallet.create({
        data: { operatorId: op.id, accountId: account.id },
      });
      return op;
    });

    await this.supabase.admin.auth.admin.updateUserById(input.supabaseUserId, {
      app_metadata: { platform_role: 'OPERATOR', platform_id: operator.id },
    });

    return operator;
  }
}
