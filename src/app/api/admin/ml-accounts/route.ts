import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getSession } from '@/lib/session';
import { getLegacyMlAccount } from '@/lib/ml-accounts';
import { randomUUID } from 'crypto';
import { getMlGatewayApiKey, getMlGatewayAppId, getMlGatewayUrl } from '@/lib/ml-gateway-config';

async function getAdminSession() {
  const session = await getSession();
  return session.isLoggedIn && ['SUPERVISOR', 'ADMIN'].includes(session.role) ? session : null;
}

const gatewayHeaders = () => ({
  'x-api-key': getMlGatewayApiKey(),
  'x-app-id': getMlGatewayAppId(),
  'Content-Type': 'application/json',
});

async function inspectGatewayAccount(gatewayAccountId: string) {
  const tokenResponse = await fetch(
    `${getMlGatewayUrl()}/api/accounts/${encodeURIComponent(gatewayAccountId)}/token`,
    {
      headers: gatewayHeaders(),
      signal: AbortSignal.timeout(10000),
      cache: 'no-store',
    },
  );

  if (!tokenResponse.ok) {
    const detail = await tokenResponse.text().catch(() => '');
    throw new Error(`El gateway no reconoce esta cuenta (${tokenResponse.status})${detail ? `: ${detail}` : ''}`);
  }

  const tokenData = await tokenResponse.json();
  if (!tokenData.access_token) throw new Error('El gateway no devolvió un token válido para esta cuenta');

  const userResponse = await fetch('https://api.mercadolibre.com/users/me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
    signal: AbortSignal.timeout(10000),
    cache: 'no-store',
  });

  if (!userResponse.ok) {
    throw new Error(`Mercado Libre rechazó el token de la cuenta (${userResponse.status})`);
  }

  const user = await userResponse.json();
  if (!user.id) throw new Error('Mercado Libre no informó el seller ID de la cuenta');

  return {
    sellerId: String(user.id),
    nickname: String(user.nickname || user.first_name || `ML ${user.id}`),
    siteId: user.site_id ? String(user.site_id) : null,
  };
}

