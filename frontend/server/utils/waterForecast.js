// Experimental, measured-history-only trend. Never creates historical observations
// or a confidence/accuracy percentage. Levels may be negative relative to MSL.
export function thaiTimestamp(value){
  if(typeof value==='number')return Number.isFinite(value)?value:NaN;
  if(typeof value!=='string'||!value.trim())return NaN;
  const input=value.trim().replace(' ','T');
  return Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(input)?input:input+'+07:00');
}
export function normalizeHistory(rows,now=Date.now()){
  const hourly=new Map();
  for(const row of rows){
    const timestamp=thaiTimestamp(row.timestamp??row.datetime??row.waterlevel_datetime);
    const raw=row.level??row.value??row.waterlevel_msl;
    if(raw==null||raw===''||typeof raw==='boolean')continue;
    const level=Number(raw);
    if(!Number.isFinite(timestamp)||!Number.isFinite(level)||timestamp>now+10*60000)continue;
    const bucket=Math.floor(timestamp/3600000),previous=hourly.get(bucket);
    if(!previous||timestamp>previous.timestamp)hourly.set(bucket,{timestamp,datetime:new Date(timestamp).toISOString(),level});
  }
  return [...hourly.values()].sort((a,b)=>a.timestamp-b.timestamp);
}
function slopeAt(points,anchor){
  const recent=points.filter(p=>p.timestamp<=anchor&&p.timestamp>=anchor-6*3600000).slice(-6);
  if(recent.length<3||recent.at(-1).timestamp-recent[0].timestamp<2*3600000)return null;
  const meanX=recent.reduce((sum,p)=>sum+(p.timestamp-anchor)/3600000,0)/recent.length;
  const meanY=recent.reduce((sum,p)=>sum+p.level,0)/recent.length;
  let numerator=0,denominator=0;
  for(const p of recent){const dx=(p.timestamp-anchor)/3600000-meanX;numerator+=dx*(p.level-meanY);denominator+=dx*dx;}
  return denominator?numerator/denominator:null;
}
function forecastLevel(level,slope,hours){return level+slope*12*(1-Math.exp(-hours/12));}
export function predictWaterTrend(history,now=Date.now()){
  const points=normalizeHistory(history,now),last=points.at(-1);
  if(!last||now-last.timestamp>2*3600000)return [];
  const slope=slopeAt(points,last.timestamp);
  if(slope===null)return [];
  return Array.from({length:12},(_,i)=>{
    const hours=i+1,timestamp=last.timestamp+hours*3600000;
    return {timestamp,datetime:new Date(timestamp).toISOString(),predictedLevel:Math.round(forecastLevel(last.level,slope,hours)*1000)/1000,confidence:null};
  }).filter(p=>p.timestamp>now);
}
export function backtestWaterTrend(history,now=Date.now()){
  const points=normalizeHistory(history,now);
  const horizons=[1,3,6,12].map(hours=>{
    const errors=[],baseline=[];
    for(let i=2;i<points.length;i++){
      const anchor=points[i],slope=slopeAt(points,anchor.timestamp);
      if(slope===null)continue;
      const target=anchor.timestamp+hours*3600000;
      const actual=points.find(p=>p.timestamp>anchor.timestamp&&Math.abs(p.timestamp-target)<=20*60000);
      if(!actual)continue;
      const actualHours=(actual.timestamp-anchor.timestamp)/3600000;
      errors.push(forecastLevel(anchor.level,slope,actualHours)-actual.level);
      baseline.push(anchor.level-actual.level);
    }
    const mae=errors.length?errors.reduce((sum,e)=>sum+Math.abs(e),0)/errors.length:null;
    const rmse=errors.length?Math.sqrt(errors.reduce((sum,e)=>sum+e*e,0)/errors.length):null;
    const baselineMae=baseline.length?baseline.reduce((sum,e)=>sum+Math.abs(e),0)/baseline.length:null;
    return {hours,samples:errors.length,maeMeters:mae,rmseMeters:rmse,baselineMaeMeters:baselineMae};
  });
  return {method:'rolling-origin, six prior hourly observations, no future inputs',scope:'สถานีเดียวและช่วงประวัติที่โหลดได้ ไม่ใช่ผลยืนยันความแม่นยำทั่วประเทศ',horizons,accuracyPercent:null};
}
