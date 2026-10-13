import test from 'node:test';
import assert from 'node:assert/strict';
import {OxxoHistory,verifyOxxoCoverage} from '../lib/oxxo-history';
const cutoff={year:2026,week:41};
const dat=(lines:string)=>Buffer.from(lines);
test('OXXO assigns late operations to their actual weeks and excludes weeks after the cutoff',()=>{
 const history=new OxxoHistory(cutoff);
 history.add(dat('1,2,20260928,1200,A,041234,10.25\n1,2,20261005,1200,B,041234,20.50\n1,2,20261012,1200,C,041234,30\n1,2,20261005,1200,D,051234,100\n'));
 assert.deepEqual(history.rows(),[{year:2026,week:40,count:1,amountCents:1025},{year:2026,week:41,count:1,amountCents:2050}]);assert.equal(history.records,2);
});
test('rebuilding the same corpus never adds weekly snapshots and duplicate original copies count once',()=>{
 const original=dat('1,2,20260928,1200,A,041234,10\n'),late=dat('1,2,20260929,1300,B,041234,5\n1,2,20261005,1200,C,041234,20\n');
 const old=new OxxoHistory(cutoff);old.add(original);
 const first=new OxxoHistory(cutoff);first.add(original);first.add(late);assert.equal(first.add(original).added,false);verifyOxxoCoverage(old.rows(),first.rows());
 assert.equal(first.rows()[0].amountCents,1500);
 const second=new OxxoHistory(cutoff);second.add(late);second.add(original);assert.deepEqual(second.rows(),first.rows());assert.equal(second.fingerprint(),first.fingerprint());
});
test('missing historical DAT weeks cannot erase saved history',()=>{
 const history=new OxxoHistory(cutoff);history.add(dat('1,2,20261005,1200,A,041234,10\n'));
 assert.throws(()=>verifyOxxoCoverage([{year:2026,week:40,count:10,amountCents:10000}],history.rows()),/Faltan DAT/);assert.throws(()=>verifyOxxoCoverage([],[]),/no contienen operaciones/);
});
test('OXXO preserves record multiplicity and the notebook non-empty folio frequency rule',()=>{
 const history=new OxxoHistory(cutoff);history.add(dat('1,2,20261005,1200,A,041234,10\n1,2,20261005,1200,A,041234,10\n1,2,20261005,1200,,041234,5\n'));
 assert.deepEqual(history.rows(),[{year:2026,week:41,count:2,amountCents:2500}]);assert.equal(history.records,3);
});
test('OXXO groups ISO years across December and rejects invalid input instead of saving a partial result',()=>{
 const history=new OxxoHistory({year:2026,week:1});history.add(dat('1,2,20251228,1200,A,041234,1\n1,2,20251229,1200,B,041234,2\n'));
 assert.deepEqual(history.rows(),[{year:2025,week:52,count:1,amountCents:100},{year:2026,week:1,count:1,amountCents:200}]);
 assert.throws(()=>history.add(dat('1,2,20260230,1200,C,041234,10\n')),/Fecha/);assert.throws(()=>history.add(dat('1,2,20251229,1200,D,041234,-1\n')),/Importe/);assert.throws(()=>history.add(dat('1,2,20251229\n')),/siete columnas/);
});