export async function GET() {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  // Primera apertura: convierte la configuración histórica de .env en una fila
  // administrable. Desde ese momento puede desactivarse sin que el fallback la
  // vuelva a conectar automáticamente.
  if ((await prisma.mercadoLibreAccount.count()) === 0) {
    const legacy = getLegacyMlAccount();
    await prisma.mercadoLibreAccount.create({
      data: {
        gatewayAccountId: legacy.gatewayAccountId,
        sellerId: legacy.sellerId,
        nickname: legacy.nickname,
      },
    });
  }

  const accounts = await prisma.mercadoLibreAccount.findMany({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(accounts);
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  try {
    const body = await request.json();
    if (body.action === 'list_gateway_accounts') {
      const response = await fetch(`${getMlGatewayUrl()}/api/accounts`, {
        headers: gatewayHeaders(),
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudieron consultar las cuentas del gateway');
      return NextResponse.json({
        accounts: (data.accounts || []).map((account: any) => ({
          gatewayAccountId: String(account.ml_account_id),
          sellerId: String(account.ml_user_id),
          nickname: String(account.ml_nickname || `ML ${account.ml_user_id}`),
          siteId: account.site_id ? String(account.site_id) : null,
        })),
      });
    }

    if (body.action === 'generate_link') {
      const clientId = randomUUID();
      const response = await fetch(`${getMlGatewayUrl()}/api/generate-link`, {
        method: 'POST',
        headers: gatewayHeaders(),
        body: JSON.stringify({
          client_id: clientId,
          created_by_info: `Leon Import WMS: ${session.name}`,
        }),
        signal: AbortSignal.timeout(10000),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.link?.url) {
        throw new Error(data.error || 'El gateway no pudo generar el enlace de autorización');
      }
      return NextResponse.json({
        clientId,
        url: data.link.url,
        expiresAt: data.link.expires_at,
      }, { status: 201 });
    }

    if (body.action === 'complete_link') {
      const clientId = String(body.clientId || '');
      if (!clientId) {
        return NextResponse.json({ error: 'Falta identificar el enlace de autorización' }, { status: 400 });
      }

      const response = await fetch(
        `${getMlGatewayUrl()}/api/accounts`,
        { headers: gatewayHeaders(), signal: AbortSignal.timeout(10000), cache: 'no-store' },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'No se pudieron consultar las cuentas del gateway');

      const gatewayAccount = (data.accounts || []).find((account: any) => account.client_id === clientId);
      if (!gatewayAccount) {
        return NextResponse.json({
          error: 'La autorización aún no aparece completada. Termina el proceso en Mercado Libre y vuelve a intentar.',
        }, { status: 409 });
      }

      const gatewayAccountId = String(gatewayAccount.ml_account_id);
      const identity = {
        sellerId: String(gatewayAccount.ml_user_id),
        nickname: String(gatewayAccount.ml_nickname || `ML ${gatewayAccount.ml_user_id}`),
        siteId: gatewayAccount.site_id ? String(gatewayAccount.site_id) : null,
      };
      const account = await prisma.mercadoLibreAccount.upsert({
        where: { gatewayAccountId },
        update: { ...identity, isActive: true },
        create: { gatewayAccountId, ...identity },
      });
      return NextResponse.json(account, { status: 201 });
    }

    const gatewayAccountId = String(body.gatewayAccountId || '').trim();
    if (!gatewayAccountId || gatewayAccountId.length > 100) {
      return NextResponse.json({ error: 'Ingresa el ID de cuenta entregado por el gateway' }, { status: 400 });
    }

    const identity = await inspectGatewayAccount(gatewayAccountId);
    const sellerConflict = await prisma.mercadoLibreAccount.findFirst({
      where: { sellerId: identity.sellerId, NOT: { gatewayAccountId } },
    });
    if (sellerConflict) {
      return NextResponse.json({ error: 'Esta cuenta de Mercado Libre ya está vinculada con otro ID del gateway' }, { status: 409 });
    }

    const account = await prisma.mercadoLibreAccount.upsert({
      where: { gatewayAccountId },
      update: { ...identity, isActive: true },
      create: { gatewayAccountId, ...identity },
    });
    return NextResponse.json(account, { status: 201 });
  } catch (error: any) {
    console.error('[ML Accounts] Error vinculando cuenta:', error);
    return NextResponse.json({ error: error.message || 'No se pudo vincular la cuenta' }, { status: 502 });
  }
}

export async function PATCH(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });

  try {
    const { id, alias: rawAlias } = await request.json();
    const idValue = String(id || '');
    const alias = String(rawAlias || '').trim();
    if (!idValue) return NextResponse.json({ error: 'Falta identificar la cuenta' }, { status: 400 });
    if (alias.length > 60) return NextResponse.json({ error: 'El alias puede tener hasta 60 caracteres' }, { status: 400 });

    if (alias) {
      const duplicate = await prisma.mercadoLibreAccount.findFirst({
        where: { id: { not: idValue }, isActive: true, alias: { equals: alias, mode: 'insensitive' } },
        select: { id: true },
      });
      if (duplicate) return NextResponse.json({ error: 'Otra cuenta activa ya utiliza este alias' }, { status: 409 });
    }

    const current = await prisma.mercadoLibreAccount.findUnique({ where: { id: idValue } });
    if (!current) return NextResponse.json({ error: 'La cuenta no existe' }, { status: 404 });

    const account = await prisma.$transaction(async transaction => {
      const updated = await transaction.mercadoLibreAccount.update({
        where: { id: idValue },
        data: { alias: alias || null },
      });
      await transaction.auditLog.create({
        data: {
          userId: session.userId,
          action: 'UPDATE_ML_ACCOUNT_ALIAS',
          metadata: {
            sellerId: current.sellerId,
            nickname: current.nickname,
            previousAlias: current.alias,
            newAlias: alias || null,
          },
        },
      });
      return updated;
    });

    return NextResponse.json(account);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'No se pudo actualizar el alias' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await getAdminSession())) {
    return NextResponse.json({ error: 'Solo administradores' }, { status: 403 });
  }

  try {
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Falta el ID de la cuenta' }, { status: 400 });

    const account = await prisma.mercadoLibreAccount.update({
      where: { id: String(id) },
      data: { isActive: false },
    });
    return NextResponse.json({ success: true, account });
  } catch (error: any) {
    if (error?.code === 'P2025') {
      return NextResponse.json({ error: 'La cuenta no existe' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message || 'No se pudo quitar la cuenta' }, { status: 500 });
  }
}
