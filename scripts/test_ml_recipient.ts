import test from 'node:test';
import assert from 'node:assert/strict';
import { usableName, buyerNameUpdate, fetchRecipientName } from '../src/lib/ml-recipient';
test('ocultamiento y valores ausentes no reemplazan un nombre conocido',()=>{
  for(const value of ['XXXXXXX','***',null,'','No disponible']) { assert.equal(usableName(value),null);assert.equal(buyerNameUpdate('Cliente',value),undefined); }
  assert.equal(buyerNameUpdate('XXXXXXX','Cliente'),'Cliente');assert.equal(buyerNameUpdate('Cliente','Cliente'),undefined);
});
test('consulta v2 conserva autenticación y selecciona el shipment forward exacto',async()=>{
  const fetcher: typeof fetch=async(url,options)=>{
    assert.ok(String(url).includes('/orders/456/shipments?views=destination'));
    assert.equal((options?.headers as any).Authorization,'Bearer test');
    assert.equal((options?.headers as any)['X-Api-Version'],'2');
    return Response.json([{id:999,receiver_address:{receiver_name:'Otro'}},{id:123,type:'return',receiver_address:{receiver_name:'Devolución'}},{id:123,type:'forward',receiver_address:{receiver_name:'Cliente'}}]);
  };
  assert.equal(await fetchRecipientName(456,123,{Authorization:'Bearer test'},fetcher),'Cliente');
});
test('errores temporales y máscaras siguen siendo datos pendientes',async()=>{
  assert.equal(await fetchRecipientName(456,123,{},async()=>Response.json({}, {status:503})),null);
  assert.equal(await fetchRecipientName(456,123,{},async()=>Response.json({id:123,receiver_address:{receiver_name:'XXXXXXX'}})),null);
});
