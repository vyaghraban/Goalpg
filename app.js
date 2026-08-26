/* ============================================================
   NeetPG Ranker — shared core (data, state, scoring, rewards)
   Loaded by every page before the page's own script.
   ============================================================ */

/* ================= SUBJECT DATA ================= */
const SUBJECT_TABLE = [
  ["Anaesthesia", 168, 31],
  ["Anatomy", 362, 47],
  ["Biochemistry", 324, 33],
  ["Cardiology", 264, 33],
  ["Dermatology", 206, 29],
  ["Endocrinology", 156, 22],
  ["ENT", 285, 20],
  ["FMT", 255, 26],
  ["GIT", 111, 26],
  ["General Pathology", 78, 16],
  ["General Pharmacology", 111, 26],
  ["General Physiology", 82, 12],
  ["Hematology", 229, 26],
  ["Immunology", 73, 18],
  ["Microbiology", 380, 44],
  ["Neurology", 218, 34],
  ["Obstetrics & Gynaecology", 604, 52],
  ["Ophthalmology", 297, 22],
  ["Orthopedics", 282, 36],
  ["Pediatrics", 294, 25],
  ["PSM", 360, 36],
  ["Psychiatry", 173, 19],
  ["Radiology", 252, 35],
  ["Renal", 153, 33],
  ["Respiratory", 171, 35],
  ["Rheumatology", 88, 20],
  ["Surgery", 567, 68],
];
/* ================= STORAGE ================= */
const STORAGE_KEY = "neetpg_ranker_v2";

// Real starting baseline: subjects already watched before starting to use this
// app, plus Surgery now fully watched and ENT partially watched.
const VIDEO_COMPLETE_BASELINE = new Set([
  "Anatomy","Biochemistry","Cardiology","Endocrinology","General Pathology",
  "General Pharmacology","General Physiology","GIT","Hematology","Immunology",
  "Microbiology","Neurology","Pediatrics","PSM","Renal","Respiratory",
  "Rheumatology","FMT","Obstetrics & Gynaecology","Surgery"
]);
const VIDEO_PARTIAL_BASELINE = { "ENT": 150 }; // 2h 30m watched so far

function buildBaselineSubjects(){
  const subjects = {};
  SUBJECT_TABLE.forEach(([name, videoMin, pages]) => {
    let videoDone = 0;
    if (VIDEO_COMPLETE_BASELINE.has(name)) videoDone = videoMin;
    else if (name in VIDEO_PARTIAL_BASELINE) videoDone = VIDEO_PARTIAL_BASELINE[name];
    subjects[name] = { videoTotal: videoMin, pagesTotal: pages, videoDone, pagesDone: 0 };
  });
  return subjects;
}

function seedState(){
  return {
    subjects: buildBaselineSubjects(), logs: [], createdAt: todayStr(), badgesUnlocked: [], questClaims: {},
    lastSeenLevel: 1, rewardsLog: [], hotelStays: [], lastMoodShown: null,
    powerups: { doubleXp: 0 }, chestsClaimed: [], bossDefeats: [], bestStreakEver: 0,
    checkpointsShown: {}, tripRewards: [], dailyKickoffShown: {}, lastGraphAlertShown: null,
    focusSessions: [], focusActive: null, bestFocusSessionEver: 0, weekReportSeen: {}, nineAmShown: {},
    lastDailyRecordDate: null
  };
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw){
      // try migrating from old single-page key
      const old = localStorage.getItem("neetpg_ranker_v1");
      if (old){
        const parsed = JSON.parse(old);
        parsed.lastSeenLevel = parsed.lastSeenLevel || 1;
        parsed.rewardsLog = parsed.rewardsLog || [];
        parsed.hotelStays = parsed.hotelStays || [];
        parsed.lastMoodShown = parsed.lastMoodShown || null;
        saveState(parsed);
        return parsed;
      }
      const s = seedState(); saveState(s); return s;
    }
    const parsed = JSON.parse(raw);
    if (!parsed.subjects || !parsed.logs) throw new Error("bad shape");
    if (!parsed.badgesUnlocked) parsed.badgesUnlocked = [];
    if (!parsed.questClaims) parsed.questClaims = {};
    if (!parsed.lastSeenLevel) parsed.lastSeenLevel = 1;
    if (!parsed.rewardsLog) parsed.rewardsLog = [];
    if (!parsed.hotelStays) parsed.hotelStays = [];
    if (parsed.lastMoodShown === undefined) parsed.lastMoodShown = null;
    if (!parsed.powerups) parsed.powerups = { doubleXp: 0 };
    if (!parsed.chestsClaimed) parsed.chestsClaimed = [];
    if (!parsed.bossDefeats) parsed.bossDefeats = [];
    if (!parsed.bestStreakEver) parsed.bestStreakEver = 0;
    if (!parsed.checkpointsShown) parsed.checkpointsShown = {};
    if (!parsed.tripRewards) parsed.tripRewards = [];
    if (!parsed.dailyKickoffShown) parsed.dailyKickoffShown = {};
    if (!parsed.lastGraphAlertShown) parsed.lastGraphAlertShown = null;
    if (!parsed.focusSessions) parsed.focusSessions = [];
    if (parsed.focusActive === undefined) parsed.focusActive = null;
    if (!parsed.bestFocusSessionEver) parsed.bestFocusSessionEver = 0;
    if (!parsed.weekReportSeen) parsed.weekReportSeen = {};
    if (!parsed.nineAmShown) parsed.nineAmShown = {};
    if (parsed.lastDailyRecordDate === undefined) parsed.lastDailyRecordDate = null;
    // one-time patch: nothing has actually been logged through the app yet, so
    // it's safe to correct the starting baseline to match real watched progress
    // (this never touches subjects once real logs exist).
    if (parsed.subjects && (!parsed.logs || parsed.logs.length === 0)){
      parsed.subjects = buildBaselineSubjects();
    }
    return parsed;
  }catch(e){
    const s = seedState();
    saveState(s);
    return s;
  }
}
function saveState(s){ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }

let state = loadState();

/* ================= DATE HELPERS ================= */
function todayStr(d){ d = d || new Date(); return d.toISOString().slice(0,10); }
function yesterdayStr(){ const d = new Date(); d.setDate(d.getDate()-1); return todayStr(d); }
function daysAgoStr(n){ const d = new Date(); d.setDate(d.getDate()-n); return todayStr(d); }
function nextSaturdayStr(){
  const d = new Date();
  const day = d.getDay(); // 0 Sun .. 6 Sat
  let add = (6 - day + 7) % 7;
  if (add === 0) add = 7; // always the *next* Saturday, not today
  d.setDate(d.getDate() + add);
  return todayStr(d);
}

/* ================= PHASE LOGIC ================= */
function videoPhaseComplete(){
  return Object.values(state.subjects).every(s => s.videoDone >= s.videoTotal);
}
function readingPhaseComplete(){
  return Object.values(state.subjects).every(s => s.pagesDone >= s.pagesTotal);
}
function currentPhase(){
  if (!videoPhaseComplete()) return "video";
  if (!readingPhaseComplete()) return "reading";
  return "mixed";
}

/* ================= SCORING / XP ================= */
const W_VIDEO = 1, W_PAGE = 3, W_MCQ = 2, W_FOCUS = 1;

