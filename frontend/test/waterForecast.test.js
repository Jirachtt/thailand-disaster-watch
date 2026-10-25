import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeHistory,predictWaterTrend,backtestWaterTrend,thaiTimestamp} from '../server/utils/waterForecast.js';
const start=Date.UTC(2026,9,21),history=Array.from({length:73},(_,i)=>({timestamp:start+i*3600000,level:-1+i*.01}));
const now=history.at(-1).timestamp;
test('Thai timestamps use Bangkok, real negative MSL and zero are preserved',()=>{
  assert.equal(thaiTimestamp('2026-10-25 12:00'),Date.UTC(2026,9,25,5));
  const rows=normalizeHistory([{timestamp:now,level:-.2},{timestamp:now-3600000,level:0},{timestamp:now-7200000,level:''}],now);
  assert.deepEqual(rows.map(x=>x.level),[0,-.2]);
});
test('dedup selects newest point even for reversed source order',()=>{
  const rows=[{timestamp:start,level:1},{timestamp:start+300000,level:2}];
  assert.deepEqual(normalizeHistory(rows,now),normalizeHistory([...rows].reverse(),now));
  assert.equal(normalizeHistory(rows,now)[0].level,2);
});
test('no made-up history or percentages; insufficient and stale data have no forecast',()=>{
  assert.deepEqual(predictWaterTrend(history.slice(0,2),now),[]);
  assert.deepEqual(predictWaterTrend(history,now+3*3600000),[]);
  const forecast=predictWaterTrend(history,now);assert.equal(forecast.length,12);
  assert.ok(forecast.every(x=>x.confidence===null));assert.ok(forecast[0].predictedLevel<0);
});
test('rolling backtest reports error in meters and a persistence baseline',()=>{
  const result=backtestWaterTrend(history,now),six=result.horizons.find(x=>x.hours===6);
  assert.ok(six.samples>30);assert.ok(six.maeMeters>=0);assert.ok(six.baselineMaeMeters>six.maeMeters);
  assert.equal(result.accuracyPercent,null);
});
test('future measurements never enter a forecast fit',()=>{
  const cutoff=history[24].timestamp;
  const futureChanged=history.map(x=>x.timestamp>cutoff?{...x,level:500}:x);
  assert.deepEqual(predictWaterTrend(history,cutoff),predictWaterTrend(futureChanged,cutoff));
});
