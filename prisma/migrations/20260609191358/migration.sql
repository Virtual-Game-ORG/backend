-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "financial_ledger";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "player_core";

-- CreateEnum
CREATE TYPE "player_core"."PlayerStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'CLOSED');

-- CreateTable
CREATE TABLE "player_core"."Player" (
    "id" UUID NOT NULL,
    "supabaseUserId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "status" "player_core"."PlayerStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_ledger"."Wallet" (
    "id" UUID NOT NULL,
    "currency" TEXT NOT NULL,
    "balance" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "player_core"."PlayerWallet" (
    "id" UUID NOT NULL,
    "playerId" UUID NOT NULL,
    "walletId" UUID NOT NULL,

    CONSTRAINT "PlayerWallet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Player_supabaseUserId_key" ON "player_core"."Player"("supabaseUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerWallet_playerId_key" ON "player_core"."PlayerWallet"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlayerWallet_walletId_key" ON "player_core"."PlayerWallet"("walletId");

-- AddForeignKey
ALTER TABLE "player_core"."PlayerWallet" ADD CONSTRAINT "PlayerWallet_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "player_core"."Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "player_core"."PlayerWallet" ADD CONSTRAINT "PlayerWallet_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "financial_ledger"."Wallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