// Central XP calculator for one log entry — includes bonus XP (from chests)
// and any multiplier (combo streak within a day, double-XP power-up token,
// boss-battle damage is just XP so it uses this too).
function xpForEntry(l){
  let base = 0;
  if (l.type === "video") base = l.amount * W_VIDEO;
  else if (l.type === "reading") base = l.amount * W_PAGE;
  else if (l.type === "mcq") base = l.amount * W_MCQ;
  else if (l.type === "focus") base = l.amount * W_FOCUS;
  base += (l.bonusXp || 0);
  const mult = l.xpMult || 1;
  return base * mult;
}

function scoreForDate(dateStr){
  return state.logs.filter(l => l.date === dateStr).reduce((sum, l) => sum + xpForEntry(l), 0);
}
function totalXP(){
  return state.logs.reduce((sum,l)=> sum + xpForEntry(l), 0);
}
function cumulativeXPuntil(dateStr){
  return state.logs.filter(l => l.date <= dateStr).reduce((sum,l)=> sum + xpForEntry(l), 0);
}

function streakCount(){
  let streak = 0;
  for (let i = 1; i < 60; i++){
    const dayScore = scoreForDate(daysAgoStr(i));
    const prevScore = scoreForDate(daysAgoStr(i+1));
    if (dayScore > prevScore && dayScore > 0) streak++;
    else break;
  }
  return streak;
}

function rankTier(streak){
  if (streak >= 7) return "ultra";
  if (streak >= 3) return "pro";
  return "noob";
}
const RANK_LABEL = { noob: "Noob", pro: "Pro", ultra: "Ultra Pro" };
const RANK_COLOR = { noob: "#7C8BA3", pro: "#00E5A8", ultra: "#FFC857" };

// RPG-style level curve: xpForLevel(n) = XP required to REACH level n (n=1 -> 0)
function xpForLevel(n){ return 60 * (n - 1) * n; }
const LEVEL_TITLES = [
  [1, "Rookie Grinder"], [4, "Focused Scholar"], [7, "Study Warrior"],
  [10, "Exam Slayer"], [14, "Topper Mode"], [18, "PG Legend"], [24, "Rank Machine"]
];
function levelTitle(lvl){
  let t = LEVEL_TITLES[0][1];
  for (const [minLvl, title] of LEVEL_TITLES){ if (lvl >= minLvl) t = title; }
  return t;
}
function levelInfo(){
  const xp = totalXP();
  let lvl = 1;
  while (xpForLevel(lvl+1) <= xp) lvl++;
  const floor = xpForLevel(lvl);
  const ceil = xpForLevel(lvl+1);
  const into = xp - floor;
  const span = Math.max(1, ceil - floor);
  return { level: lvl, xp, into, span, pct: Math.min(100, Math.round((into/span)*100)) };
}

/* ================= COMBO MULTIPLIER (same-day logging streak) ================= */
// The more you log in one sitting today, the bigger your XP multiplier —
// rewards a focused study session instead of one lone entry.
function comboMultiplierForN(n){
  if (n >= 4) return 1.35;
  if (n === 3) return 1.2;
  if (n === 2) return 1.1;
  return 1;
}
function comboCountTodayBeforeNewEntry(){
  return state.logs.filter(l => l.date === todayStr()).length;
}

/* ================= POWER-UPS ================= */
function ensurePowerups(){ if (!state.powerups) state.powerups = { doubleXp: 0 }; return state.powerups; }
function consumeDoubleXpIfAvailable(){
  const p = ensurePowerups();
  if (p.doubleXp > 0){ p.doubleXp--; return true; }
  return false;
}

/* ================= WEEKLY BOSS BATTLE ================= */
// A fresh "boss" spawns every calendar week (Sun-Sat). Logging XP damages it;
// XP needed scales gently with player level so it stays a real challenge.
function weekStartStr(){
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return todayStr(d);
}
function bossMaxHp(){
  const lvl = levelInfo().level;
  return 450 + (lvl - 1) * 55;
}
function weeklyXpEarned(weekStart){
  const start = new Date(weekStart);
  const end = new Date(weekStart); end.setDate(end.getDate() + 7);
  const endStr = todayStr(end);
  return state.logs.filter(l => l.date >= weekStart && l.date < endStr)
    .reduce((s,l)=> s + xpForEntry(l), 0);
}
function bossStatus(){
  const weekStart = weekStartStr();
  const maxHp = bossMaxHp();
  const dmg = weeklyXpEarned(weekStart);
  const hp = Math.max(0, maxHp - dmg);
  const bossNumber = (state.bossDefeats ? state.bossDefeats.length : 0) + 1;
  return { weekStart, maxHp, dmg, hp, defeated: hp <= 0, pct: Math.min(100, Math.round((dmg/maxHp)*100)), bossNumber };
}
// Call after any XP change. Awards a bonus treat the first time a boss's HP
// hits zero in a given week. Returns the reward if one was just granted.
function checkBossDefeatReward(){
  const status = bossStatus();
  if (!status.defeated) return null;
  if (!state.bossDefeats) state.bossDefeats = [];
  if (state.bossDefeats.some(b => b.weekStart === status.weekStart)) return null;
  const reward = REWARD_POOL[Math.floor(Math.random()*REWARD_POOL.length)];
  state.bossDefeats.push({ weekStart: status.weekStart, date: todayStr(), name: reward.name, icon: reward.icon, bossNumber: status.bossNumber });
  saveState(state);
  return reward;
}

/* ================= WEEKLY REPORT (Sat night — "Hafte Ka Vansh") ================= */
const WEEKDAY_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// Sun..Sat dates for the week containing dateStr (defaults to today).
function weekDatesFor(dateStr){
  const base = dateStr ? new Date(dateStr) : new Date();
  const start = new Date(base);
  start.setDate(base.getDate() - base.getDay());
  const days = [];
  for (let i=0;i<7;i++){ const d = new Date(start); d.setDate(start.getDate()+i); days.push(todayStr(d)); }
  return days;
}

// Full report for one week: per-day XP + focus minutes, the week's total,
// the day-of-week crowned "<Day> Vansh" (highest XP day), and an XP-by-type
// split for the pie chart.
function buildWeekReport(dateStr){
  const weekDates = weekDatesFor(dateStr);
  const perDay = weekDates.map((date,i)=>({
    date, day: WEEKDAY_SHORT[i],
    xp: Math.round(scoreForDate(date)),
    focusMin: Math.round(focusMinutesForDate(date)),
  }));
  const totalXp = perDay.reduce((s,d)=> s+d.xp, 0);
  const totalFocusMin = perDay.reduce((s,d)=> s+d.focusMin, 0);
  let best = perDay[0];
  perDay.forEach(d=>{ if (d.xp > best.xp) best = d; });
  const hasAnyData = totalXp > 0;

  const inWeek = l => weekDates.includes(l.date);
  const split = { video: 0, reading: 0, mcq: 0, focus: 0, bonus: 0 };
  state.logs.filter(inWeek).forEach(l=>{
    const key = split.hasOwnProperty(l.type) ? l.type : "bonus";
    split[key] += xpForEntry(l);
  });

  // cumulative running total across the 7 days, for the area/line chart
  let running = 0;
  const cumulative = perDay.map(d => (running += d.xp));

  return { weekDates, perDay, totalXp, totalFocusMin, best, hasAnyData, split, cumulative };
}

