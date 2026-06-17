import { OperatorsService } from './operators.service';

function build() {
  const tx = {
    operatorAccount: { create: jest.fn().mockResolvedValue({ id: 'acc1' }) },
    operator: {
      create: jest.fn().mockResolvedValue({ id: 'op1', name: 'Main' }),
    },
    operatorWallet: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    operator: { findUnique: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn((cb: (c: typeof tx) => unknown) => cb(tx)),
  };
  const supabase = {
    admin: {
      auth: { admin: { updateUserById: jest.fn().mockResolvedValue({}) } },
    },
  };
  const service = new OperatorsService(prisma as never, supabase as never);
  return { service, prisma, tx, supabase };
}

describe('OperatorsService', () => {
  it('creates account + operator + wallet bridge and promotes JWT claims', async () => {
    const { service, tx, supabase } = build();
    const op = await service.provisionOperator({
      supabaseUserId: 'sb-1',
      name: 'Main',
    });
    expect(op.id).toBe('op1');
    expect(tx.operatorAccount.create).toHaveBeenCalled();
    expect(tx.operator.create).toHaveBeenCalled();
    expect(tx.operatorWallet.create).toHaveBeenCalledWith({
      data: { operatorId: 'op1', accountId: 'acc1' },
    });
    expect(supabase.admin.auth.admin.updateUserById).toHaveBeenCalledWith(
      'sb-1',
      {
        app_metadata: { platform_role: 'OPERATOR', platform_id: 'op1' },
      },
    );
  });

  it('is idempotent when the operator already exists', async () => {
    const { service, prisma, supabase } = build();
    prisma.operator.findUnique.mockResolvedValue({ id: 'existing' });
    const op = await service.provisionOperator({
      supabaseUserId: 'sb-1',
      name: 'Main',
    });
    expect(op.id).toBe('existing');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(supabase.admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});
