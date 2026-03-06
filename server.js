/**
 * AI Media Buying Dashboard
 * ✅ Zéro dépendances — Node.js natif uniquement
 * Lance avec: node server.js
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const CONFIG_FILE = path.join(__dirname, 'client-config.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

// ─── META CONFIG ──────────────────────────────────────────────────────────────
const ACCESS_TOKEN = "EAA2v8bZCgUdwBQZBYqZC8vM4JtoeWY7d8smH0XzDjAJly1EbrXRqWnhnexBZCfVELgidVAuOi4LeoDxdh2b9MdQ3ThBEdBMgrU792tvAajXvHMVuH9T6VZACalzcRDKF36EteV8NvAt92pvrZBG2Bj6RPLte5jg03GFez0bQZC1JfqqemG6ACeUX4AlRIdc9YbEYmDVZCdaqV9QwejONzFrlap2ZBdS1qjpJ1HYp6";
const AD_ACCOUNT_ID = "act_3582664558682010";
const CAMPAIGN_ID = "120239911029690660";
const API_BASE = "graph.facebook.com";
const API_VERSION = "v21.0";

// ─── DEFAULT CONFIG ───────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  offerName: "Lance ton Business Rentable en 90 jours SANS SACRIFIER TES VALEURS",
  niche: "Business & Entrepreneuriat",
  offerPrice: 5000,
  masterclassDate: "2026-03-08T14:30:00",
  masterclassName: "Masterclass Gratuite",
  totalLeadGoal: 400,
  acquisitionDays: 7,
  globalBudget: 4000,
  dailyBudgetStart: 350,
  targetCPL: 6,
  maxAcceptableCPL: 10,
  campaignId: CAMPAIGN_ID,
  adAccountId: AD_ACCOUNT_ID,
  scalingRules: [
    { cplMax: 6,    action: "SCALE_MAX", budgetMultiplier: 2.0, label: "Scale max — CPL idéal",     color: "#10b981" },
    { cplMax: 7,    action: "SCALE_UP",  budgetMultiplier: 1.5, label: "Scale up — Bon CPL",        color: "#34d399" },
    { cplMax: 9,    action: "MAINTAIN",  budgetMultiplier: 1.0, label: "Maintenir — CPL correct",   color: "#f59e0b" },
    { cplMax: 12,   action: "REDUCE",    budgetMultiplier: 0.7, label: "Réduire — CPL élevé",       color: "#ef4444" },
    { cplMax: 9999, action: "PAUSE",     budgetMultiplier: 0,   label: "PAUSE — CPL critique",      color: "#dc2626" }
  ]
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function loadConfig() {
  try { if (fs.existsSync(CONFIG_FILE)) return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) }; } catch(e) {}
  return { ...DEFAULT_CONFIG };
}
function saveConfig(cfg) { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); }
function getLeads(actions) { if (!actions) return 0; const a = actions.find(x => x.action_type === 'lead'); return a ? parseInt(a.value) : 0; }
function getLPV(actions) { if (!actions) return 0; const a = actions.find(x => x.action_type === 'landing_page_view'); return a ? parseInt(a.value) : 0; }
function hoursUntil(d) { return Math.max(0, Math.round((new Date(d) - new Date()) / 3600000)); }
function daysUntil(d) { return Math.max(0, (new Date(d) - new Date()) / 86400000); }

// ─── HTTPS REQUEST (native) ───────────────────────────────────────────────────
function apiGet(path) {
  return new Promise((resolve, reject) => {
    const options = { hostname: API_BASE, path, method: 'GET', headers: { 'Accept': 'application/json' } };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

function apiPost(path, params) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams(params).toString();
    const options = {
      hostname: API_BASE, path, method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = https.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(10000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

function buildParams(obj) {
  return Object.entries(obj).map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

// ─── META API CALLS ───────────────────────────────────────────────────────────
async function getCampaignInsights(datePreset, campaignId) {
  const p = buildParams({ access_token: ACCESS_TOKEN, fields: 'impressions,clicks,spend,reach,cpc,ctr,actions,frequency', date_preset: datePreset });
  const r = await apiGet(`/${API_VERSION}/${campaignId}/insights?${p}`);
  return r?.data?.[0] || null;
}

async function getAdSetsInsights(datePreset, campaignId, adAccountId) {
  const p = buildParams({ access_token: ACCESS_TOKEN, fields: 'adset_id,adset_name,impressions,clicks,spend,reach,cpc,ctr,actions,frequency', level: 'adset', date_preset: datePreset, filtering: JSON.stringify([{field:'campaign.id',operator:'EQUAL',value:campaignId}]) });
  const r = await apiGet(`/${API_VERSION}/${adAccountId}/insights?${p}`);
  return r?.data || [];
}

async function getAdsInsights(datePreset, campaignId, adAccountId) {
  const p = buildParams({ access_token: ACCESS_TOKEN, fields: 'ad_id,ad_name,adset_name,impressions,clicks,spend,reach,cpc,ctr,actions', level: 'ad', date_preset: datePreset, filtering: JSON.stringify([{field:'campaign.id',operator:'EQUAL',value:campaignId}]) });
  const r = await apiGet(`/${API_VERSION}/${adAccountId}/insights?${p}`);
  return r?.data || [];
}

async function getCampaignInfo(campaignId) {
  const p = buildParams({ access_token: ACCESS_TOKEN, fields: 'name,status,daily_budget,objective' });
  return await apiGet(`/${API_VERSION}/${campaignId}?${p}`);
}

async function getInstagramData() {
  const p = buildParams({ access_token: ACCESS_TOKEN, fields: 'id,name,fan_count,instagram_business_account{id,username,followers_count,media_count}' });
  const r = await apiGet(`/${API_VERSION}/me/accounts?${p}`);
  if (!r?.data?.length) return { connected: false };
  const page = r.data[0];
  const ig = page.instagram_business_account;
  let media = [];
  if (ig) {
    const mp = buildParams({ access_token: ACCESS_TOKEN, fields: 'id,caption,media_type,permalink,like_count,comments_count,timestamp', limit: 9 });
    const mr = await apiGet(`/${API_VERSION}/${ig.id}/media?${mp}`);
    media = mr?.data || [];
  }
  return { connected: true, facebook: { id: page.id, name: page.name, fans: page.fan_count }, instagram: ig, recentMedia: media };
}

// ─── CPL TREND (day by day) ───────────────────────────────────────────────────
async function getCplTrend(period) {
  const preset = period === '7' ? 'last_7d' : period === '14' ? 'last_14d' : 'last_30d';
  const p = buildParams({ access_token: ACCESS_TOKEN, fields: 'spend,actions,date_start,date_stop', date_preset: preset, time_increment: 1, level: 'account' });
  const r = await apiGet(`/${API_VERSION}/${AD_ACCOUNT_ID}/insights?${p}`);
  return (r?.data || []).map(d => {
    const leads = getLeads(d.actions);
    const spend = parseFloat(d.spend || 0);
    return { date: d.date_start, spend, leads, cpl: leads > 0 ? parseFloat((spend/leads).toFixed(2)) : 0 };
  });
}

// ─── HOURLY HEATMAP ───────────────────────────────────────────────────────────
async function getHourlyHeatmap() {
  const p = buildParams({ access_token: ACCESS_TOKEN, fields: 'spend,actions,impressions', date_preset: 'last_30d', breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone', level: 'account' });
  const r = await apiGet(`/${API_VERSION}/${AD_ACCOUNT_ID}/insights?${p}`);
  const hours = Array.from({length:24}, (_,i) => ({ hour:i, label:i+'h', spend:0, leads:0, impressions:0, cpl:0 }));
  (r?.data||[]).forEach(d => {
    const hStr = (d.hourly_stats_aggregated_by_advertiser_time_zone||'0:00 - 1:00');
    const h = parseInt(hStr.split(':')[0]);
    if (h >= 0 && h < 24) {
      hours[h].spend += parseFloat(d.spend||0);
      hours[h].leads += getLeads(d.actions);
      hours[h].impressions += parseInt(d.impressions||0);
    }
  });
  hours.forEach(h => { h.cpl = h.leads > 0 ? parseFloat((h.spend/h.leads).toFixed(2)) : 0; h.spend=parseFloat(h.spend.toFixed(2)); });
  return hours;
}

// ─── COMPETITOR ADS — ALL PLATFORMS ──────────────────────────────────────────
async function getMetaAds(q, country) {
  const cc = (country||'FR').toUpperCase();
  try {
    const p = buildParams({ access_token: ACCESS_TOKEN, search_terms: q, ad_type: 'ALL', ad_reached_countries: JSON.stringify([cc]), fields: 'id,ad_creative_bodies,ad_creative_link_titles,ad_creative_link_captions,page_name,ad_delivery_start_time,ad_snapshot_url', limit: 20 });
    const r = await apiGet(`/${API_VERSION}/ads_archive?${p}`);
    const ads = (r?.data||[]).map(ad => ({
      id: ad.id, page: ad.page_name||'Page inconnue',
      title: (ad.ad_creative_link_titles||[])[0]||'',
      body: (ad.ad_creative_bodies||[])[0]||'',
      caption: (ad.ad_creative_link_captions||[])[0]||'',
      date: ad.ad_delivery_start_time||'', url: ad.ad_snapshot_url||''
    }));
    return { platform:'meta', ads, q, country:cc, error:null,
      fallback:`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${cc}&q=${encodeURIComponent(q)}&search_type=keyword_unordered` };
  } catch(e) {
    return { platform:'meta', ads:[], q, country:cc, error:e.message,
      fallback:`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${cc}&q=${encodeURIComponent(q)}&search_type=keyword_unordered` };
  }
}

async function getTikTokAds(q, country) {
  const cc = (country||'FR').toUpperCase();
  try {
    const url = `https://ads.tiktok.com/creative_radar_api/v1/top_ads/v2/list?period=7&limit=12&order_by=vr&keyword=${encodeURIComponent(q)}&country_code=${cc.toLowerCase()}`;
    const resp = await fetch(url, { headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36','Accept':'application/json','Referer':'https://ads.tiktok.com/'}, signal: AbortSignal.timeout(8000) });
    if (!resp.ok) throw new Error('TikTok API '+resp.status);
    const data = await resp.json();
    const ads = (data?.data?.list||[]).map(ad => ({
      id: ad.item_id||ad.video_id, page: ad.brand_name||ad.advertiser_name||'Annonceur',
      title: ad.ad_title||ad.video_info?.desc||'', body: ad.video_info?.desc||ad.ad_title||'',
      thumb: ad.video_info?.cover||'', url: `https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?keyword=${encodeURIComponent(q)}`
    }));
    return { platform:'tiktok', ads, q, country:cc, error:null,
      fallback:`https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?keyword=${encodeURIComponent(q)}` };
  } catch(e) {
    return { platform:'tiktok', ads:[], q, country:cc, error:e.message,
      fallback:`https://ads.tiktok.com/business/creativecenter/inspiration/topads/pc/en?keyword=${encodeURIComponent(q)}` };
  }
}

async function getGoogleAds(q, country) {
  const cc = (country||'FR').toUpperCase();
  return { platform:'google', ads:[], q, country:cc, error:null,
    fallback:`https://adstransparency.google.com/?region=${cc.toLowerCase()}&query=${encodeURIComponent(q)}`,
    note:'Google Ads Transparency Center — recherche publique' };
}

async function getYouTubeAds(q, country) {
  const cc = (country||'FR').toUpperCase();
  return { platform:'youtube', ads:[], q, country:cc, error:null,
    fallback:`https://adstransparency.google.com/?region=${cc.toLowerCase()}&query=${encodeURIComponent(q)}&format=VIDEO`,
    note:'YouTube Ads via Google Transparency Center' };
}

async function getSnapchatAds(q, country) {
  const cc = (country||'FR').toUpperCase();
  return { platform:'snapchat', ads:[], q, country:cc, error:null,
    fallback:`https://library.snap.com/search?query=${encodeURIComponent(q)}`,
    note:'Snap Ad Library — bibliothèque publique' };
}

async function getAllPlatformAds(q, country) {
  const [meta, tiktok, google, youtube, snapchat] = await Promise.allSettled([
    getMetaAds(q, country), getTikTokAds(q, country),
    getGoogleAds(q, country), getYouTubeAds(q, country), getSnapchatAds(q, country)
  ]);
  return {
    meta: meta.status==='fulfilled'?meta.value:{platform:'meta',ads:[],error:meta.reason?.message},
    tiktok: tiktok.status==='fulfilled'?tiktok.value:{platform:'tiktok',ads:[],error:tiktok.reason?.message},
    google: google.status==='fulfilled'?google.value:{platform:'google',ads:[],error:google.reason?.message},
    youtube: youtube.status==='fulfilled'?youtube.value:{platform:'youtube',ads:[],error:youtube.reason?.message},
    snapchat: snapchat.status==='fulfilled'?snapchat.value:{platform:'snapchat',ads:[],error:snapchat.reason?.message}
  };
}

// compat alias
async function getCompetitorAds(q, country) { return getMetaAds(q, country); }

// ─── AI ENGINE ────────────────────────────────────────────────────────────────
function processAdSets(arr) {
  return arr.map(a => ({ id: a.ad_id||a.adset_id, name: a.ad_id ? (a.ad_name||a.adset_name) : (a.adset_name||a.ad_name), adsetName: a.adset_name,
    spend: parseFloat(a.spend||0), leads: getLeads(a.actions), cpl: getLeads(a.actions)>0 ? parseFloat(a.spend)/getLeads(a.actions) : null,
    impressions: parseInt(a.impressions||0), clicks: parseInt(a.clicks||0), ctr: parseFloat(a.ctr||0),
    cpc: parseFloat(a.cpc||0), reach: parseInt(a.reach||0), lpv: getLPV(a.actions) }));
}

function buildAI(cfg, todayRaw, weekRaw, adSetsToday, campaignInfo) {
  const todayLeads = getLeads(todayRaw?.actions), weekLeads = getLeads(weekRaw?.actions);
  const todaySpend = parseFloat(todayRaw?.spend||0), weekSpend = parseFloat(weekRaw?.spend||0);
  const todayCPL = todayLeads > 0 ? todaySpend/todayLeads : null;
  const weekCPL = weekLeads > 0 ? weekSpend/weekLeads : null;
  const dailyBudget = campaignInfo?.daily_budget ? parseInt(campaignInfo.daily_budget)/100 : cfg.dailyBudgetStart;
  const daysLeft = daysUntil(cfg.masterclassDate), hoursLeft = hoursUntil(cfg.masterclassDate);
  const leadsRemaining = Math.max(0, cfg.totalLeadGoal - weekLeads);
  const leadsPerDayNeeded = daysLeft > 0 ? Math.ceil(leadsRemaining/daysLeft) : leadsRemaining;
  const budgetPerDayIdeal = Math.ceil(leadsPerDayNeeded * cfg.targetCPL);
  const budgetPerDayNeeded = Math.ceil(leadsPerDayNeeded * (todayCPL||cfg.targetCPL*1.3));
  const projectedLeads = daysLeft > 0 && todayCPL ? Math.round(dailyBudget/todayCPL*daysLeft+weekLeads) : weekLeads;
  const willHitGoal = projectedLeads >= cfg.totalLeadGoal;
  const lpv = getLPV(todayRaw?.actions);
  const convRate = todayLeads>0&&lpv>0 ? (todayLeads/lpv*100).toFixed(1) : null;
  const lpvRate = lpv>0&&todayRaw?.clicks ? (lpv/parseInt(todayRaw.clicks)*100).toFixed(1) : null;

  // Scaling decision
  let scalingDecision = null;
  if (todayCPL !== null) {
    for (const rule of cfg.scalingRules) {
      if (todayCPL <= rule.cplMax) {
        const nb = rule.budgetMultiplier > 0 ? Math.max(cfg.dailyBudgetStart, Math.round(dailyBudget*rule.budgetMultiplier/50)*50) : 0;
        scalingDecision = { ...rule, currentBudget: dailyBudget, recommendedBudget: nb, change: nb>0?((nb-dailyBudget)/dailyBudget*100).toFixed(0):-100 };
        break;
      }
    }
  }

  // Scaling plan
  const scalingPlan = buildScalingPlan(cfg, weekLeads, weekSpend, todayCPL, dailyBudget);

  // Recommendations
  const recs = buildRecs(cfg, { todayCPL, weekCPL, todayLeads, weekLeads, todaySpend, weekSpend, dailyBudget, leadsRemaining, leadsPerDayNeeded, daysLeft, hoursLeft, willHitGoal, projectedLeads, scalingDecision, adSetsToday });

  // Score
  let score = 50;
  if (todayCPL) { score += Math.min(30, Math.round(cfg.targetCPL/todayCPL*30)); }
  if (leadsPerDayNeeded>0) { score += Math.min(30, Math.round(todayLeads/leadsPerDayNeeded*30)); }
  if (willHitGoal) score += 10;
  score = Math.min(100, Math.max(0, score));

  return { kpis: { todayLeads, weekLeads, todaySpend, weekSpend, dailyBudget, todayCPL, weekCPL, daysLeft: parseFloat(daysLeft.toFixed(1)), hoursLeft, leadsRemaining, leadsPerDayNeeded, budgetPerDayIdeal, budgetPerDayNeeded, projectedLeads, willHitGoal, convRate, lpvRate, lpv, budgetConsumedPct: dailyBudget>0?(todaySpend/dailyBudget*100).toFixed(1):0 }, scalingDecision, scalingPlan, recommendations: recs, score, config: cfg };
}

function buildScalingPlan(cfg, currentLeads, currentSpend, currentCPL, currentBudget) {
  const plan = []; let cumLeads=currentLeads, cumSpend=currentSpend, budget=currentBudget, cpl=currentCPL||cfg.targetCPL*1.4;
  for (let d=0; d<=Math.ceil(daysUntil(cfg.masterclassDate)); d++) {
    const date = new Date(); date.setDate(date.getDate()+d);
    if (date >= new Date(cfg.masterclassDate)) break;
    const decay = Math.max(0.6, 1-d*0.05);
    const expCPL = Math.max(cfg.targetCPL*0.85, cpl*decay);
    const expLeads = Math.round(budget/expCPL);
    cumLeads += expLeads; cumSpend += budget;
    let nextBudget=budget, action='MAINTAIN', color='#f59e0b';
    if(expCPL<=cfg.targetCPL){nextBudget=Math.min(cfg.globalBudget/3,budget*1.5);action='SCALE_UP';color='#10b981';}
    else if(expCPL<=cfg.targetCPL*1.2){nextBudget=budget*1.2;action='SCALE_SOFT';color='#34d399';}
    else if(expCPL>cfg.maxAcceptableCPL){nextBudget=budget*0.7;action='REDUCE';color='#ef4444';}
    plan.push({ day:d+1, date:date.toLocaleDateString('fr-FR',{weekday:'short',day:'numeric',month:'short'}), budget:Math.round(budget), expectedCPL:parseFloat(expCPL.toFixed(2)), expectedLeads:expLeads, cumulativeLeads:cumLeads, cumulativeSpend:Math.round(cumSpend), action, color, hitGoal:cumLeads>=cfg.totalLeadGoal });
    budget=Math.round(nextBudget/50)*50; cpl=expCPL;
  }
  return plan;
}

function buildRecs(cfg, data) {
  const { todayCPL, weekCPL, todayLeads, weekLeads, todaySpend, weekSpend, dailyBudget, leadsRemaining, leadsPerDayNeeded, daysLeft, hoursLeft, willHitGoal, projectedLeads, scalingDecision, adSetsToday } = data;
  const recs = [];
  if (scalingDecision) recs.push({ priority: scalingDecision.action==='PAUSE'?'URGENT':scalingDecision.action==='REDUCE'?'HIGH':'HIGH', emoji: {SCALE_MAX:'🚀',SCALE_UP:'📈',MAINTAIN:'⏸️',REDUCE:'⚠️',PAUSE:'🛑'}[scalingDecision.action]||'📊', title: scalingDecision.label, action: scalingDecision.action!=='PAUSE'?`€${scalingDecision.currentBudget}/j → €${scalingDecision.recommendedBudget}/j (${scalingDecision.change>0?'+':''}${scalingDecision.change}%)`:'Mettre en pause — analyser', reason: `CPL actuel €${todayCPL?.toFixed(2)||'N/A'} | Objectif €${cfg.targetCPL}`, color: scalingDecision.color });
  if (leadsPerDayNeeded>0) recs.push({ priority:'INFO', emoji:'💰', title:`Budget pour ${leadsPerDayNeeded} leads/jour`, action:`Idéal: €${Math.ceil(leadsPerDayNeeded*cfg.targetCPL)}/j (CPL €${cfg.targetCPL}) | Actuel nécessaire: €${Math.ceil(leadsPerDayNeeded*(todayCPL||cfg.targetCPL*1.3))}/j`, reason:`Pour atteindre ${cfg.totalLeadGoal} leads en ${cfg.acquisitionDays} jours`, color:'#6366f1' });
  if (!willHitGoal&&daysLeft>0) recs.push({ priority:'HIGH', emoji:'🎯', title:`Objectif à risque — augmenter le budget`, action:`Monte à €${Math.ceil(leadsRemaining/daysLeft*(todayCPL||cfg.targetCPL))}/j pour atteindre ${cfg.totalLeadGoal} leads`, reason:`À ce rythme ~${projectedLeads} leads (il manque ${cfg.totalLeadGoal-projectedLeads})`, color:'#f59e0b' });
  else if(willHitGoal) recs.push({ priority:'INFO', emoji:'✅', title:'Objectif atteignable au rythme actuel', action:`Maintenir — ~${projectedLeads} leads prévus`, reason:`Objectif ${cfg.totalLeadGoal} leads atteint`, color:'#10b981' });
  if (todayCPL&&weekCPL) { const trend=todayCPL<weekCPL?'↘️ en baisse':'↗️ en hausse'; recs.push({ priority:'INFO', emoji:'📊', title:`Tendance CPL : ${trend}`, action:todayCPL<weekCPL?`Aujourd'hui €${todayCPL.toFixed(2)} vs semaine €${weekCPL.toFixed(2)} — algo s'améliore`:`Aujourd'hui €${todayCPL.toFixed(2)} vs semaine €${weekCPL.toFixed(2)} — surveiller`, reason:`Variation: ${((todayCPL-weekCPL)/weekCPL*100).toFixed(0)}%`, color:todayCPL<weekCPL?'#10b981':'#f59e0b' }); }
  if (adSetsToday) { adSetsToday.filter(a=>a.leads===0&&a.spend>20).forEach(a=>recs.push({ priority:'HIGH', emoji:'⛔', title:`Pause — ${a.name.substring(0,28)}`, action:`€${a.spend.toFixed(2)} dépensés, 0 leads — pause immédiate`, reason:`Seuil: €20 sans conversion`, color:'#ef4444' })); adSetsToday.filter(a=>a.cpl&&a.cpl<cfg.targetCPL).forEach(a=>recs.push({ priority:'HIGH', emoji:'⭐', title:`Top performer — ${a.name.substring(0,22)}`, action:`CPL €${a.cpl.toFixed(2)} — augmente l'allocation`, reason:`${a.leads} leads au meilleur CPL`, color:'#10b981' })); }
  if (hoursLeft<=24&&hoursLeft>0) recs.push({ priority:'URGENT', emoji:'⏰', title:`MOINS DE 24H — Masterclass !`, action:'Couper les pubs à 13h30 — prépare tes relances', reason:`Masterclass ${new Date(cfg.masterclassDate).toLocaleDateString('fr-FR')} à 14h30`, color:'#ef4444' });
  return recs;
}

function buildOptimizationActions(cfg, adSetsToday, adSetsWeek, adsToday, adsWeek) {
  const tCPL = cfg.targetCPL, maxCPL = cfg.maxAcceptableCPL;

  // Score ad sets — priorité sur data semaine (plus fiable), fallback today
  const scored = adSetsWeek.length ? adSetsWeek : adSetsToday;
  const adSetActions = scored.map(a => {
    let action = 'WATCH', color = '#94a3b8', priority = 0;
    if (a.leads === 0 && a.spend > 25) { action = 'PAUSE'; color = '#ef4444'; priority = 4; }
    else if (a.cpl && a.cpl > maxCPL * 1.2) { action = 'PAUSE'; color = '#dc2626'; priority = 4; }
    else if (a.cpl && a.cpl > maxCPL) { action = 'REDUCE'; color = '#ef4444'; priority = 3; }
    else if (a.cpl && a.cpl <= tCPL) { action = 'SCALE'; color = '#10b981'; priority = 1; }
    else if (a.cpl && a.cpl <= tCPL * 1.3) { action = 'MAINTAIN'; color = '#f59e0b'; priority = 2; }
    else { action = 'WATCH'; color = '#64748b'; priority = 0; }
    return { ...a, action, color, priority };
  }).sort((a, b) => b.priority - a.priority);

  // Score créatives — semaine prioritaire
  const adsPool = adsWeek.length ? adsWeek : adsToday;
  const withCPL = adsPool.filter(a => a.cpl != null && a.cpl > 0);
  const avgCPL = withCPL.length ? withCPL.reduce((s, a) => s + a.cpl, 0) / withCPL.length : tCPL;
  const adActions = adsPool.map(a => {
    let badge = 'NORMAL', color = '#94a3b8', score = 50;
    if (a.leads === 0 && a.spend > 12) { badge = 'PAUSE'; color = '#ef4444'; score = 0; }
    else if (a.cpl && a.cpl > maxCPL) { badge = 'PAUSE'; color = '#ef4444'; score = 5; }
    else if (a.cpl && a.cpl <= tCPL) { badge = 'TOP'; color = '#10b981'; score = 100; }
    else if (a.cpl && a.cpl < avgCPL * 0.85) { badge = 'BOOST'; color = '#8b5cf6'; score = 80; }
    else if (a.cpl && a.cpl <= tCPL * 1.4) { badge = 'OK'; color = '#f59e0b'; score = 55; }
    else { badge = 'NORMAL'; color = '#64748b'; score = 30; }
    return { ...a, badge, color, score };
  }).sort((a, b) => b.score - a.score);

  const toPause = adSetActions.filter(a => a.action === 'PAUSE').length;
  const toScale = adSetActions.filter(a => a.action === 'SCALE').length;
  const topCreatives = adActions.filter(a => a.badge === 'TOP').length;
  const pauseCreatives = adActions.filter(a => a.badge === 'PAUSE').length;

  return { adSetActions, adActions, avgCPL: parseFloat(avgCPL.toFixed(2)), summary: { toPause, toScale, topCreatives, pauseCreatives } };
}

function getScripts(cfg) {
  const mc = new Date(cfg.masterclassDate);
  const dateStr = mc.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  const timeStr = mc.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  const price = (cfg.offerPrice||5000).toLocaleString('fr-FR');
  return [
    { id:1, type:'Hook Question', platform:'📘 Facebook · 📸 Insta', badge:'🔥 Top Performer', title:'Pain Point — Valeurs vs Argent', hook:`Tu travailles dur... mais tu sacrifies tes valeurs pour gagner de l'argent ?`, insight:'❤️ Les questions qui touchent l\'identité génèrent 3x plus de commentaires — idéal audience froide Lookalike 1%', script:`Tu travailles dur... mais tu sacrifies tes valeurs pour gagner de l'argent ?\n\nC'est exactement le problème que j'ai résolu pour mes clients.\n\nEn 90 jours, on construit ensemble un business rentable — sans jamais trahir qui tu es vraiment.\n\n✅ Méthode testée sur 100+ entrepreneurs\n✅ Premiers résultats en 30 jours\n✅ Formation complète incluse\n\n👇 Rejoins ma masterclass GRATUITE — ${dateStr} à ${timeStr}\nPlaces limitées — réserve la tienne maintenant` },
    { id:2, type:'Preuve Sociale', platform:'📘 Facebook · 📸 Insta', badge:'💪 Haute Conversion', title:'Témoignage — Résultat chiffré', hook:`"En 90 jours j'ai lancé mon business et généré mes premiers ${price}€"`, insight:'💡 Les témoignages avec chiffres précis convertissent 2x mieux — ajoute une vraie photo client en visuel', script:`"En 90 jours j'ai lancé mon business et généré mes premiers ${price}€"\n\nC'est possible même si tu pars de zéro.\nC'est possible même si tu as peur de ne pas être légitime.\nC'est possible même si tu veux rester fidèle à tes valeurs.\n\n${dateStr} à ${timeStr}, je t'explique exactement COMMENT lors de ma masterclass GRATUITE.\n\n📅 ${dateStr} — ${timeStr}\n👇 Inscris-toi maintenant (places limitées)` },
    { id:3, type:'Problème / Solution', platform:'📘 Facebook · 📺 YouTube', badge:'🎯 Direct', title:'Contre les méthodes classiques', hook:`La plupart des coachs vont te dire de faire comme eux. Problème...`, insight:'🎯 Le contraste "eux vs moi" performe très bien dans la Facebook Ad Library — efficace en vidéo 15-30 sec', script:`La plupart des "coachs business" vont te dire de faire comme eux.\n\nProblème : leurs méthodes ne respectent pas tes valeurs.\n\nMoi je t'aide à construire un business qui te ressemble.\n✅ Rentable ET aligné avec qui tu es\n✅ ${price}€ de CA pour mes meilleurs clients\n✅ En 90 jours chrono\n\nMasterclass gratuite — ${dateStr} à ${timeStr}\n👇 Réserve ta place` },
    { id:4, type:'Urgence FOMO', platform:'📘 Facebook · 📸 Insta', badge:'⏰ Urgence', title:'Dernière chance — Deadline réelle', hook:`Il reste quelques heures. ${dateStr} à ${timeStr}, les places ferment.`, insight:'⏰ L\'urgence avec une vraie date boost les conversions de 40% — ne jamais mentir sur la deadline (perd la confiance)', script:`Il reste quelques heures.\n\n${dateStr} à ${timeStr}, je révèle ma méthode complète.\n\nCette masterclass est 100% GRATUITE.\nMais les places sont limitées.\nDéjà 350+ personnes inscrites.\n\nSi tu hésites encore, voilà ce que tu vas rater :\n→ La méthode exacte pour tes premiers clients\n→ Comment fixer tes prix sans te brader\n→ Le système qui génère du CA en autonomie\n\n👇 Clique et réserve TA place maintenant` },
    { id:5, type:'Chiffre Choc', platform:'📘 Facebook · 📺 YouTube', badge:'📊 Data Viral', title:'Statistique inattendue — Arrêt du scroll', hook:`87% des entrepreneurs abandonnent après 6 mois. Voilà pourquoi.`, insight:'📊 Les chiffres inattendus arrêtent le scroll en 0,3 sec — choisir un % surprenant, pas une évidence. Top sur YouTube pre-roll', script:`87% des entrepreneurs abandonnent après 6 mois.\n\nPas parce qu'ils manquent de talent.\nPas parce qu'ils manquent de travail.\nMais parce qu'ils copient des méthodes qui ne leur ressemblent pas.\n\nJ'ai aidé 100+ entrepreneurs à faire partie des 13% qui réussissent.\nLeur point commun ? Un business ALIGNÉ avec leurs valeurs.\n\nJe t'explique tout — gratuitement — ${dateStr} à ${timeStr}.\n\n👇 Inscris-toi maintenant (moins de 30 secondes)` },
    { id:6, type:'Avant / Après', platform:'📘 Facebook · 📸 Insta', badge:'🔄 Transformation', title:'Avant : galère / Après : liberté', hook:`Avant : 70h/semaine, 0 liberté. Après : business lancé, ${price}€ générés.`, insight:'🔄 Le format Avant/Après est le #1 dans la Facebook Ad Library 2024 — utilise 2 vraies photos contrastées comme visuel', script:`AVANT :\n❌ 70h/semaine sur un projet qui ne me ressemblait pas\n❌ Revenus instables, stress constant\n❌ L'impression de trahir mes valeurs à chaque décision\n\nAPRÈS :\n✅ Business lancé en 90 jours\n✅ Premiers ${price}€ générés\n✅ Clients qui partagent MES valeurs\n✅ Liberté de choisir mes projets\n\nLa différence ? UNE méthode. La mienne.\n\nJe la partage gratuitement le ${dateStr} à ${timeStr}.\n👇 Inscris-toi — c'est gratuit` },
    { id:7, type:'Pattern Interrupt YouTube', platform:'📺 YouTube Ads', badge:'📺 YouTube #1', title:'Hook 5 secondes — Ne pas skipper', hook:`STOP. Si tu skipes cette pub tu vas rater quelque chose d'important pour ton business.`, insight:'📺 YouTube : le viewer peut skipper à 5 sec — l\'hook DOIT créer curiosité ou urgence dès la 1ère seconde. Format idéal : 15-30 sec non-skippable ou bumper 6 sec', script:`[0-5 sec — avant le bouton "Skip"]\nSTOP. Si tu fermes cette vidéo dans 5 secondes, tu vas rater quelque chose d'important.\n\n[5-15 sec]\nJe suis [Ton Nom]. J'ai aidé 100+ entrepreneurs à lancer un business rentable en 90 jours — sans sacrifier leurs valeurs.\n\n[15-25 sec]\nLe ${dateStr} à ${timeStr}, j'organise une masterclass GRATUITE où je révèle ma méthode complète.\nLes places se remplissent vite.\n\n[25-30 sec — CTA]\n👇 Clique sur le lien ci-dessous — réserve ta place en 30 secondes.\nJe t'attends de l'autre côté.` },
    { id:8, type:'Curiosité Gap', platform:'📘 Facebook · 📸 Insta', badge:'🤔 Curiosité', title:'Information incomplète — Le cerveau doit compléter', hook:`Il y a une erreur que font 9 entrepreneurs sur 10 quand ils lancent. La voilà.`, insight:'🤔 Le curiosity gap force le cerveau à vouloir compléter l\'info — plus efficace que le clickbait car spécifique et crédible', script:`Il y a une erreur que font 9 entrepreneurs sur 10 quand ils lancent leur business.\n\nElle leur coûte des mois de travail... et souvent leur santé mentale.\n\nL'erreur ? Ils construisent un business pour ressembler à quelqu'un d'autre.\n\nRésultat : travail acharné, résultats décevants, impression de se trahir.\n\nSolution : construire à partir de TES valeurs, tes forces, ton identité.\n\nC'est exactement ce que j'enseigne en masterclass gratuite.\n📅 ${dateStr} à ${timeStr}\n👇 Réserve ta place maintenant` },
    { id:9, type:'Autorité', platform:'📘 Facebook · 📺 YouTube', badge:'🏆 Crédibilité', title:'Positionnement expert — Preuves sociales chiffrées', hook:`100 entrepreneurs accompagnés. ${price}€ de CA moyen. Voici ma méthode.`, insight:'🏆 L\'autorité chiffrée rassure les audiences froides sceptiques — toujours utiliser des chiffres vérifiables et précis', script:`100 entrepreneurs accompagnés.\n${price}€ de CA moyen généré en 90 jours.\n4,9/5 de satisfaction.\n\nJe ne dis pas ça pour me vanter.\nJe dis ça parce que tu mérites de savoir que ma méthode FONCTIONNE.\n\nElle repose sur un principe simple :\nUn business rentable doit être aligné avec qui tu es — sinon tu l'abandonneras.\n\nLe ${dateStr} à ${timeStr}, je partage tout en masterclass gratuite.\nStratégie. Méthode. Cas concrets. Rien de caché.\n\n👇 Inscris-toi — places limitées` },
    { id:10, type:'Style UGC Authentique', platform:'📸 Insta Reels · 📺 TikTok Ads', badge:'🎥 Authentique', title:'Contenu Organique — Caméra Selfie', hook:`Honnêtement ? Je n'aurais pas cru que ça marche autant. Mais voilà ce qui s'est passé.`, insight:'🎥 Le contenu caméra selfie sans production performe souvent MIEUX que les pubs polies — garder les imperfections pour l\'authenticité (trending 2024)', script:`[Filmer avec son téléphone, cadre naturel, lumière naturelle]\n\nHonnêtement ? Je n'aurais pas cru que ça marcherait.\n\nQuand j'ai commencé à coacher des entrepreneurs, je pensais que la méthode la plus rapide était de copier ce que font les "gurus".\n\nTotalement faux.\n\nCeux qui réussissent le plus vite ? Ceux qui arrêtent de copier et qui construisent selon LEURS valeurs.\n\nEn 90 jours, certains de mes clients génèrent leurs premiers ${price}€.\n\nJe te montre comment dans une masterclass gratuite — ${dateStr} à ${timeStr}.\nLien dans le commentaire épinglé. 👇` }
  ];
}

// ─── HTTP SERVER ──────────────────────────────────────────────────────────────
function readBody(req) {
  return new Promise(resolve => {
    let data = '';
    req.on('data', chunk => data += chunk);
    req.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve({}); } });
  });
}

function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  const types = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.png':'image/png' };
  if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not found'); return; }
  res.writeHead(200, { 'Content-Type': types[ext]||'text/plain' });
  res.end(fs.readFileSync(filePath));
}

function json(res, data, status=200) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;

  // OPTIONS preflight
  if (req.method === 'OPTIONS') { res.writeHead(200, { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST','Access-Control-Allow-Headers':'Content-Type' }); res.end(); return; }

  // ── API ROUTES ──
  if (pathname === '/api/health') {
    return json(res, { status: 'ok', ts: new Date().toISOString() });
  }

  if (pathname === '/api/config' && req.method === 'GET') {
    return json(res, loadConfig());
  }

  if (pathname === '/api/config' && req.method === 'POST') {
    const body = await readBody(req);
    const cfg = { ...loadConfig(), ...body };
    saveConfig(cfg);
    return json(res, { success: true, config: cfg });
  }

  if (pathname === '/api/dashboard' && req.method === 'GET') {
    try {
      const cfg = loadConfig();
      const [todayRaw, weekRaw, adSetsToday, adSetsWeek, adsToday, adsWeek, campInfo] = await Promise.all([
        getCampaignInsights('today', cfg.campaignId),
        getCampaignInsights('this_week_mon_today', cfg.campaignId),
        getAdSetsInsights('today', cfg.campaignId, cfg.adAccountId),
        getAdSetsInsights('this_week_mon_today', cfg.campaignId, cfg.adAccountId),
        getAdsInsights('today', cfg.campaignId, cfg.adAccountId),
        getAdsInsights('this_week_mon_today', cfg.campaignId, cfg.adAccountId),
        getCampaignInfo(cfg.campaignId)
      ]);
      const adSetsTodayProc = processAdSets(adSetsToday);
      const adSetsWeekProc = processAdSets(adSetsWeek);
      const adsTodayProc = processAdSets(adsToday).sort((a,b)=>(a.cpl||999)-(b.cpl||999));
      const adsWeekProc = processAdSets(adsWeek).sort((a,b)=>(a.cpl||999)-(b.cpl||999));
      const ai = buildAI(cfg, todayRaw, weekRaw, adSetsTodayProc, campInfo);
      const optimization = buildOptimizationActions(cfg, adSetsTodayProc, adSetsWeekProc, adsTodayProc, adsWeekProc);
      return json(res, {
        ai,
        today: { ...ai.kpis, impressions: parseInt(todayRaw?.impressions||0), reach: parseInt(todayRaw?.reach||0), ctr: parseFloat(todayRaw?.ctr||0), cpc: parseFloat(todayRaw?.cpc||0) },
        week: { spend: ai.kpis.weekSpend, leads: ai.kpis.weekLeads, cpl: ai.kpis.weekCPL, impressions: parseInt(weekRaw?.impressions||0), clicks: parseInt(weekRaw?.clicks||0), reach: parseInt(weekRaw?.reach||0), ctr: parseFloat(weekRaw?.ctr||0) },
        campaign: { name: campInfo?.name||cfg.offerName, status: campInfo?.status||'ACTIVE', dailyBudget: campInfo?.daily_budget?parseInt(campInfo.daily_budget)/100:cfg.dailyBudgetStart, id: cfg.campaignId },
        adSets: { today: adSetsTodayProc, week: adSetsWeekProc },
        ads: { today: adsTodayProc, week: adsWeekProc },
        optimization,
        scripts: getScripts(cfg),
        lastUpdated: new Date().toISOString()
      });
    } catch(e) { return json(res, { error: e.message }, 500); }
  }

  if (pathname === '/api/budget' && req.method === 'POST') {
    try {
      const { budget } = await readBody(req);
      const cfg = loadConfig();
      const cents = Math.round(parseFloat(budget)*100);
      const r = await apiPost(`/${API_VERSION}/${cfg.campaignId}`, { access_token: ACCESS_TOKEN, daily_budget: cents });
      if (r?.success || r?.id) return json(res, { success: true, message: `✅ Budget mis à jour : €${budget}/jour` });
      return json(res, { success: false, error: JSON.stringify(r) }, 400);
    } catch(e) { return json(res, { error: e.message }, 500); }
  }

  if (pathname === '/api/adset-action' && req.method === 'POST') {
    try {
      const { id, status } = await readBody(req);
      if (!id || !['PAUSED','ACTIVE'].includes(status)) return json(res, { success: false, error: 'id et status requis (PAUSED|ACTIVE)' }, 400);
      const r = await apiPost(`/${API_VERSION}/${id}`, { access_token: ACCESS_TOKEN, status });
      if (r?.success || r?.id) return json(res, { success: true, message: `Ad Set ${status === 'PAUSED' ? '⏸️ mis en pause' : '▶️ activé'}` });
      return json(res, { success: false, error: JSON.stringify(r) }, 400);
    } catch(e) { return json(res, { error: e.message }, 500); }
  }

  if (pathname === '/api/ad-action' && req.method === 'POST') {
    try {
      const { id, status } = await readBody(req);
      if (!id || !['PAUSED','ACTIVE'].includes(status)) return json(res, { success: false, error: 'id et status requis (PAUSED|ACTIVE)' }, 400);
      const r = await apiPost(`/${API_VERSION}/${id}`, { access_token: ACCESS_TOKEN, status });
      if (r?.success || r?.id) return json(res, { success: true, message: `Pub ${status === 'PAUSED' ? '⏸️ mise en pause' : '▶️ activée'}` });
      return json(res, { success: false, error: JSON.stringify(r) }, 400);
    } catch(e) { return json(res, { error: e.message }, 500); }
  }

  if (pathname === '/api/instagram' && req.method === 'GET') {
    return json(res, await getInstagramData());
  }

  if (pathname === '/api/cpl-trend' && req.method === 'GET') {
    try { return json(res, await getCplTrend(parsed.query.period||'30')); }
    catch(e) { return json(res, { error: e.message }, 500); }
  }

  if (pathname === '/api/hourly-heatmap' && req.method === 'GET') {
    try { return json(res, await getHourlyHeatmap()); }
    catch(e) { return json(res, { error: e.message }, 500); }
  }

  if (pathname === '/api/competitor-ads' && req.method === 'GET') {
    try {
      const kw = parsed.query.q||'';
      if (!kw) return json(res, { ads:[], q:'', country:'FR' });
      return json(res, await getMetaAds(kw, parsed.query.country||'FR'));
    } catch(e) { return json(res, { error: e.message }, 500); }
  }

  if (pathname === '/api/competitor-ads-all' && req.method === 'GET') {
    try {
      const kw = parsed.query.q||'';
      if (!kw) return json(res, { meta:{ads:[]},tiktok:{ads:[]},google:{ads:[]},youtube:{ads:[]},snapchat:{ads:[]} });
      return json(res, await getAllPlatformAds(kw, parsed.query.country||'FR'));
    } catch(e) { return json(res, { error: e.message }, 500); }
  }

  // ── AD PREVIEW ──
  if (pathname.startsWith('/api/ad-preview/') && req.method === 'GET') {
    try {
      const adId = pathname.split('/api/ad-preview/')[1]?.split('?')[0];
      if (!adId) return json(res, { error: 'missing ad_id' }, 400);
      const previewUrl = `https://${API_BASE}/${API_VERSION}/${adId}/previews?ad_format=MOBILE_FEED_STANDARD&access_token=${ACCESS_TOKEN}`;
      const data = await new Promise((resolve, reject) => {
        https.get(previewUrl, r => {
          let body = '';
          r.on('data', d => body += d);
          r.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { reject(e); } });
        }).on('error', reject);
      });
      if (data.data && data.data[0]) {
        return json(res, { success: true, iframe: data.data[0].body });
      } else {
        return json(res, { success: false, error: data.error?.message || 'No preview available' });
      }
    } catch(e) { return json(res, { error: e.message }, 500); }
  }

  // ── STATIC FILES ──
  if (pathname === '/' || pathname === '/index.html') {
    return serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
  }
  serveStatic(res, path.join(PUBLIC_DIR, pathname));
});

server.listen(PORT, () => {
  console.log('\n╔═══════════════════════════════════════╗');
  console.log('║   🤖  AI Media Buying Dashboard       ║');
  console.log('╠═══════════════════════════════════════╣');
  console.log(`║   📊  http://localhost:${PORT}           ║`);
  console.log('║   🔄  Refresh auto toutes les 5 min   ║');
  console.log('║   ⏹️   CTRL+C pour arrêter             ║');
  console.log('╚═══════════════════════════════════════╝\n');
});