// The report is considered "ready to celebrate" from Saturday evening
// onward through the end of the week — used to surface the home-page CTA.
function isWeekReportReady(){
  const d = new Date();
  return d.getDay() === 6 && d.getHours() >= 20;
}
function currentWeekKey(){ return weekDatesFor()[0]; } // Sunday's date, used as a stable key

/* ================= MYSTERY CHESTS (streak milestones) ================= */
const CHEST_REWARDS = [
  { type:"xp", label:"+80 Bonus XP", amount:80 },
  { type:"xp", label:"+150 Bonus XP", amount:150 },
  { type:"powerup", label:"Double XP Token", key:"doubleXp" },
  { type:"powerup", label:"Double XP Token", key:"doubleXp" },
];
function nextUnclaimedChestMilestone(){
  const streak = streakCount();
  const m = Math.floor(streak / 5) * 5;
  if (!state.chestsClaimed) state.chestsClaimed = [];
  if (m > 0 && !state.chestsClaimed.includes(m)) return m;
  return null;
}
function openChest(milestone){
  const reward = CHEST_REWARDS[Math.floor(Math.random()*CHEST_REWARDS.length)];
  if (!state.chestsClaimed) state.chestsClaimed = [];
  state.chestsClaimed.push(milestone);
  if (reward.type === "xp"){
    state.logs.push({ id: Date.now()+"-chest", date: todayStr(), subject:null, phase:null, type:"bonus", amount:0, bonusXp: reward.amount, xpMult:1, ts: Date.now() });
  } else if (reward.type === "powerup" && reward.key === "doubleXp"){
    ensurePowerups().doubleXp += 1;
  }
  saveState(state);
  return reward;
}

/* ================= PERSONAL BESTS ================= */
function bestDayScoreEver(){
  const dates = Array.from(new Set(state.logs.map(l=>l.date)));
  return dates.reduce((m,d)=> Math.max(m, scoreForDate(d)), 0);
}
function checkPersonalBests(){
  if (!state.bestStreakEver) state.bestStreakEver = 0;
  const streak = streakCount();
  let changed = false;
  if (streak > state.bestStreakEver){ state.bestStreakEver = streak; changed = true; }
  if (changed) saveState(state);
  return state.bestStreakEver;
}

// Best day score, ignoring one date — used to check if TODAY just beat every
// previous day (rather than comparing today against itself).
function bestDayScoreExcluding(dateStr){
  const dates = Array.from(new Set(state.logs.map(l=>l.date))).filter(d=> d !== dateStr);
  return dates.reduce((m,d)=> Math.max(m, scoreForDate(d)), 0);
}
// Fires (once per day) the moment today's XP overtakes every previous day —
// a real "new personal best" moment, distinct from just beating yesterday.
function checkDailyRecordReward(){
  const today = todayStr();
  const todayScore = scoreForDate(today);
  const prevBest = bestDayScoreExcluding(today);
  if (todayScore > 0 && prevBest > 0 && todayScore > prevBest && state.lastDailyRecordDate !== today){
    state.lastDailyRecordDate = today;
    saveState(state);
    return { todayScore: Math.round(todayScore), prevBest: Math.round(prevBest) };
  }
  return null;
}

/* ================= FOCUS TIMER (live "padhai clock" stopwatch) ================= */
// A dead-simple continuous-study stopwatch. Start it when you sit down, stop
// it when you get up — each run is saved as one session and also feeds the
// normal XP economy (as its own "focus" log type) so it shows up in streaks,
// levels, the boss battle, etc. state.focusActive survives a page reload /
// app close so a running session is never silently lost.
function ensureFocusSessions(){ if (!state.focusSessions) state.focusSessions = []; return state.focusSessions; }

function isFocusRunning(){ return !!state.focusActive; }

function startFocusSession(){
  if (state.focusActive) return; // already running
  state.focusActive = { startTs: Date.now() };
  saveState(state);
  notifyFocusStart();
}

// Ends the running session (if any), saves it, awards XP, and returns the
// saved session — or null if nothing was running / the sit was under a minute.
function stopFocusSession(){
  if (!state.focusActive) return null;
  const startTs = state.focusActive.startTs;
  const endTs = Date.now();
  state.focusActive = null;
  notifyFocusStop();
  const durationMin = (endTs - startTs) / 60000;
  if (durationMin < 1){ saveState(state); return null; }
  const roundedMin = Math.round(durationMin);
  const entry = { id: Date.now()+"-focus", date: todayStr(new Date(startTs)), startTs, endTs, durationMin: roundedMin };
  ensureFocusSessions().push(entry);

  let newBest = false;
  if (!state.bestFocusSessionEver) state.bestFocusSessionEver = 0;
  if (roundedMin > state.bestFocusSessionEver){ state.bestFocusSessionEver = roundedMin; newBest = true; }

  saveState(state);
  return { ...entry, newBest };
}

// Called from the "log study detail" card shown right after Stop. Turns the
// just-finished session into a real XP log entry (video/reading/mcq, tied to
// the session's actual subject/amount) — this is what feeds subject
// progress AND the today-vs-yesterday Vansh duel. Combo/double-XP tokens
// apply exactly like the manual log form.
function logStudySession(session, detail){
  const { type, subject, amount } = detail;
  if (!amount || amount <= 0) return null;
  const comboN = comboCountTodayBeforeNewEntry() + 1;
  const comboMult = comboMultiplierForN(comboN);
  const usedToken = consumeDoubleXpIfAvailable();
  const xpMult = comboMult * (usedToken ? 2 : 1);

  const logEntry = { id: session.id+"-xp", date: session.date, subject: subject||null, phase: null, type, amount, xpMult, ts: session.startTs };
  state.logs.push(logEntry);

  let justCompleted = false;
  if (subject && (type === "video" || type === "reading")){
    const s = state.subjects[subject];
    if (s){
      if (type === "video"){
        const wasComplete = s.videoDone >= s.videoTotal;
        s.videoDone = Math.min(s.videoTotal, s.videoDone + amount);
        if (!wasComplete && s.videoDone >= s.videoTotal) justCompleted = true;
      } else {
        const wasComplete = s.pagesDone >= s.pagesTotal;
        s.pagesDone = Math.min(s.pagesTotal, s.pagesDone + amount);
        if (!wasComplete && s.pagesDone >= s.pagesTotal) justCompleted = true;
      }
    }
  }
  saveState(state);
  return { justCompleted, usedToken, comboMult, comboN };
}

// Called when the person dismisses the log-detail card without specifying
// what they studied — the session still counts toward today's XP (as plain
// "focus" time) so it isn't wasted, it just doesn't update subject progress.
function logStudySessionAsPlainFocus(session){
  const comboN = comboCountTodayBeforeNewEntry() + 1;
  const comboMult = comboMultiplierForN(comboN);
  const usedToken = consumeDoubleXpIfAvailable();
  const xpMult = comboMult * (usedToken ? 2 : 1);
  state.logs.push({ id: session.id+"-xp", date: session.date, subject:null, phase:null, type:"focus", amount: session.durationMin, xpMult, ts: session.startTs });
  saveState(state);
}

