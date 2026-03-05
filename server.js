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

// ─── AI ENGINE ────────────────────────────────────────────────────────────────
function processAdSets(arr) {
  return arr.map(a => ({ id: a.adset_id||a.ad_id, name: a.adset_name||a.ad_name, adsetName: a.adset_name,
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

function getScripts(cfg) {
  const mc = new Date(cfg.masterclassDate);
  const dateStr = mc.toLocaleDateString('fr-FR',{weekday:'long',day:'numeric',month:'long'});
  const timeStr = mc.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});
  return [
    { id:1, type:'Hook Vidéo', target:'Lookalike 1% — Froid', badge:'🔥 Recommandé', title:'Question directe — Pain point', hook:`Tu travailles dur... mais tu sacrifies tes valeurs pour gagner de l'argent ?`, script:`Tu travailles dur... mais tu sacrifies tes valeurs pour gagner de l'argent ?\n\nC'est exactement le problème que j'ai résolu pour mes clients.\n\nEn 90 jours, on construit ensemble un business rentable — sans jamais trahir qui tu es vraiment.\n\n✅ Méthode testée sur 100+ entrepreneurs\n✅ Premiers résultats en 30 jours\n✅ Formation complète incluse\n\n👇 Rejoins ma masterclass GRATUITE — ${dateStr} à ${timeStr}\nPlaces limitées — réserve la tienne maintenant` },
    { id:2, type:'Preuve Sociale', target:'Retargeting — Chaud', badge:'💪 Fort', title:'Témoignage — Résultat concret', hook:`"En 90 jours j'ai lancé mon business et généré mes premiers ${(cfg.offerPrice||5000).toLocaleString('fr-FR')}€"`, script:`"En 90 jours j'ai lancé mon business et généré mes premiers ${(cfg.offerPrice||5000).toLocaleString('fr-FR')}€"\n\nC'est possible même si tu pars de zéro.\nC'est possible même si tu as peur de ne pas être légitime.\nC'est possible même si tu veux rester fidèle à tes valeurs.\n\n${dateStr} à ${timeStr}, je t'explique exactement COMMENT lors de ma masterclass GRATUITE.\n\n📅 ${dateStr} — ${timeStr}\n👇 Inscris-toi maintenant (places limitées)` },
    { id:3, type:'Problème / Solution', target:'Lookalike 3% — Tiède', badge:'🎯 Direct', title:'Contre les méthodes classiques', hook:`La plupart des coachs vont te dire de faire comme eux. Problème...`, script:`La plupart des "coachs business" vont te dire de faire comme eux.\n\nProblème : leurs méthodes ne respectent pas tes valeurs.\n\nMoi je t'aide à construire un business qui te ressemble.\n✅ Rentable ET aligné avec qui tu es\n✅ ${(cfg.offerPrice||5000).toLocaleString('fr-FR')}€ de CA pour mes meilleurs clients\n✅ En 90 jours chrono\n\nMasterclass gratuite — ${dateStr} à ${timeStr}\n👇 Réserve ta place` },
    { id:4, type:'Urgence / Scarcité', target:'Retargeting — Visiteurs LP', badge:'⏰ Urgence', title:'Dernière chance', hook:`Il reste quelques heures. ${dateStr} à ${timeStr}, les places ferment.`, script:`Il reste quelques heures.\n\n${dateStr} à ${timeStr}, je révèle ma méthode complète.\n\nCette masterclass est 100% GRATUITE.\nMais les places sont limitées.\nDéjà 350+ personnes inscrites.\n\nSi tu hésites encore, voilà ce que tu vas rater :\n→ La méthode exacte pour tes premiers clients\n→ Comment fixer tes prix sans te brader\n→ Le système qui génère du CA en autonomie\n\n👇 Clique et réserve TA place maintenant` }
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
      const [todayRaw, weekRaw, adSetsToday, adSetsWeek, adsToday, campInfo] = await Promise.all([
        getCampaignInsights('today', cfg.campaignId),
        getCampaignInsights('this_week_mon_today', cfg.campaignId),
        getAdSetsInsights('today', cfg.campaignId, cfg.adAccountId),
        getAdSetsInsights('this_week_mon_today', cfg.campaignId, cfg.adAccountId),
        getAdsInsights('today', cfg.campaignId, cfg.adAccountId),
        getCampaignInfo(cfg.campaignId)
      ]);
      const adSetsTodayProc = processAdSets(adSetsToday);
      const ai = buildAI(cfg, todayRaw, weekRaw, adSetsTodayProc, campInfo);
      return json(res, {
        ai,
        today: { ...ai.kpis, impressions: parseInt(todayRaw?.impressions||0), reach: parseInt(todayRaw?.reach||0), ctr: parseFloat(todayRaw?.ctr||0), cpc: parseFloat(todayRaw?.cpc||0) },
        week: { spend: ai.kpis.weekSpend, leads: ai.kpis.weekLeads, cpl: ai.kpis.weekCPL, impressions: parseInt(weekRaw?.impressions||0), clicks: parseInt(weekRaw?.clicks||0), reach: parseInt(weekRaw?.reach||0), ctr: parseFloat(weekRaw?.ctr||0) },
        campaign: { name: campInfo?.name||cfg.offerName, status: campInfo?.status||'ACTIVE', dailyBudget: campInfo?.daily_budget?parseInt(campInfo.daily_budget)/100:cfg.dailyBudgetStart, id: cfg.campaignId },
        adSets: { today: adSetsTodayProc, week: processAdSets(adSetsWeek) },
        ads: { today: processAdSets(adsToday).sort((a,b)=>(a.cpl||999)-(b.cpl||999)) },
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

  if (pathname === '/api/instagram' && req.method === 'GET') {
    return json(res, await getInstagramData());
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
