import { prisma } from './prisma';

export type MlAccountConfig = {
  id: string | null;
  gatewayAccountId: string;
  sellerId: string;
  nickname: string;
  siteId: string | null;
  isLegacyEnv: boolean;
};

export function getLegacyMlAccount(): MlAccountConfig {
  return {
    id: null,
    gatewayAccountId: process.env.ML_ACCOUNT_ID || 'a7c9cdcf-4fbb-4e39-be78-a69bfea76d70',
    sellerId: process.env.ML_SELLER_ID || '1513023287',
    nickname: 'Cuenta configurada en .env',
    siteId: null,
    isLegacyEnv: true,
  };
}

/**
 * Usa las cuentas locales activas. Mientras el panel aún no haya sido
 * inicializado, conserva la cuenta histórica de .env para no cortar el sync.
 */
export async function getActiveMlAccounts(): Promise<MlAccountConfig[]> {
  const accounts = await prisma.mercadoLibreAccount.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });

  if (accounts.length > 0) {
    return accounts.map(account => ({
      id: account.id,
      gatewayAccountId: account.gatewayAccountId,
      sellerId: account.sellerId,
      nickname: account.nickname,
      siteId: account.siteId,
      isLegacyEnv: false,
    }));
  }

  // Una fila inactiva significa que el panel ya se inicializó y el usuario
  // desconectó todas las cuentas intencionalmente.
  const initialized = await prisma.mercadoLibreAccount.count();
  return initialized > 0 ? [] : [getLegacyMlAccount()];
}