function focusSessionsForDate(dateStr){
  return ensureFocusSessions().filter(s => s.date === dateStr).sort((a,b)=> a.startTs - b.startTs);
}
function focusMinutesForDate(dateStr){
  return focusSessionsForDate(dateStr).reduce((sum,s)=> sum + s.durationMin, 0);
}
// The single longest continuous sitting on a given date — this is the
// "kitne se kitne baje maximum lagatar padhai hui" answer.
function bestSessionForDate(dateStr){
  const list = focusSessionsForDate(dateStr);
  if (!list.length) return null;
  return list.reduce((best,s)=> (!best || s.durationMin > best.durationMin) ? s : best, null);
}
function formatClockTime(ts){
  return new Date(ts).toLocaleTimeString(undefined, { hour:"numeric", minute:"2-digit" });
}
function bestSessionLabel(dateStr){
  const s = bestSessionForDate(dateStr);
  if (!s) return null;
  return { ...s, label: `${formatClockTime(s.startTs)} – ${formatClockTime(s.endTs)}` };
}
// Compares today's best sitting against yesterday's — which "sitting hour"
// (i.e. which continuous block of the day) actually won.
function bestSittingComparison(){
  const today = bestSessionLabel(todayStr());
  const yest = bestSessionLabel(yesterdayStr());
  if (!today && !yest) return null;
  const ahead = (today ? today.durationMin : 0) >= (yest ? yest.durationMin : 0);
  return { today, yest, ahead };
}

// Session-by-session trend for one date: each entry knows how it compares
// to the sitting right before it — this is the "agla sitting hour pichle se
// zyada hua ya nahi" check, applied within the same day.
function sessionTrendForDate(dateStr){
  const list = focusSessionsForDate(dateStr);
  return list.map((s,i)=>{
    const prevMin = i>0 ? list[i-1].durationMin : null;
    const delta = prevMin===null ? null : s.durationMin - prevMin;
    return { ...s, index: i+1, prevMin, delta };
  });
}
// Running total of sitting time, in session order (not clock time) — this is
// what the cumulative trend chart plots, so session 3 today lines up under
// session 3 yesterday regardless of what time each happened.
function cumulativeSessionSeries(dateStr){
  const list = focusSessionsForDate(dateStr);
  let running = 0;
  return list.map(s => (running += s.durationMin));
}
// Overall verdict for today: are sittings, on average, getting longer or
// shorter as the day goes on?
function todaySittingTrend(){
  const trend = sessionTrendForDate(todayStr());
  const deltas = trend.filter(t=>t.delta!==null).map(t=>t.delta);
  if (!deltas.length) return null;
  const increasing = deltas.filter(d=>d>0).length;
  const decreasing = deltas.filter(d=>d<0).length;
  const netTrend = increasing > decreasing ? "increasing" : decreasing > increasing ? "decreasing" : "flat";
  const avgDelta = deltas.reduce((a,b)=>a+b,0)/deltas.length;
  return { increasing, decreasing, netTrend, avgDelta, count: trend.length };
}

/* ================= "TODAY vs YESTERDAY" TIME-FAIR COMPARE ================= */
// Used by the Duel Arena: XP yesterday counted only up to the same clock
// hour as right now, so the comparison is always apples-to-apples.
function xpUpToHour(dateStr, hourExclusive){
  return state.logs.filter(l => l.date === dateStr && new Date(l.ts).getHours() < hourExclusive)
    .reduce((s,l)=> s + xpForEntry(l), 0);
}
// Sends a real OS notification (if permitted) — shared by the daily kickoff,
// the 9am study reminder, and the graph-decline alert.
function sendNotification(title, body){
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try{
    if (navigator.serviceWorker && navigator.serviceWorker.controller){
      navigator.serviceWorker.controller.postMessage({ type: "SHOW_CHECKPOINT", title, body });
    } else {
      new Notification(title, { body, icon: "./icon-192.png" });
    }
  }catch(e){ /* notification not available — in-app feedback still shows */ }
}

// End-of-day final verdict — compares the day that just finished (yesterday,
// from the new day's perspective) against the day before it. This is the
// "poore din ka result" declaration, shown once the day is fully closed.
function dayFinalVerdict(closedDateStr, priorDateStr){
  const closedXp = Math.round(scoreForDate(closedDateStr));
  const priorXp = Math.round(scoreForDate(priorDateStr));
  if (closedXp === 0 && priorXp === 0) return null; // nothing to compare yet
  const ahead = closedXp >= priorXp;
  const diff = Math.abs(closedXp - priorXp);
  const title = ahead ? "Kal ka Vansh JEETA! 🏆" : "Kal ka Vansh HAARA 😔";
  const body = ahead
    ? `Kal ka final score: ${closedXp} XP — usse pehle wale din se ${diff} XP zyada. Solid din tha!`
    : `Kal ka final score: ${closedXp} XP — usse pehle wale din se ${diff} XP kam. Aaj wapas jeetne ka mauka hai!`;
  return { title, body, ahead, closedXp, priorXp };
}

// "Naya din shuru!" kickoff — fires once, within the 12:01–12:59 AM window
// each day. First declares the FINAL result of the day that just ended, then
// (after a short delay) announces yesterday's total as today's target — this
// is the "next day 12:01 se chalu" trigger.
function dailyKickoffPending(){
  const now = new Date();
  if (now.getHours() !== 0) return false;
  if (!state.dailyKickoffShown) state.dailyKickoffShown = {};
  return !state.dailyKickoffShown[todayStr()];
}
function runDailyKickoffIfPending(){
  if (!dailyKickoffPending()) return false;
  if (!state.dailyKickoffShown) state.dailyKickoffShown = {};
  const key = todayStr();
  state.dailyKickoffShown[key] = true;
  Object.keys(state.dailyKickoffShown).forEach(k=>{ if (k !== key) delete state.dailyKickoffShown[k]; });
  saveState(state);

  const verdict = dayFinalVerdict(yesterdayStr(), daysAgoStr(2));
  const fireKickoff = ()=>{
    const yestTotal = Math.round(scoreForDate(yesterdayStr()));
    const title = "Naye din ki jung shuru! ⚔️";
    const body = yestTotal > 0
      ? `Kal wale Vansh ne ${yestTotal} XP banaya tha. Naya Vansh, ready ho jao usse harane ke liye!`
      : `Aaj se ek naya din, ek nayi fight. Chalo shuru karte hain!`;
    sendNotification(title, body);
    toast(body);
    if (document.getElementById("moodOverlay")) showRevealOverlay("up", title, body, "⚔️");
  };

  if (verdict){
    sendNotification(verdict.title, verdict.body);
    toast(verdict.body);
    if (document.getElementById("moodOverlay")){
      showRevealOverlay(verdict.ahead ? "up" : "down", verdict.title, verdict.body, verdict.ahead ? "🏆" : "🌙");
    }
    setTimeout(fireKickoff, 3000); // let the verdict card finish before the kickoff one shows
  } else {
    fireKickoff();
  }
  return true;
}

/* ================= 9 AM "START STUDY" REMINDER ================= */
// Fires once per day, any time from 9:00 AM to 9:59 AM, nudging the person
// to open the Padhai Clock and start their first sitting of the day.
function nineAmReminderPending(){
  const now = new Date();
  if (now.getHours() !== 9) return false;
  if (!state.nineAmShown) state.nineAmShown = {};
  return !state.nineAmShown[todayStr()];
}
function runNineAmReminderIfPending(){
  if (!nineAmReminderPending()) return false;
  if (!state.nineAmShown) state.nineAmShown = {};
  const key = todayStr();
  state.nineAmShown[key] = true;
  Object.keys(state.nineAmShown).forEach(k=>{ if (k !== key) delete state.nineAmShown[k]; });
  saveState(state);

  const title = "9 baj gaye — padhai shuru! ⏰";
  const alreadyStudying = isFocusRunning() || focusMinutesForDate(todayStr()) > 0 || scoreForDate(todayStr()) > 0;
  const body = alreadyStudying
    ? "Achha chal raha hai — Padhai Clock khol ke agli sitting bhi start kardo!"
    : "Aaj ka pehla session shuru karne ka time ho gaya. Padhai Clock kholo aur Start dabao!";
  sendNotification(title, body);
  toast(body);
  if (document.getElementById("moodOverlay")) showRevealOverlay("up", title, body, "⏰");
  return true;
}

