import type {FeedbackRow} from '../storage/local';
export function evaluate(rows:FeedbackRow[]){
  const unique=new Map<string,FeedbackRow>();for(const row of rows)if(row.label)unique.set(row.contentHash,row);
  const labeled=[...unique.values()];const keeps=labeled.filter(r=>r.label==='KEEP');const noise=labeled.filter(r=>r.label==='COLLAPSE');
  const predicted=labeled.filter(r=>r.decision.state==='collapsed');const falseCollapse=keeps.filter(r=>r.decision.state==='collapsed').length;
  const trueCollapse=predicted.filter(r=>r.label==='COLLAPSE').length;
  const fcr=keeps.length?falseCollapse/keeps.length:null,precision=predicted.length?trueCollapse/predicted.length:null;
  const latencies=labeled.map(r=>r.decision.latencyMs).filter((n):n is number=>typeof n==='number'&&Number.isFinite(n)).sort((a,b)=>a-b);
  const versions=new Set(labeled.map(r=>JSON.stringify([r.policyVersion,r.schemaVersion,r.provider,r.requestedModel,r.thresholds])));
  const actualModels=new Set(labeled.map(r=>r.decision.model).filter(Boolean));
  const sessions=new Set(labeled.map(r=>r.sessionId));
  return {labeled:labeled.length,sessionCount:sessions.size,configurationCount:versions.size,actualModels:[...actualModels],
    falseCollapse:{count:falseCollapse,keepCount:keeps.length,rate:fcr},collapsePrecision:{correct:trueCollapse,predicted:predicted.length,rate:precision},
    noiseRecall:{correct:trueCollapse,total:noise.length,rate:noise.length?trueCollapse/noise.length:null},
    latencyMs:{mean:latencies.length?latencies.reduce((a,b)=>a+b,0)/latencies.length:null,p95:latencies.length?latencies[Math.ceil(latencies.length*.95)-1]:null},
    thresholdsMet:fcr!==null&&fcr<=.02&&precision!==null&&precision>=.9,
    readyForReview:labeled.length>=100&&sessions.size>=3&&versions.size===1&&actualModels.size<=1&&fcr!==null&&fcr<=.02&&precision!==null&&precision>=.9,
    note:'人工标注与独立留出样本仍需人工确认；报告不自动启用 Active。费用以服务商账单为准。'};
}
