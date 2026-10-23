import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchOfficialLabel } from '../src/lib/ml-label-api';

test('official labels go directly to ML with the selected seller authorization', async () => {
  const urls: string[] = [];
  const mock = async (url: string | URL | Request) => {
    const value = String(url); urls.push(value);
    if (value.endsWith('/token')) return Response.json({ access_token: 'secret', ml_user_id: 'seller' });
    if (value.endsWith('/orders/1234567890123456')) return Response.json({ seller: { id: 'seller' }, shipping: { id: '123' } });
    if (value.endsWith('/shipments/123')) return Response.json({ id: 123, sender_id: 'seller' });
    return new Response('%PDF-official');
  };
  const result = await fetchOfficialLabel('1234567890123456', 'selected-account', 'order', mock as typeof fetch);
  assert.equal(result.toString(), '%PDF-official');
  assert(urls[0].endsWith('/api/accounts/selected-account/token'));
  assert.equal(urls[3], 'https://api.mercadolibre.com/shipment_labels?shipment_ids=123&response_type=pdf');
  assert(!urls.some(url => url.includes('/api/shipments/')));
});
test('other sellers and non-PDF responses cannot be printed as an official label', async () => {
  let seller = 'other';
  const mock = async (url: string | URL | Request) => {
    if (String(url).endsWith('/token')) return Response.json({ access_token: 'secret', ml_user_id: 'seller' });
    if (String(url).includes('/shipments/')) return Response.json({ id: 123, sender_id: seller });
    return Response.json({ error: 'not ready' });
  };
  await assert.rejects(fetchOfficialLabel('123', 'account', 'shipment', mock as typeof fetch), /no corresponde/);
  seller = 'seller';
  await assert.rejects(fetchOfficialLabel('123', 'account', 'shipment', mock as typeof fetch), /PDF válida/);
});