/* ================= 2-HOURLY "KEEP GOING" CHECK-IN ================= */
// Nudges every ~2 hours through the study day (not just once, like the 9am
// reminder) — reuses the existing state.checkpointsShown map so each hour
// mark only fires once per day.
const CHECKPOINT_HOURS = [10, 12, 14, 16, 18, 20, 22];
function checkpointReminderPending(){
  const hour = new Date().getHours();
  if (!CHECKPOINT_HOURS.includes(hour)) return false;
  if (!state.checkpointsShown) state.checkpointsShown = {};
  return !state.checkpointsShown[`${todayStr()}-${hour}`];
}
function runCheckpointReminderIfPending(){
  if (!checkpointReminderPending()) return false;
  if (!state.checkpointsShown) state.checkpointsShown = {};
  const hour = new Date().getHours();
  const key = `${todayStr()}-${hour}`;
  state.checkpointsShown[key] = true;
  // keep only today's marks so this map never grows unbounded
  Object.keys(state.checkpointsShown).forEach(k=>{ if (!k.startsWith(todayStr())) delete state.checkpointsShown[k]; });
  saveState(state);

  const todayScore = Math.round(scoreForDate(todayStr()));
  const title = "2-hour check-in ⏰";
  const nudgeLines = [
    `Ab tak ${todayScore} XP — ek aur session daal do 📖`,
    `${todayScore} XP ho gaya — momentum mat todo, chalo ek aur push!`,
    `Padhai Clock khol ke agla session start karo — abhi ${todayScore} XP hai.`,
  ];
  const body = todayScore > 0
    ? nudgeLines[Math.floor(hour/2) % nudgeLines.length]
    : "Abhi tak kuch log nahi hua — chalo ek session shuru karte hain!";
  sendNotification(title, body);
  toast(body);
  if (document.getElementById("moodOverlay")) showRevealOverlay("up", title, body, "⏰");
  return true;
}

// Called on every page load, every few minutes while the app is open, and on
// tab-focus — runs the once-a-day checks (midnight day-close/kickoff, and the
// 9am start-study nudge). Note: true delivery when the app/tab is fully
// closed depends on the platform (Periodic Background Sync only works on
// some installed Android PWAs) — this always catches up correctly the
// moment the app is opened or brought to the foreground.
function runDailyRemindersCheck(){
  if (runDailyKickoffIfPending()) return;
  if (runNineAmReminderIfPending()) return;
  runCheckpointReminderIfPending();
}

/* ================= GRAPH DECLINE ALERT ================= */
// Compares the average of the last 3 days against the 3 days before that —
// if today's pace has dropped 20%+, nudge once per day (not every visit).
function graphTrendStatus(){
  const recentDays = [0,1,2].map(i => scoreForDate(daysAgoStr(i)));
  const priorDays = [3,4,5].map(i => scoreForDate(daysAgoStr(i)));
  const recentAvg = recentDays.reduce((a,b)=>a+b,0)/3;
  const priorAvg = priorDays.reduce((a,b)=>a+b,0)/3;
  if (priorAvg <= 0) return null; // not enough history yet
  const dropPct = (priorAvg - recentAvg) / priorAvg;
  return { recentAvg, priorAvg, dropPct, declining: dropPct >= 0.2 };
}
function runGraphDeclineCheckIfDue(){
  const today = todayStr();
  if (state.lastGraphAlertShown === today) return null;
  const status = graphTrendStatus();
  if (!status || !status.declining) return null;
  state.lastGraphAlertShown = today;
  saveState(state);
  const pct = Math.round(status.dropPct * 100);
  const title = "Graph neeche ja raha hai 📉";
  const body = `Last 3 din ka average pichle 3 din se ${pct}% kam hai. Ek strong session se wapas pace pakdo!`;
  sendNotification(title, body);
  toast(body);
  if (document.getElementById("moodOverlay")) showRevealOverlay("down", title, body, "📉");
  return status;
}

/* ================= DAILY MOTIVATIONAL QUOTE ================= */
// A short Hinglish line that changes once a day (seeded by date so it's
// stable through the day, not random every render).
const MOTIVATION_QUOTES = [
  "Aaj ka 1 ghanta, kal ke 10 marks.",
  "Jitna aaj bachaoge time, utna kal pachtaoge.",
  "Rank wahi leke jaate hain jo roz thoda aage nikalte hain.",
  "Chhutti dimaag ko chahiye, streak ko nahi.",
  "Kal wale tum se aaj wale tum better ho sakte ho — bas ek log kar do.",
  "Consistency > Intensity. Roz thoda, hamesha.",
  "Jo aaj skip kiya, wahi kal do guna karna padega.",
  "Har MCQ ek kadam paas exam ke.",
  "Tumhara competition abhi bhi padh raha hai — tum bhi chalo.",
  "Best time to start tha kal. Doosra best time hai abhi.",
  "Thoda thak gaye ho? Toppers bhi thakte hain — bas rukte nahi.",
  "Aaj ka effort, kal ka rank."
];
function todaysQuote(){
  const d = todayStr();
  let hash = 0;
  for (let i=0;i<d.length;i++) hash = (hash*31 + d.charCodeAt(i)) >>> 0;
  return MOTIVATION_QUOTES[hash % MOTIVATION_QUOTES.length];
}

/* ================= 10-DAY STREAK TRIP REWARD ================= */
// Every 10-day streak milestone (10, 20, 30...) — where each day genuinely
// beat the one before it — unlocks a bigger reward: a 4-5 day trip.
const STREAK_TRIP_INTERVAL = 10;
function nextUnclaimedTripMilestone(){
  const streak = streakCount();
  const m = Math.floor(streak / STREAK_TRIP_INTERVAL) * STREAK_TRIP_INTERVAL;
  if (!state.tripRewards) state.tripRewards = [];
  const claimedMilestones = state.tripRewards.map(t => t.milestone);
  if (m > 0 && !claimedMilestones.includes(m)) return m;
  return null;
}
function grantTripReward(milestone){
  if (!state.tripRewards) state.tripRewards = [];
  const entry = { milestone, date: todayStr(), claimed: false };
  state.tripRewards.push(entry);
  saveState(state);
  return entry;
}

