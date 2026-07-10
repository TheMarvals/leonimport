import { NextResponse } from 'next/server';
import { syncOrders } from '@/lib/sync-orders';

export async function POST() {
  try {
    const result = await syncOrders(30);
    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Sync Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
