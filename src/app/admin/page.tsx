import { redirect } from 'next/navigation';

type AdminCompatibilityPageProps = {
  searchParams: Promise<{ tab?: string }>;
};

const tabMap: Record<string, string> = {
  users: 'users',
  'ml-accounts': 'ml-accounts',
  cubicles: 'cubicles',
  duplicates: 'merge',
  'ml-missing': 'ml-missing',
};

/** Compatibilidad para enlaces y marcadores del panel administrativo anterior. */
export default async function AdminCompatibilityPage({ searchParams }: AdminCompatibilityPageProps) {
  const { tab = 'ml-missing' } = await searchParams;
  redirect(`/supervisor?tab=${tabMap[tab] || 'ml-missing'}`);
}