/* ================= REWARDS (level-up treats + weekend hotel stay) ================= */
const REWARD_POOL = [
  { icon:"🍕", name:"Pizza Party" },
  { icon:"🍔", name:"Burger Blowout" },
  { icon:"🍦", name:"Ice Cream Treat" },
  { icon:"🍰", name:"Dessert Cafe Visit" },
  { icon:"🍜", name:"Favourite Restaurant Meal" },
  { icon:"🥤", name:"Milkshake Treat" },
  { icon:"🍗", name:"Biryani Feast" },
  { icon:"🧁", name:"Cake Celebration" },
];
function rewardForLevel(level){
  return REWARD_POOL[(level-2) % REWARD_POOL.length]; // level 2 = first reward
}
// Call after any XP change. Awards a food reward + a hotel-stay-next-Saturday
// entry for every level gained since we last checked. Returns newly awarded items.
function checkLevelRewards(){
  const li = levelInfo();
  const newly = { foods: [], hotels: [] };
  if (!state.lastSeenLevel) state.lastSeenLevel = 1;
  while (state.lastSeenLevel < li.level){
    state.lastSeenLevel++;
    const lvl = state.lastSeenLevel;
    const food = rewardForLevel(lvl);
    const foodEntry = { level: lvl, icon: food.icon, name: food.name, date: todayStr(), claimed:false };
    state.rewardsLog.push(foodEntry);
    newly.foods.push(foodEntry);
    const hotelEntry = { level: lvl, weekend: nextSaturdayStr(), claimed:false };
    state.hotelStays.push(hotelEntry);
    newly.hotels.push(hotelEntry);
  }
  if (newly.foods.length) saveState(state);
  return newly;
}

/* ================= SECRET BADGE HELPERS ================= */
// Small helpers that power the hidden/mystery badges below — kept separate
// so they read cleanly next to the BADGES definitions that use them.
function hasLogInHourRange(fromH, toH){
  return state.logs.some(l => {
    if (!l.ts) return false;
    const h = new Date(l.ts).getHours();
    return h >= fromH && h < toH;
  });
}
function maxLogsInOneDay(){
  const counts = {};
  state.logs.forEach(l => { counts[l.date] = (counts[l.date] || 0) + 1; });
  return Math.max(0, ...Object.values(counts));
}
function loggedBothWeekendDays(){
  const dates = new Set(state.logs.map(l => l.date));
  for (const d of dates){
    if (new Date(d + "T00:00:00").getDay() === 6){ // Saturday
      const nextDay = new Date(d + "T00:00:00");
      nextDay.setDate(nextDay.getDate() + 1);
      if (dates.has(todayStr(nextDay))) return true;
    }
  }
  return false;
}
function comebackAfterGap(){
  // True once there's been at least one missed calendar day somewhere in the
  // history, AND the current streak has since rebuilt to 5+ — a redemption arc.
  const dates = Array.from(new Set(state.logs.map(l => l.date))).sort();
  if (dates.length < 2 || streakCount() < 5) return false;
  for (let i = 1; i < dates.length; i++){
    const gapDays = Math.round((new Date(dates[i] + "T00:00:00") - new Date(dates[i-1] + "T00:00:00")) / 86400000);
    if (gapDays > 1) return true;
  }
  return false;
}

/* ================= BADGES ================= */
const BADGES = [
  { id:"first_blood", name:"First Blood", desc:"Complete your first subject", icon:"🩸",
    check: ()=> Object.values(state.subjects).some(s => s.videoDone>=s.videoTotal || s.pagesDone>=s.pagesTotal) },
  { id:"video_cleared", name:"Video Cleared", desc:"Finish the Video Phase", icon:"🎬", check: videoPhaseComplete },
  { id:"reading_cleared", name:"Reading Cleared", desc:"Finish the Reading Phase", icon:"📖", check: readingPhaseComplete },
  { id:"mixed_unlocked", name:"Mixed Unlocked", desc:"Reach the Mixed Phase", icon:"🎯", check: ()=> currentPhase()==="mixed" },
  { id:"streak_3", name:"On Fire", desc:"Hit a 3-day streak", icon:"🔥", check: ()=> streakCount()>=3 },
  { id:"streak_7", name:"Unstoppable", desc:"Hit a 7-day streak", icon:"⚡", check: ()=> streakCount()>=7 },
  { id:"streak_14", name:"Legend", desc:"Hit a 14-day streak", icon:"👑", check: ()=> streakCount()>=14 },
  { id:"mcq_100", name:"Quiz Whiz", desc:"Solve 100 MCQs lifetime", icon:"🧠",
    check: ()=> state.logs.filter(l=>l.type==="mcq").reduce((a,l)=>a+l.amount,0) >= 100 },
  { id:"pages_500", name:"Bookworm", desc:"Read 500 pages lifetime", icon:"📚",
    check: ()=> state.logs.filter(l=>l.type==="reading").reduce((a,l)=>a+l.amount,0) >= 500 },
  { id:"perfectionist", name:"Perfectionist", desc:"100% video & reading, every subject", icon:"💎",
    check: ()=> videoPhaseComplete() && readingPhaseComplete() },
  { id:"level_5", name:"Level 5 Club", desc:"Reach level 5", icon:"🥉", check: ()=> levelInfo().level>=5 },
  { id:"level_10", name:"Level 10 Club", desc:"Reach level 10", icon:"🥈", check: ()=> levelInfo().level>=10 },
  { id:"level_20", name:"Level 20 Club", desc:"Reach level 20", icon:"🥇", check: ()=> levelInfo().level>=20 },

  // ---- Secret / mystery badges — hidden as "???" in the rewards list until unlocked ----
  { id:"night_owl", name:"Night Owl", desc:"Logged something between 12 AM–4 AM", icon:"🦉",
    secret:true, hint:"Kabhi raat gaye tak jaag ke padhte ho?", check: ()=> hasLogInHourRange(0,4) },
  { id:"early_bird", name:"Early Bird", desc:"Logged something between 4 AM–6 AM", icon:"🌅",
    secret:true, hint:"Subah subah utho toh kuch milega...", check: ()=> hasLogInHourRange(4,6) },
  { id:"century_day", name:"Century Club", desc:"Scored 100+ XP in a single day", icon:"💯",
    secret:true, hint:"Ek din mein full grind maaro.", check: ()=> bestDayScoreEver() >= 100 },
  { id:"combo_master", name:"Combo Master", desc:"Logged 5+ entries in a single day", icon:"⚡",
    secret:true, hint:"Ek hi din mein baar baar log karo.", check: ()=> maxLogsInOneDay() >= 5 },
  { id:"weekend_warrior", name:"Weekend Warrior", desc:"Logged on both Saturday and Sunday", icon:"🏋️",
    secret:true, hint:"Weekend pe bhi chhutti mat lo.", check: loggedBothWeekendDays },
  { id:"phoenix", name:"Phoenix Rising", desc:"Rebuilt a 5-day streak after missing a day", icon:"🔥",
    secret:true, hint:"Gir ke wapas uthna seekho.", check: comebackAfterGap },
];

function computeUnlockedBadges(){
  const unlockedSet = new Set(state.badgesUnlocked || []);
  const newly = [];
  BADGES.forEach(b=>{
    if (b.check() && !unlockedSet.has(b.id)){ unlockedSet.add(b.id); newly.push(b); }
  });
  if (newly.length){
    state.badgesUnlocked = Array.from(unlockedSet);
    saveState(state);
  }
  return { unlockedSet, newly };
}

/* ================= DAILY QUESTS ================= */
const QUEST_DEFS = [
  { id:"log3", label:"Log 3 entries today", target:3, progress: ()=> state.logs.filter(l=>l.date===todayStr()).length },
  { id:"beatYesterday", label:"Beat yesterday's score", target:1, progress: ()=> scoreForDate(todayStr()) > scoreForDate(yesterdayStr()) ? 1 : 0 },
  { id:"completeSubject", label:"Push a subject to 100% today", target:1, progress: ()=>
      state.logs.some(l => l.date===todayStr() && l.subject && (()=>{
        const s = state.subjects[l.subject]; if (!s) return false;
        if (l.type==="video") return s.videoDone >= s.videoTotal;
        if (l.type==="reading") return s.pagesDone >= s.pagesTotal;
        return false;
      })()) ? 1 : 0 },
];

