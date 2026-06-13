-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "agent_network";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "betting_core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "financial_ledger";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "game_integration";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "messaging";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "operator_domain";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "player_core";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "promotions";

-- CreateEnum
CREATE TYPE "operator_domain"."OperatorStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "agent_network"."AgentStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "player_core"."PlayerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateEnum
CREATE TYPE "player_core"."ActorType" AS ENUM ('PLAYER', 'AGENT', 'OPERATOR');

-- CreateEnum
CREATE TYPE "player_core"."NotificationType" AS ENUM ('BALANCE_UPDATE', 'TRANSACTION_CLAIMED', 'TRANSACTION_COMPLETED', 'BET_RESULT', 'BONUS_GRANTED', 'SYSTEM');

-- CreateEnum
CREATE TYPE "financial_ledger"."TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL');

-- CreateEnum
CREATE TYPE "financial_ledger"."TransactionStatus" AS ENUM ('PENDING', 'CLAIMED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "financial_ledger"."PaymentMethod" AS ENUM ('CBE_BIRR', 'TELEBIRR', 'EBIRR', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "financial_ledger"."CreditRequestStatus" AS ENUM ('PENDING', 'CLAIMED', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "financial_ledger"."CommissionType" AS ENUM ('CLAIM', 'DEPOSIT', 'WITHDRAWAL', 'PLAYER_LOSS');

-- CreateEnum
CREATE TYPE "financial_ledger"."LedgerDirection" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "financial_ledger"."LedgerAccountKind" AS ENUM ('PLAYER_REAL', 'PLAYER_BONUS', 'AGENT_CREDIT', 'AGENT_COMMISSION', 'OPERATOR');

-- CreateEnum
CREATE TYPE "financial_ledger"."LedgerRefType" AS ENUM ('TRANSACTION', 'BET', 'COMMISSION', 'CREDIT_REQUEST', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "game_integration"."GameCategory" AS ENUM ('KENO', 'FOOTBALL_CUP', 'WORLD_CUP', 'HORSE_RACING', 'GREYHOUND_RACING', 'STEEPLECHASE', 'LUCKY_SIX', 'PENALTY_SHOOTOUT', 'FORCE_1_RACING', 'VIRTUAL_RACES', 'FOOTBALL');

-- CreateEnum
CREATE TYPE "game_integration"."GameBadge" AS ENUM ('HOT', 'TOP', 'NEW');

-- CreateEnum
CREATE TYPE "betting_core"."BetType" AS ENUM ('SINGLE', 'MULTI', 'COMBO', 'SYSTEM');

-- CreateEnum
CREATE TYPE "betting_core"."BetStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'VOID', 'CASHED_OUT');

-- CreateEnum
CREATE TYPE "betting_core"."SelectionResult" AS ENUM ('PENDING', 'WON', 'LOST', 'VOID');

-- CreateEnum
CREATE TYPE "promotions"."PromotionType" AS ENUM ('DAILY_CASHBACK', 'ULTRA_CASHBACK', 'SPORT_ACCUMULATOR', 'SINGLE_BOOST', 'AUTO_CASHOUT', 'COMBIBOOST');

-- CreateEnum
CREATE TYPE "promotions"."PlayerBonusStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "promotions"."TournamentStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "messaging"."ChatSubjectType" AS ENUM ('TRANSACTION', 'CREDIT_REQUEST');

-- CreateTable
CREATE TABLE "operator_domain"."Operator" (
    "id" UUID NOT NULL,
    "supabaseUserId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "operator_domain"."OperatorStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operator_domain"."OperatorWallet" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "accountId" UUID NOT NULL,

    CONSTRAINT "OperatorWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_network"."Agent" (
    "id" UUID NOT NULL,
    "supabaseUserId" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "status" "agent_network"."AgentStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Agent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_network"."AgentWallet" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "accountId" UUID NOT NULL,

    CONSTRAINT "AgentWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_network"."CommissionConfig" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "claimCommissionRate" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "depositCommissionRate" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "withdrawalCommissionRate" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "playerLossBonusRate" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "minOdds" DECIMAL(20,8),
    "dailyCapAmount" DECIMAL(20,8),
    "weeklyCapAmount" DECIMAL(20,8),
    "claimEnabled" BOOLEAN NOT NULL DEFAULT true,
    "depositEnabled" BOOLEAN NOT NULL DEFAULT true,
    "withdrawalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "playerLossEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommissionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_core"."Player" (
    "id" UUID NOT NULL,
    "supabaseUserId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "phone" TEXT,
    "status" "player_core"."PlayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_core"."PlayerWallet" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "walletId" UUID NOT NULL,

    CONSTRAINT "PlayerWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_core"."Notification" (
    "id" UUID NOT NULL,
    "recipientType" "player_core"."ActorType" NOT NULL,
    "recipientId" UUID NOT NULL,
    "type" "player_core"."NotificationType" NOT NULL,
    "payload" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger"."Wallet" (
    "id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "balance" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "withdrawableBalance" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "lockedBalance" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "bonusBalance" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger"."AgentAccount" (
    "id" UUID NOT NULL,
    "creditBalance" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "commissionBalance" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger"."OperatorAccount" (
    "id" UUID NOT NULL,
    "creditBalance" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OperatorAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger"."Transaction" (
    "id" UUID NOT NULL,
    "type" "financial_ledger"."TransactionType" NOT NULL,
    "playerId" UUID NOT NULL,
    "agentId" UUID,
    "amount" DECIMAL(20,8) NOT NULL,
    "paymentMethod" "financial_ledger"."PaymentMethod" NOT NULL,
    "status" "financial_ledger"."TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "playerPhone" TEXT NOT NULL,
    "zplayPhone" TEXT NOT NULL,
    "claimVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger"."AgentCreditRequest" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "operatorId" UUID,
    "amount" DECIMAL(20,8) NOT NULL,
    "paymentMethod" "financial_ledger"."PaymentMethod" NOT NULL,
    "status" "financial_ledger"."CreditRequestStatus" NOT NULL DEFAULT 'PENDING',
    "claimVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AgentCreditRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger"."CommissionLog" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "playerId" UUID,
    "transactionId" UUID,
    "betId" UUID,
    "type" "financial_ledger"."CommissionType" NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "rateApplied" DECIMAL(20,8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommissionLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger"."LedgerEntry" (
    "id" UUID NOT NULL,
    "accountKind" "financial_ledger"."LedgerAccountKind" NOT NULL,
    "ownerId" UUID NOT NULL,
    "direction" "financial_ledger"."LedgerDirection" NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "balanceAfter" DECIMAL(20,8) NOT NULL,
    "currency" TEXT NOT NULL,
    "refType" "financial_ledger"."LedgerRefType" NOT NULL,
    "refId" UUID NOT NULL,
    "reason" TEXT,
    "actorType" "player_core"."ActorType" NOT NULL,
    "actorId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger"."AdminBalanceAdjustment" (
    "id" UUID NOT NULL,
    "operatorId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminBalanceAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_integration"."GameProvider" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "GameProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_integration"."Game" (
    "id" UUID NOT NULL,
    "providerId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "game_integration"."GameCategory" NOT NULL,
    "thumbnailUrl" TEXT,
    "minBet" DECIMAL(20,8) NOT NULL,
    "maxBet" DECIMAL(20,8) NOT NULL,
    "badge" "game_integration"."GameBadge",
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_integration"."PlayerGameFavourite" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerGameFavourite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_integration"."PlayerGameLike" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlayerGameLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "betting_core"."Bet" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "gameId" UUID NOT NULL,
    "type" "betting_core"."BetType" NOT NULL,
    "stake" DECIMAL(20,8) NOT NULL,
    "totalOdds" DECIMAL(20,8) NOT NULL,
    "potentialReturn" DECIMAL(20,8) NOT NULL,
    "payout" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "status" "betting_core"."BetStatus" NOT NULL DEFAULT 'OPEN',
    "acceptBetterOdds" BOOLEAN NOT NULL DEFAULT false,
    "usedBonus" BOOLEAN NOT NULL DEFAULT false,
    "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "Bet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "betting_core"."BetSelection" (
    "id" UUID NOT NULL,
    "betId" UUID NOT NULL,
    "marketName" TEXT NOT NULL,
    "selectionName" TEXT NOT NULL,
    "oddsAtPlacement" DECIMAL(20,8) NOT NULL,
    "result" "betting_core"."SelectionResult" NOT NULL DEFAULT 'PENDING',
    "externalRef" TEXT,

    CONSTRAINT "BetSelection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions"."Promotion" (
    "id" UUID NOT NULL,
    "type" "promotions"."PromotionType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "config" JSONB NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions"."PlayerBonus" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "promotionId" UUID,
    "amount" DECIMAL(20,8) NOT NULL,
    "wageringRequirement" DECIMAL(20,8) NOT NULL,
    "wageredAmount" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "status" "promotions"."PlayerBonusStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "PlayerBonus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions"."PromoCode" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "bonusAmount" DECIMAL(20,8) NOT NULL,
    "maxRedemptions" INTEGER,
    "redemptionCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PromoCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions"."PromoCodeRedemption" (
    "id" UUID NOT NULL,
    "promoCodeId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromoCodeRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions"."Tournament" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "prizePool" DECIMAL(20,8) NOT NULL,
    "status" "promotions"."TournamentStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tournament_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions"."TournamentEntry" (
    "id" UUID NOT NULL,
    "tournamentId" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "points" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TournamentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "promotions"."CombiBoostTier" (
    "id" UUID NOT NULL,
    "minSelections" INTEGER NOT NULL,
    "boostPercent" DECIMAL(20,8) NOT NULL,
    "minOdds" DECIMAL(20,8) NOT NULL,

    CONSTRAINT "CombiBoostTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."ChatThread" (
    "id" UUID NOT NULL,
    "subjectType" "messaging"."ChatSubjectType" NOT NULL,
    "subjectId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messaging"."ChatMessage" (
    "id" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "senderType" "player_core"."ActorType" NOT NULL,
    "senderId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_supabaseUserId_key" ON "operator_domain"."Operator"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorWallet_operatorId_key" ON "operator_domain"."OperatorWallet"("operatorId");

-- CreateIndex
CREATE UNIQUE INDEX "OperatorWallet_accountId_key" ON "operator_domain"."OperatorWallet"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "Agent_supabaseUserId_key" ON "agent_network"."Agent"("supabaseUserId");

-- CreateIndex
CREATE INDEX "Agent_operatorId_status_idx" ON "agent_network"."Agent"("operatorId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWallet_agentId_key" ON "agent_network"."AgentWallet"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentWallet_accountId_key" ON "agent_network"."AgentWallet"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "CommissionConfig_agentId_key" ON "agent_network"."CommissionConfig"("agentId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_supabaseUserId_key" ON "player_core"."Player"("supabaseUserId");

-- CreateIndex
CREATE INDEX "Player_agentId_status_idx" ON "player_core"."Player"("agentId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerWallet_playerId_key" ON "player_core"."PlayerWallet"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerWallet_walletId_key" ON "player_core"."PlayerWallet"("walletId");

-- CreateIndex
CREATE INDEX "Notification_recipientType_recipientId_readAt_idx" ON "player_core"."Notification"("recipientType", "recipientId", "readAt");

-- CreateIndex
CREATE INDEX "Transaction_status_type_idx" ON "financial_ledger"."Transaction"("status", "type");

-- CreateIndex
CREATE INDEX "Transaction_agentId_status_idx" ON "financial_ledger"."Transaction"("agentId", "status");

-- CreateIndex
CREATE INDEX "Transaction_playerId_idx" ON "financial_ledger"."Transaction"("playerId");

-- CreateIndex
CREATE INDEX "AgentCreditRequest_status_idx" ON "financial_ledger"."AgentCreditRequest"("status");

-- CreateIndex
CREATE INDEX "AgentCreditRequest_agentId_status_idx" ON "financial_ledger"."AgentCreditRequest"("agentId", "status");

-- CreateIndex
CREATE INDEX "CommissionLog_agentId_createdAt_idx" ON "financial_ledger"."CommissionLog"("agentId", "createdAt");

-- CreateIndex
CREATE INDEX "CommissionLog_type_idx" ON "financial_ledger"."CommissionLog"("type");

-- CreateIndex
CREATE INDEX "LedgerEntry_accountKind_ownerId_createdAt_idx" ON "financial_ledger"."LedgerEntry"("accountKind", "ownerId", "createdAt");

-- CreateIndex
CREATE INDEX "LedgerEntry_refType_refId_idx" ON "financial_ledger"."LedgerEntry"("refType", "refId");

-- CreateIndex
CREATE INDEX "AdminBalanceAdjustment_playerId_createdAt_idx" ON "financial_ledger"."AdminBalanceAdjustment"("playerId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GameProvider_code_key" ON "game_integration"."GameProvider"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Game_providerId_code_key" ON "game_integration"."Game"("providerId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameFavourite_playerId_gameId_key" ON "game_integration"."PlayerGameFavourite"("playerId", "gameId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerGameLike_playerId_gameId_key" ON "game_integration"."PlayerGameLike"("playerId", "gameId");

-- CreateIndex
CREATE INDEX "Bet_playerId_status_idx" ON "betting_core"."Bet"("playerId", "status");

-- CreateIndex
CREATE INDEX "Bet_gameId_idx" ON "betting_core"."Bet"("gameId");

-- CreateIndex
CREATE INDEX "Bet_status_idx" ON "betting_core"."Bet"("status");

-- CreateIndex
CREATE INDEX "BetSelection_betId_idx" ON "betting_core"."BetSelection"("betId");

-- CreateIndex
CREATE INDEX "PlayerBonus_playerId_status_idx" ON "promotions"."PlayerBonus"("playerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCode_code_key" ON "promotions"."PromoCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PromoCodeRedemption_promoCodeId_playerId_key" ON "promotions"."PromoCodeRedemption"("promoCodeId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "TournamentEntry_tournamentId_playerId_key" ON "promotions"."TournamentEntry"("tournamentId", "playerId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatThread_subjectType_subjectId_key" ON "messaging"."ChatThread"("subjectType", "subjectId");

-- CreateIndex
CREATE INDEX "ChatMessage_threadId_createdAt_idx" ON "messaging"."ChatMessage"("threadId", "createdAt");

-- AddForeignKey
ALTER TABLE "operator_domain"."OperatorWallet" ADD CONSTRAINT "OperatorWallet_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operator_domain"."Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operator_domain"."OperatorWallet" ADD CONSTRAINT "OperatorWallet_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_ledger"."OperatorAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_network"."Agent" ADD CONSTRAINT "Agent_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operator_domain"."Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_network"."AgentWallet" ADD CONSTRAINT "AgentWallet_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent_network"."Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_network"."AgentWallet" ADD CONSTRAINT "AgentWallet_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "financial_ledger"."AgentAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_network"."CommissionConfig" ADD CONSTRAINT "CommissionConfig_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent_network"."Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_core"."Player" ADD CONSTRAINT "Player_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent_network"."Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_core"."PlayerWallet" ADD CONSTRAINT "PlayerWallet_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_core"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_core"."PlayerWallet" ADD CONSTRAINT "PlayerWallet_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "financial_ledger"."Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger"."Transaction" ADD CONSTRAINT "Transaction_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_core"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger"."Transaction" ADD CONSTRAINT "Transaction_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent_network"."Agent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger"."AgentCreditRequest" ADD CONSTRAINT "AgentCreditRequest_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent_network"."Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger"."AgentCreditRequest" ADD CONSTRAINT "AgentCreditRequest_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operator_domain"."Operator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger"."CommissionLog" ADD CONSTRAINT "CommissionLog_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agent_network"."Agent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger"."CommissionLog" ADD CONSTRAINT "CommissionLog_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_core"."Player"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger"."CommissionLog" ADD CONSTRAINT "CommissionLog_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "financial_ledger"."Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger"."CommissionLog" ADD CONSTRAINT "CommissionLog_betId_fkey" FOREIGN KEY ("betId") REFERENCES "betting_core"."Bet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger"."AdminBalanceAdjustment" ADD CONSTRAINT "AdminBalanceAdjustment_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "operator_domain"."Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_ledger"."AdminBalanceAdjustment" ADD CONSTRAINT "AdminBalanceAdjustment_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_core"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_integration"."Game" ADD CONSTRAINT "Game_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "game_integration"."GameProvider"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_integration"."PlayerGameFavourite" ADD CONSTRAINT "PlayerGameFavourite_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_core"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_integration"."PlayerGameFavourite" ADD CONSTRAINT "PlayerGameFavourite_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_integration"."Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_integration"."PlayerGameLike" ADD CONSTRAINT "PlayerGameLike_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_core"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_integration"."PlayerGameLike" ADD CONSTRAINT "PlayerGameLike_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_integration"."Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "betting_core"."Bet" ADD CONSTRAINT "Bet_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_core"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "betting_core"."Bet" ADD CONSTRAINT "Bet_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "game_integration"."Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "betting_core"."BetSelection" ADD CONSTRAINT "BetSelection_betId_fkey" FOREIGN KEY ("betId") REFERENCES "betting_core"."Bet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions"."PlayerBonus" ADD CONSTRAINT "PlayerBonus_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_core"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions"."PlayerBonus" ADD CONSTRAINT "PlayerBonus_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "promotions"."Promotion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions"."PromoCodeRedemption" ADD CONSTRAINT "PromoCodeRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "promotions"."PromoCode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions"."PromoCodeRedemption" ADD CONSTRAINT "PromoCodeRedemption_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_core"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions"."TournamentEntry" ADD CONSTRAINT "TournamentEntry_tournamentId_fkey" FOREIGN KEY ("tournamentId") REFERENCES "promotions"."Tournament"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "promotions"."TournamentEntry" ADD CONSTRAINT "TournamentEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_core"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messaging"."ChatMessage" ADD CONSTRAINT "ChatMessage_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "messaging"."ChatThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;