function computeQuestStatus(){
  const today = todayStr();
  const claimed = new Set((state.questClaims[today]) || []);
  let anyNew = false;
  const rows = QUEST_DEFS.map(q=>{
    const val = Math.min(q.target, q.progress());
    const done = val >= q.target;
    if (done && !claimed.has(q.id)){ claimed.add(q.id); anyNew = true; }
    return { ...q, val, done };
  });
  if (anyNew){
    state.questClaims[today] = Array.from(claimed);
    const dates = Object.keys(state.questClaims).sort();
    while (dates.length > 6) delete state.questClaims[dates.shift()];
    saveState(state);
  }
  return { rows, anyNew };
}

/* ================= EFFECTS: vibrate / sound / confetti / toast ================= */
function vibrate(pattern){ if (navigator.vibrate) navigator.vibrate(pattern); }

let audioCtx;
function tone(freq, dur, type, delay){
  try{
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const start = audioCtx.currentTime + (delay||0);
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.15, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }catch(e){ /* audio not available */ }
}
function playSave(){ tone(660, 0.12, "sine"); }
function playMilestone(){ tone(523,0.1); tone(784,0.16,"sine",0.09); }
function playRankUp(){ tone(523,0.09); tone(659,0.09,"sine",0.09); tone(880,0.22,"sine",0.18); }
// cheerful ascending major arpeggio — "today beat yesterday"
function playHappyTune(){
  [523.25,659.25,783.99,1046.5].forEach((f,i)=> tone(f, 0.16, "triangle", i*0.11));
}
// gentle descending minor phrase — "today behind yesterday" (soft, not harsh)
function playSadTune(){
  [440,392,329.63].forEach((f,i)=> tone(f, 0.28, "sine", i*0.19));
}
// bright shimmering arpeggio — chest opening
function playChestTune(){
  [392,523.25,659.25,783.99,1046.5].forEach((f,i)=> tone(f, 0.14, "triangle", i*0.06));
}
// big triumphant chord stab — boss defeated
function playBossDefeatTune(){
  [261.63,329.63,392,523.25].forEach((f,i)=> tone(f, 0.32, "sawtooth", i*0.02));
  tone(1046.5, 0.4, "triangle", 0.18);
}
// low warning thud — combo tick (subtle, used when combo increases)
function playComboTick(freqMul){
  tone(440 * (freqMul||1), 0.09, "square");
}

function toast(msg){
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=> el.classList.remove("show"), 2200);
}

function confettiBurst(n, colorsOverride){
  const host = document.getElementById("confetti");
  if (!host) return;
  const colors = colorsOverride || ["#00E5A8","#FFC857","#7C6CFF","#FF6B4A"];
  for (let i=0;i<(n||24);i++){
    const bit = document.createElement("div");
    bit.className = "confetti-bit";
    bit.style.left = (Math.random()*100) + "vw";
    bit.style.background = colors[i % colors.length];
    bit.style.animationDuration = (1.4 + Math.random()*1.2) + "s";
    bit.style.transform = `rotate(${Math.random()*360}deg)`;
    host.appendChild(bit);
    setTimeout(()=> bit.remove(), 2800);
  }
}

// Floating emoji burst used for the "beat yesterday / fell behind" mood animation
function emojiBurst(emojis, count){
  const host = document.getElementById("confetti");
  if (!host) return;
  for (let i=0;i<(count||14);i++){
    const bit = document.createElement("div");
    bit.className = "emoji-bit";
    bit.textContent = emojis[Math.floor(Math.random()*emojis.length)];
    bit.style.left = (10 + Math.random()*80) + "vw";
    bit.style.fontSize = (20 + Math.random()*22) + "px";
    bit.style.animationDuration = (1.8 + Math.random()*1.4) + "s";
    bit.style.animationDelay = (Math.random()*0.4) + "s";
    host.appendChild(bit);
    setTimeout(()=> bit.remove(), 3600);
  }
}

/* ================= MOOD CHECK (today vs yesterday, once per day) ================= */
// Shows a fun/sad full-screen-ish animation once per calendar day on the dashboard.
function runMoodCheckIfDue(){
  const today = todayStr();
  if (state.lastMoodShown === today) return null;
  const y = yesterdayStr();
  const hasYesterdayData = state.logs.some(l=>l.date===y);
  if (!hasYesterdayData) return null; // nothing to compare on day 1
  const todayScore = scoreForDate(today);
  const yestScore = scoreForDate(y);
  if (todayScore === 0) return null; // wait till they log something today
  state.lastMoodShown = today;
  saveState(state);
  if (todayScore > yestScore) return "happy";
  if (todayScore < yestScore) return "sad";
  return null;
}

function showMoodAnimation(mood){
  const overlay = document.getElementById("moodOverlay");
  if (!overlay) return;
  if (mood === "happy"){
    overlay.innerHTML = `<div class="mood-card happy"><div class="mood-emoji">🚀</div><div class="mood-title">Kal se aage nikal gaye!</div><div class="mood-sub">Beat yesterday's score — keep this momentum 🔥</div></div>`;
    overlay.classList.add("show");
    emojiBurst(["🎉","😄","🚀","✨","🔥"], 18);
    playHappyTune();
    vibrate([40,30,40,30,90]);
  } else {
    overlay.innerHTML = `<div class="mood-card sad"><div class="mood-emoji">😔</div><div class="mood-title">Aaj kal se thoda peeche ho</div><div class="mood-sub">Koi baat nahi — ek chhota sa push aur aap wapas aage!</div></div>`;
    overlay.classList.add("show");
    emojiBurst(["💧","😢"], 8);
    playSadTune();
    vibrate([120]);
  }
  setTimeout(()=>{ overlay.classList.remove("show"); }, 2600);
  overlay.addEventListener("click", ()=> overlay.classList.remove("show"), { once:true });
}

/* ================= GENERIC REVEAL OVERLAY (chest / boss / claimed reward) ================= */
// Shared across pages — any page with a #moodOverlay div can call this for a
// fun full-card "take a reward" style reveal instead of a plain status swap.
function showRevealOverlay(kind, title, sub, customEmoji){
  const overlay = document.getElementById("moodOverlay");
  if (!overlay) return;
  const emojiMap = { chest:"🎁", boss:"🏆", gift:"🎉", up:"🚀", down:"⚡", trip:"🧳" };
  const emoji = customEmoji || emojiMap[kind] || "✨";
  overlay.innerHTML = `<div class="mood-card ${kind}"><div class="mood-emoji">${emoji}</div><div class="mood-title">${escapeHtml(title)}</div><div class="mood-sub">${escapeHtml(sub)}</div></div>`;
  overlay.classList.add("show");
  if (kind === "boss") playBossDefeatTune();
  else if (kind === "chest") playChestTune();
  else if (kind === "trip") playBossDefeatTune();
  else if (kind === "up") playComboTick(1.6);
  else if (kind === "down") tone(340, 0.24, "sine");
  else if (kind === "secretbadge") playRankUp();
  else if (kind === "record") playBossDefeatTune();
  else playMilestone();
  setTimeout(()=> overlay.classList.remove("show"), 2600);
  overlay.addEventListener("click", ()=> overlay.classList.remove("show"), { once:true });
}

/* ================= BADGE UNLOCK CELEBRATION ================= */
// Newly-unlocked badges (from computeUnlockedBadges) get a proper reveal
// instead of silently appearing in the rewards list — secret badges get an
// extra "found it" treatment since discovering one is the whole point.
function celebrateNewBadges(newly, startDelay){
  if (!newly || !newly.length) return;
  const base = startDelay || 0;
  newly.forEach((b, i)=>{
    setTimeout(()=>{
      const title = b.secret ? "Secret Badge Found! 🕵️" : "Badge Unlocked! 🏅";
      showRevealOverlay(b.secret ? "secretbadge" : "badge", title, `${b.name} — ${b.desc}`, b.icon);
      confettiBurst(b.secret ? 44 : 26, b.secret ? ["#7C6CFF","#FFC857","#00E5A8"] : ["#FFC857","#7C6CFF"]);
      vibrate(b.secret ? [50,30,50,30,50,30,160] : [40,25,100]);
    }, base + i * 2800);
  });
}

/* ================= MISC ================= */
function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function cssEscape(s){ return String(s).replace(/"/g,'\\"'); }
function fmtMin(min){
  min = Math.round(min);
  const h = Math.floor(min/60), m = min%60;
  return h>0 ? `${h}h ${m}m` : `${m}m`;
}

/* ================= BACKGROUND: glass orbs (no dots) ================= */
function initGlassBg(){
  // purely CSS-driven now (see style.css .glass-bg); nothing to init in JS.
}

/* ================= NOTIFICATIONS / SW ================= */
function computeNotificationBody(){
  if (isFocusRunning()){
    const elapsedMin = Math.round((Date.now() - state.focusActive.startTs)/60000);
    return `Padhai chal rahi hai — ${fmtMin(elapsedMin)} ho gaye is sitting mein. Keep going!`;
  }
  const phase = currentPhase();
  let subjLine = "";
  if (phase === "video" || phase === "reading"){
    const key = phase === "video" ? "videoDone" : "pagesDone";
    const totalKey = phase === "video" ? "videoTotal" : "pagesTotal";
    const remaining = Object.entries(state.subjects)
      .map(([name,s])=>({name, left: s[totalKey]-s[key]}))
      .filter(r=>r.left>0)
      .sort((a,b)=>a.left-b.left)[0];
    if (remaining){
      subjLine = phase === "video"
        ? `Only ${fmtMin(remaining.left)} of ${remaining.name} video left.`
        : `Only ${Math.round(remaining.left)} pages of ${remaining.name} left.`;
    }
  }
  const today = Math.round(scoreForDate(todayStr()));
  const yesterday = Math.round(scoreForDate(yesterdayStr()));
  const diff = yesterday - today;
  const cmpLine = diff > 0 ? `You're ${diff} pts behind this time yesterday — catch up!` : `You're ahead of yesterday — keep it up!`;
  return [subjLine, cmpLine].filter(Boolean).join(" ");
}

function pushStatsToSW(){
  if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
  navigator.serviceWorker.controller.postMessage({
    type: "STATS_UPDATE",
    stats: { body: computeNotificationBody() }
  });
}

async function initServiceWorker(){
  if (!("serviceWorker" in navigator)) return;
  try{
    await navigator.serviceWorker.register("./sw.js");
    navigator.serviceWorker.addEventListener("controllerchange", ()=> pushStatsToSW());
    if (navigator.serviceWorker.controller) pushStatsToSW();
    const checkNow = ()=> navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage({type:"CHECK_NOW"});
    document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState === "visible") checkNow(); });
    checkNow();
    tryRegisterPeriodicSync();
  }catch(e){ /* SW registration failed — app still works without offline/notifications */ }
}

// Best-effort only: Periodic Background Sync is limited to some installed
// Android Chrome PWAs that meet engagement criteria. On iOS Safari / most
// browsers this silently does nothing, and the app falls back to catching
// checkpoints up the moment it's opened or foregrounded (see below).
async function tryRegisterPeriodicSync(){
  try{
    const reg = await navigator.serviceWorker.ready;
    if (!("periodicSync" in reg)) return;
    const status = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (status.state === "granted"){
      await reg.periodicSync.register("checkpoint-notify", { minInterval: 2 * 60 * 60 * 1000 });
    }
  }catch(e){ /* not supported on this platform — foreground checks still work */ }
}

function initNotificationPermission(){
  if (!("Notification" in window)) return;
  if (Notification.permission === "default"){
    Notification.requestPermission().catch(()=>{});
  }
}

// Runs on every page load, then every 5 minutes while the app stays open, and
// again whenever the tab regains focus — this delivers the midnight day-close
// message and the 9am start-study nudge. Service worker + notification
// permission are initialised here too.
initServiceWorker();
initNotificationPermission();
runDailyRemindersCheck();
runGraphDeclineCheckIfDue();
setInterval(runDailyRemindersCheck, 5*60*1000);
document.addEventListener("visibilitychange", ()=>{ if (document.visibilityState === "visible") runDailyRemindersCheck(); });

/* ================= BOTTOM NAV (single-page view switcher) ================= */
// The app is now one page — the nav swaps which <section class="view"> is
// visible instead of navigating to a different file. index.html defines
// switchView(); this just renders the buttons and marks the active one.
function renderBottomNav(active){
  const host = document.getElementById("bottomNav");
  if (!host) return;
  const items = [
    { id:"home", label:"Home", icon:"🏠" },
    { id:"study", label:"Study", icon:"⏱️" },
    { id:"progress", label:"Progress", icon:"📊" },
    { id:"rewards", label:"Rewards", icon:"🏆" },
  ];
  host.innerHTML = items.map(it=>`
    <button type="button" class="nav-item ${it.id===active?'active':''}" data-view="${it.id}">
      <span class="nav-ic">${it.icon}</span>
      <span class="nav-label">${it.label}</span>
    </button>`).join("");
  host.querySelectorAll(".nav-item").forEach(btn=>{
    btn.addEventListener("click", ()=>{ if (typeof switchView === "function") switchView(btn.dataset.view); });
  });
}

/* ================= FOCUS SESSION BACKGROUND NOTIFICATION ================= */
// Best-effort "keep the count visible even if you switch apps" indicator —
// while a session is running, an ongoing low-key notification shows elapsed
// time, refreshed every minute the tab stays alive. True second-by-second
// background counting isn't possible for a web app with the tab closed, but
// this means the running time is never more than ~1 minute stale, and the
// elapsed time is always recalculated correctly the moment you reopen.
function notifyFocusStart(){
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (navigator.serviceWorker && navigator.serviceWorker.controller){
    navigator.serviceWorker.controller.postMessage({ type: "FOCUS_UPDATE", body: "Session shuru — 0m ho gaye." });
  }
}
function notifyFocusUpdate(elapsedMin){
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (navigator.serviceWorker && navigator.serviceWorker.controller){
    navigator.serviceWorker.controller.postMessage({ type: "FOCUS_UPDATE", body: `Lagatar padhai chal rahi hai — ${fmtMin(elapsedMin)} ho gaye.` });
  }
}
function notifyFocusStop(){
  if (navigator.serviceWorker && navigator.serviceWorker.controller){
    navigator.serviceWorker.controller.postMessage({ type: "FOCUS_STOP" });
  }
}
