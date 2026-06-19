/* ============================================================
   Training Matrix - plan-engine.js
   Turns a goal + selected styles/workouts + length/sessions into
   a phased, progressive week-by-week programme.

   Pure functions, no DOM. Designed to be tested in Node, then the
   same code is pasted into app.js.
   ============================================================ */

'use strict';

/* ------------------------------------------------------------
   PHASE MODEL
   Four phases. Each phase favours certain training styles (by id)
   and shifts the intensity mix. The generator only ever uses
   styles the user actually selected; affinities just bias which
   of the available styles each phase leans on.
   ------------------------------------------------------------ */
const PHASES = [
  {
    id: 'base',
    name: 'Base',
    purpose: 'Aerobic development, durability and consistency.',
    // Relative emphasis (0-3) per style during this phase.
    emphasis: {
      'easy-aerobic': 3, 'long-runs': 3, 'speed-strides': 2, 'hill-work': 2,
      'strength': 3, 'recovery-runs': 2, 'threshold': 1, 'race-pace': 0,
      'vo2-intervals': 0
    },
    intensity: 'Mostly easy Zone 1-2 with a little faster work.'
  },
  {
    id: 'build',
    name: 'Build',
    purpose: 'Raise threshold and sustainable speed; increase load.',
    emphasis: {
      'threshold': 3, 'long-runs': 2, 'hill-work': 2, 'vo2-intervals': 2,
      'easy-aerobic': 2, 'speed-strides': 1, 'race-pace': 1, 'strength': 1,
      'recovery-runs': 1
    },
    intensity: 'Zone 2 base with growing Zone 3-4 work.'
  },
  {
    id: 'specific',
    name: 'Specific',
    purpose: 'Train the exact demands of the goal; practise pacing.',
    emphasis: {
      'race-pace': 3, 'vo2-intervals': 2, 'threshold': 2, 'long-runs': 2,
      'easy-aerobic': 2, 'speed-strides': 1, 'hill-work': 1, 'recovery-runs': 1,
      'strength': 1
    },
    intensity: 'Significant goal-pace work; event-specific mix.'
  },
  {
    id: 'taper',
    name: 'Peak & Taper',
    purpose: 'Shed fatigue, hold fitness, arrive fresh.',
    emphasis: {
      'easy-aerobic': 2, 'race-pace': 2, 'vo2-intervals': 1, 'threshold': 1,
      'speed-strides': 1, 'recovery-runs': 2, 'long-runs': 1, 'hill-work': 0,
      'strength': 1
    },
    intensity: 'Volume drops, intensity held, freshness rises.'
  }
];

/* ------------------------------------------------------------
   WORKOUT PROGRESSION METADATA
   For each workout (by exact name as used in WORKOUTS), describe
   how to express it at a given progression level (0 = early,
   higher = later/harder). Kept relative (no real paces).

   load: a rough relative training-load number used to scale weekly
   volume and taper. Higher = harder session.
   ------------------------------------------------------------ */
const WORKOUT_META = {
  // easy-aerobic
  '30-45 min Zone 2 Run': { base: '30 min easy', steps: ['30 min', '35 min', '40 min', '45 min'], unit: 'easy Zone 2', load: 2 },
  '45-60 min Easy Run':   { base: '45 min easy', steps: ['45 min', '50 min', '55 min', '60 min'], unit: 'easy', load: 3 },
  'Recovery Jog':         { base: '20 min jog', steps: ['20 min', '25 min', '30 min'], unit: 'very easy', load: 1 },
  'Easy Trail Run':       { base: '40 min trail', steps: ['40 min', '50 min', '60 min'], unit: 'easy off-road', load: 3 },
  // long-runs
  'Standard Long Run':        { base: '60 min long', steps: ['60 min', '75 min', '90 min', '105 min'], unit: 'steady long run', load: 5 },
  'Progressive Long Run':     { base: 'long, easy to steady', steps: ['70 min', '85 min', '100 min'], unit: 'finishing faster', load: 6 },
  'Long Run With Fast Finish':{ base: 'long + fast finish', steps: ['70 min + 10 fast', '85 min + 15 fast', '95 min + 20 fast'], unit: '', load: 6 },
  'Back-to-Back Long Runs':   { base: 'long both days', steps: ['2 x 60 min', '2 x 75 min', '2 x 90 min'], unit: 'on consecutive days', load: 7 },
  // threshold
  '20-Minute Tempo':     { base: '20 min tempo', steps: ['15 min', '20 min', '25 min', '30 min'], unit: 'continuous tempo', load: 4 },
  '3 x 10 Min Threshold':{ base: '3 x 8 min', steps: ['3 x 8 min', '3 x 10 min', '4 x 10 min', '4 x 12 min'], unit: 'at threshold', load: 5 },
  '2 x 20 Min Threshold':{ base: '2 x 15 min', steps: ['2 x 15 min', '2 x 18 min', '2 x 20 min'], unit: 'at threshold', load: 6 },
  '5 x 2km Threshold':   { base: '4 x 2km', steps: ['4 x 2km', '5 x 2km', '6 x 2km'], unit: 'at threshold', load: 6 },
  // vo2-intervals
  '5 x 1000m at 5k Effort':{ base: '4 x 1000m', steps: ['4 x 1000m', '5 x 1000m', '6 x 1000m'], unit: 'at 5k effort', load: 6 },
  '6 x 800m Hard':         { base: '5 x 800m', steps: ['5 x 800m', '6 x 800m', '7 x 800m'], unit: 'hard', load: 5 },
  '4 x 4 Min VO2':         { base: '4 x 3 min', steps: ['4 x 3 min', '4 x 4 min', '5 x 4 min'], unit: 'hard, near max', load: 5 },
  '10 x 1 Min Hard':       { base: '8 x 1 min', steps: ['8 x 1 min', '10 x 1 min', '12 x 1 min'], unit: 'hard with jog recovery', load: 4 },
  // speed-strides
  '8 x 20s Strides': { base: '6 x 20s', steps: ['6 x 20s', '8 x 20s', '10 x 20s'], unit: 'relaxed fast strides', load: 2 },
  '10 x 100m Fast':  { base: '8 x 100m', steps: ['8 x 100m', '10 x 100m', '12 x 100m'], unit: 'fast, full recovery', load: 3 },
  '6 x 200m Quick':  { base: '5 x 200m', steps: ['5 x 200m', '6 x 200m', '8 x 200m'], unit: 'quick', load: 3 },
  'Hill Sprints':    { base: '6 x 10s hill', steps: ['6 x 10s', '8 x 10s', '10 x 10s'], unit: 'maximal hill sprints', load: 3 },
  // race-pace
  '3 x 2km at Race Pace':   { base: '3 x 2km', steps: ['3 x 2km', '4 x 2km', '5 x 2km'], unit: 'at goal race pace', load: 5 },
  '5km Race-Pace Block':    { base: '4km block', steps: ['4km', '5km', '6km'], unit: 'at goal pace', load: 5 },
  '2 x 5km at Marathon Pace':{ base: '2 x 4km', steps: ['2 x 4km', '2 x 5km', '2 x 6km'], unit: 'at marathon pace', load: 6 },
  '10km Steady at Goal Pace':{ base: '8km steady', steps: ['8km', '10km', '12km'], unit: 'at goal pace', load: 6 },
  // hill-work
  '8 x 60m Short Hills': { base: '6 x 60m', steps: ['6 x 60m', '8 x 60m', '10 x 60m'], unit: 'short hills', load: 3 },
  '6 x 2 Min Hills':     { base: '5 x 2 min', steps: ['5 x 2 min', '6 x 2 min', '8 x 2 min'], unit: 'hill efforts', load: 4 },
  'Rolling Hill Run':    { base: '40 min rolling', steps: ['40 min', '50 min', '60 min'], unit: 'hilly route', load: 4 },
  'Hill Circuit':        { base: 'hill circuit', steps: ['4 rounds', '5 rounds', '6 rounds'], unit: 'hill + strength circuit', load: 4 },
  // strength
  'Lower Body Strength': { base: 'lower body', steps: ['2 sets', '3 sets', '3 sets heavier'], unit: 'gym session', load: 3 },
  'Core & Stability':    { base: 'core routine', steps: ['20 min', '25 min', '30 min'], unit: 'core & stability', load: 2 },
  'Plyometrics':         { base: 'plyos', steps: ['light', 'moderate', 'full'], unit: 'jump/power work', load: 3 },
  'Full Body Routine':   { base: 'full body', steps: ['2 sets', '3 sets', '3 sets heavier'], unit: 'gym session', load: 3 },
  // recovery-runs
  '20-30 min Very Easy': { base: '20 min', steps: ['20 min', '25 min', '30 min'], unit: 'very easy', load: 1 },
  'Recovery Shakeout':   { base: '15 min', steps: ['15 min', '20 min'], unit: 'shakeout jog', load: 1 },
  'Easy Spin or Walk':   { base: '30 min', steps: ['30 min', '40 min'], unit: 'cross-training', load: 1 },
  'Flat Recovery Loop':  { base: '25 min flat', steps: ['25 min', '30 min'], unit: 'flat & easy', load: 1 }
};

function metaFor(name) {
  return WORKOUT_META[name] || { base: name, steps: [name], unit: '', load: 3 };
}

/* ------------------------------------------------------------
   PHASE LENGTH ALLOCATION
   Given total weeks, split across phases. Taper is protected
   first, then specific, build, base fills the rest. Short plans
   collapse gracefully.
   ------------------------------------------------------------ */
function allocatePhases(totalWeeks) {
  totalWeeks = Math.max(1, Math.round(totalWeeks));

  // Very short plans: just taper, or build+taper.
  if (totalWeeks <= 2) {
    return [{ phase: 'taper', weeks: totalWeeks }];
  }
  if (totalWeeks <= 4) {
    const taper = 1;
    return [
      { phase: 'build', weeks: totalWeeks - taper },
      { phase: 'taper', weeks: taper }
    ];
  }

  // Proportional split for longer plans, then enforce minimums.
  // Rough target ratios: base 35%, build 30%, specific 22%, taper 13%.
  let taper = Math.max(1, Math.round(totalWeeks * 0.13));
  taper = Math.min(taper, 3);
  let specific = Math.max(1, Math.round(totalWeeks * 0.22));
  let build = Math.max(1, Math.round(totalWeeks * 0.30));
  let base = totalWeeks - taper - specific - build;

  // If base went negative, trim from build then specific.
  while (base < 1 && build > 1) { build--; base++; }
  while (base < 1 && specific > 1) { specific--; base++; }
  while (base < 0 && taper > 1) { taper--; base++; }

  const out = [];
  if (base > 0) out.push({ phase: 'base', weeks: base });
  if (build > 0) out.push({ phase: 'build', weeks: build });
  if (specific > 0) out.push({ phase: 'specific', weeks: specific });
  if (taper > 0) out.push({ phase: 'taper', weeks: taper });

  // Sanity: weeks must sum to total. Adjust the largest phase if off.
  let sum = out.reduce(function (s, p) { return s + p.weeks; }, 0);
  if (sum !== totalWeeks && out.length) {
    out.sort(function (a, b) { return b.weeks - a.weeks; });
    out[0].weeks += (totalWeeks - sum);
    // restore phase order
    const order = { base: 0, build: 1, specific: 2, taper: 3 };
    out.sort(function (a, b) { return order[a.phase] - order[b.phase]; });
  }
  return out;
}

/* Style category: how hard a session of this style is, and whether
   it's the weekly "long" anchor. Used for sensible day placement and
   for capping quality work in the Base phase. */
const STYLE_CATEGORY = {
  'easy-aerobic':  { kind: 'easy', long: false },
  'recovery-runs': { kind: 'easy', long: false },
  'strength':      { kind: 'easy', long: false },
  'speed-strides': { kind: 'moderate', long: false },
  'hill-work':     { kind: 'hard', long: false },
  'threshold':     { kind: 'hard', long: false },
  'vo2-intervals': { kind: 'hard', long: false },
  'race-pace':     { kind: 'hard', long: false },
  'long-runs':     { kind: 'long', long: true }
};
function categoryOf(id) {
  return STYLE_CATEGORY[id] || { kind: 'moderate', long: false };
}
function isHard(id) {
  return categoryOf(id).kind === 'hard';
}

/* Max HARD quality sessions a phase schedules per week, regardless of
   how many hard styles the user picked. This is what makes Base feel
   like base and stops a 5k plan front-loading VO2 work. */
const PHASE_HARD_CAP = { base: 1, build: 2, specific: 3, taper: 2 };

/* ------------------------------------------------------------
   SESSION DISTRIBUTION
   For a given phase and the user's available styles, pick which
   styles fill the week's sessions, biased by phase emphasis, goal
   suitability, and a hard-session cap. Returns style ids of length
   = sessions (styles may repeat when sessions exceed distinct styles).
   ------------------------------------------------------------ */
function chooseStylesForWeek(phaseId, availableStyleIds, suitability, sessions, weekSeed) {
  const phase = PHASES.find(function (p) { return p.id === phaseId; });
  const emphasis = phase ? phase.emphasis : {};
  const hardCap = PHASE_HARD_CAP[phaseId] !== undefined ? PHASE_HARD_CAP[phaseId] : 2;

  const scored = availableStyleIds.map(function (id) {
    const e = emphasis[id] !== undefined ? emphasis[id] : 1;
    const s = suitability[id] !== undefined ? suitability[id] : 1;
    return { id: id, score: e * 2 + s, hard: isHard(id), long: categoryOf(id).long };
  }).filter(function (x) { return x.score > 0; });

  if (scored.length === 0) {
    availableStyleIds.forEach(function (id) {
      scored.push({ id: id, score: 1, hard: isHard(id), long: categoryOf(id).long });
    });
  }
  scored.sort(function (a, b) { return b.score - a.score; });

  const hardStyles = scored.filter(function (x) { return x.hard; });
  const easyStyles = scored.filter(function (x) { return !x.hard && !x.long; });

  const week = [];
  let hardUsed = 0;

  // 1. Long run first if available and the phase wants it.
  const longStyle = scored.find(function (x) { return x.long; });
  if (longStyle && phaseId !== 'taper' && sessions >= 3) {
    week.push(longStyle.id);
  }

  // 2. Hard sessions up to the phase cap, rotated by week so they vary.
  if (hardStyles.length) {
    let hi = weekSeed % hardStyles.length;
    while (hardUsed < hardCap && week.length < sessions) {
      week.push(hardStyles[hi % hardStyles.length].id);
      hi++;
      hardUsed++;
    }
  }

  // 3. Fill remaining with easy/moderate, rotated by week.
  const fillPool = easyStyles.length ? easyStyles : scored;
  let fi = (weekSeed * 3) % fillPool.length;
  let guard = 0;
  while (week.length < sessions && guard < sessions * 4) {
    week.push(fillPool[fi % fillPool.length].id);
    fi++; guard++;
  }

  // 4. Last resort top-up from anything available.
  let ai = 0;
  while (week.length < sessions && scored.length) {
    week.push(scored[ai % scored.length].id);
    ai++;
  }

  return week.slice(0, sessions);
}

/* ------------------------------------------------------------
   DAY PLACEMENT
   Spread sessions across 7 days with hard days apart, long run
   late in the week, recovery after hard. Returns array of 7 day
   objects (some rest).
   ------------------------------------------------------------ */
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/* Assign each session a specific weekday. Strategy:
   - The long run goes on Sunday (or Saturday if Sunday taken).
   - Hard sessions are spread onto Tue / Thu / Sat so no two hard days
     sit back to back.
   - Easy / moderate sessions fill the remaining preferred days.
   Returns an array (parallel to sessionStyleIds) of day indices. */
function placeDays(sessionStyleIds) {
  const n = sessionStyleIds.length;
  const assigned = new Array(n).fill(null);
  const taken = {}; // dayIndex -> true

  function take(day) { taken[day] = true; return day; }
  function free(day) { return !taken[day]; }
  function firstFree(order) {
    for (let i = 0; i < order.length; i++) if (free(order[i])) return order[i];
    return null;
  }

  // Index lists by category.
  const longIdx = [];
  const hardIdx = [];
  const easyIdx = [];
  sessionStyleIds.forEach(function (id, i) {
    const c = categoryOf(id);
    if (c.long) longIdx.push(i);
    else if (isHard(id)) hardIdx.push(i);
    else easyIdx.push(i);
  });

  // 1. Long run -> Sunday (6), else Saturday (5).
  longIdx.forEach(function (i) {
    const d = free(6) ? 6 : (free(5) ? 5 : firstFree([6, 5, 4, 3, 2, 1, 0]));
    if (d !== null) assigned[i] = take(d);
  });

  // 2. Hard sessions -> spaced days: Tue(1), Thu(3), Sat(5), then Wed(2)/Fri(4).
  const hardPref = [1, 3, 5, 2, 4, 0, 6];
  hardIdx.forEach(function (i) {
    const d = firstFree(hardPref);
    if (d !== null) assigned[i] = take(d);
  });

  // 3. Easy/moderate -> remaining preferred days: Mon, Wed, Fri, Sat, Tue, Thu, Sun.
  const easyPref = [0, 2, 4, 5, 1, 3, 6];
  easyIdx.forEach(function (i) {
    const d = firstFree(easyPref);
    if (d !== null) assigned[i] = take(d);
  });

  // 4. Any still unassigned (more sessions than days): fill any free day.
  for (let i = 0; i < n; i++) {
    if (assigned[i] === null) {
      const d = firstFree([0, 1, 2, 3, 4, 5, 6]);
      assigned[i] = d !== null ? take(d) : i % 7;
    }
  }

  return assigned;
}

/* ------------------------------------------------------------
   GENERATE PLAN
   Top-level: build the full week-by-week plan.
   opts = { goalId, styleIds, workouts, weeks, sessions, suitability,
            startDate (ISO, optional) }
   ------------------------------------------------------------ */
function generatePlan(opts) {
  const goalId = opts.goalId;
  const styleIds = opts.styleIds || [];
  const workouts = opts.workouts || {};
  const weeks = Math.max(1, Math.round(opts.weeks || 8));
  const sessions = Math.max(1, Math.min(7, Math.round(opts.sessions || 4)));
  const suitability = opts.suitability || {};

  const phaseAlloc = allocatePhases(weeks);

  // Expand phase allocation into a per-week phase list.
  const weekPhases = [];
  phaseAlloc.forEach(function (pa) {
    for (let i = 0; i < pa.weeks; i++) {
      weekPhases.push({ phase: pa.phase, indexInPhase: i, phaseLength: pa.weeks });
    }
  });

  // Track how far we've rotated through each style's workout variants.
  const variantCursor = {};
  styleIds.forEach(function (id) { variantCursor[id] = 0; });

  // For each style, the list of workouts the user selected (fallback
  // to all workouts for that style if none chosen).
  function workoutsForStyle(id) {
    const chosen = workouts[id] && workouts[id].length ? workouts[id] : null;
    return chosen || (opts.allWorkouts && opts.allWorkouts[id]) || [];
  }

  const planWeeks = [];

  for (let w = 0; w < weeks; w++) {
    const wp = weekPhases[w];
    const phase = PHASES.find(function (p) { return p.id === wp.phase; });

    // Is this a down/recovery week? Every 4th week within a phase,
    // but never the taper (taper is already reduced).
    const isDownWeek = wp.phase !== 'taper' &&
      wp.phaseLength >= 4 &&
      (wp.indexInPhase + 1) % 4 === 0;

    // Progression level rises across the whole plan (0..n).
    const progressFraction = weeks > 1 ? w / (weeks - 1) : 0;

    // Choose which styles fill this week's sessions.
    const weekSessions = wp.phase === 'taper'
      ? Math.max(1, sessions - 1)            // taper trims one session
      : (isDownWeek ? Math.max(1, sessions - 1) : sessions);

    const styleSeq = chooseStylesForWeek(wp.phase, styleIds, suitability, weekSessions, w);
    const dayAssignments = placeDays(styleSeq);

    // Build session objects.
    const sessionsOut = [];
    styleSeq.forEach(function (sid, idx) {
      const list = workoutsForStyle(sid);
      let workoutName;
      if (list.length === 0) {
        workoutName = null;
      } else {
        // Rotate through variants so sessions vary week to week.
        const cur = variantCursor[sid] || 0;
        workoutName = list[cur % list.length];
        variantCursor[sid] = cur + 1;
      }

      const meta = workoutName ? metaFor(workoutName) : { steps: ['session'], unit: '', load: 3 };
      // Progression: pick a step in the workout's ladder based on how
      // far through the plan we are, eased back on down weeks and taper.
      let stepIdx = Math.round(progressFraction * (meta.steps.length - 1));
      if (isDownWeek && stepIdx > 0) stepIdx -= 1;
      if (wp.phase === 'taper') stepIdx = Math.max(0, Math.floor(meta.steps.length * 0.4));
      stepIdx = Math.max(0, Math.min(meta.steps.length - 1, stepIdx));

      const style = (opts.styleLookup && opts.styleLookup(sid)) || { name: sid, primary: '' };

      sessionsOut.push({
        styleId: sid,
        styleName: style.name,
        workout: workoutName,
        prescription: meta.steps[stepIdx],
        unit: meta.unit,
        load: meta.load,
        day: DAY_NAMES[dayAssignments[idx] !== undefined && dayAssignments[idx] !== null ? dayAssignments[idx] : idx]
      });
    });

    // Sort sessions by their day order.
    sessionsOut.sort(function (a, b) {
      return DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day);
    });

    const weekLoad = sessionsOut.reduce(function (s, x) { return s + (x.load || 0); }, 0);

    planWeeks.push({
      week: w + 1,
      phase: phase.id,
      phaseName: phase.name,
      phasePurpose: phase.purpose,
      intensity: phase.intensity,
      isDownWeek: isDownWeek,
      sessions: sessionsOut,
      load: weekLoad
    });
  }

  return {
    goalId: goalId,
    weeks: weeks,
    sessionsPerWeek: sessions,
    startDate: opts.startDate || null,
    phases: phaseAlloc,
    planWeeks: planWeeks,
    createdAt: new Date().toISOString()
  };
}

/* ============================================================
   Training Matrix - plan UI layer
   Class names align with the plan styles already in styles.css.
   ============================================================ */

var PLAN_STORAGE_KEY = 'training-matrix-plans-v1';

var planState = {
  view: null,        // null = profile flow owns screen; else 'setup'|'plan'|'list'
  draft: { lengthMode: 'weeks', weeks: 12, raceDate: '', sessions: 5 },
  current: null,
  currentId: null
};

function loadPlans() {
  try {
    var raw = localStorage.getItem(PLAN_STORAGE_KEY);
    if (!raw) return [];
    var arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (e) { return []; }
}

function persistPlans(plans) {
  try { localStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plans)); }
  catch (e) { /* storage unavailable */ }
}

function savePlan(plan) {
  var plans = loadPlans();
  var id = 'plan_' + Date.now();
  var goal = getGoal(plan.goalId);
  plans.unshift({
    id: id, goalId: plan.goalId,
    goalName: goal ? goal.name : plan.goalId,
    weeks: plan.weeks, sessionsPerWeek: plan.sessionsPerWeek,
    raceDate: plan.raceDate || null, startDate: plan.startDate || null,
    createdAt: plan.createdAt || new Date().toISOString(),
    plan: plan
  });
  persistPlans(plans);
  return id;
}

function deletePlan(id) {
  persistPlans(loadPlans().filter(function (p) { return p.id !== id; }));
}

function weeksUntil(isoDate) {
  if (!isoDate) return null;
  var target = new Date(isoDate + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  var now = new Date(); now.setHours(0, 0, 0, 0);
  var ms = target.getTime() - now.getTime();
  if (ms <= 0) return null;
  return Math.max(1, Math.round(ms / (7 * 24 * 60 * 60 * 1000)));
}

function formatDate(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dateForWeekDay(startIso, weekIndex, dayIndex) {
  if (!startIso) return null;
  var start = new Date(startIso + 'T00:00:00');
  if (isNaN(start.getTime())) return null;
  var dow = (start.getDay() + 6) % 7;
  var monday = new Date(start);
  monday.setDate(start.getDate() - dow);
  var d = new Date(monday);
  d.setDate(monday.getDate() + weekIndex * 7 + dayIndex);
  return d;
}

/* Entry button on the profile step. */
function renderBuildPlanButton(frag) {
  var wrap = el('div', 'planentry');
  var build = el('button', 'btn btn--primary planentry__build', 'Build my plan');
  build.type = 'button';
  build.addEventListener('click', function () {
    planState.view = 'setup'; render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  wrap.appendChild(build);

  var plans = loadPlans();
  if (plans.length) {
    var view = el('button', 'btn btn--ghost planentry__saved',
      'View saved plans (' + plans.length + ')');
    view.type = 'button';
    view.addEventListener('click', function () {
      planState.view = 'list'; render();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    wrap.appendChild(view);
  }
  frag.appendChild(wrap);
}

function renderPlanView() {
  if (!planState.view) return false;
  if (planState.view === 'setup') { renderPlanSetup(); return true; }
  if (planState.view === 'plan') { renderPlanScreen(); return true; }
  if (planState.view === 'list') { renderPlanList(); return true; }
  return false;
}

function planBackToProfile() {
  planState.view = null; planState.current = null; planState.currentId = null;
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* SCREEN: setup */
function renderPlanSetup() {
  renderStepper();
  var frag = document.createDocumentFragment();
  var head = el('div', 'screen__head');
  head.appendChild(el('h1', 'screen__title', 'Build your plan'));
  head.appendChild(el('p', 'screen__sub',
    'A week-by-week programme from your selected styles and workouts, with phases and progression.'));
  frag.appendChild(head);

  var d = planState.draft;

  var lenField = el('div', 'field');
  lenField.appendChild(el('span', 'field__label', 'Plan length'));
  var seg = el('div', 'segment');
  [['weeks', 'Number of weeks'], ['date', 'Race date']].forEach(function (m) {
    var b = el('button', 'segment__btn' + (d.lengthMode === m[0] ? ' is-on' : ''), m[1]);
    b.type = 'button';
    b.addEventListener('click', function () { d.lengthMode = m[0]; renderPlanSetup(); });
    seg.appendChild(b);
  });
  lenField.appendChild(seg);

  if (d.lengthMode === 'weeks') {
    var row = el('div', 'stepperrow');
    var minus = el('button', 'stepperrow__btn', '\u2212');
    minus.type = 'button'; minus.setAttribute('aria-label', 'Fewer weeks');
    minus.addEventListener('click', function () { d.weeks = Math.max(2, d.weeks - 1); renderPlanSetup(); });
    var val = el('span', 'stepperrow__val', String(d.weeks));
    var plus = el('button', 'stepperrow__btn', '+');
    plus.type = 'button'; plus.setAttribute('aria-label', 'More weeks');
    plus.addEventListener('click', function () { d.weeks = Math.min(36, d.weeks + 1); renderPlanSetup(); });
    row.appendChild(minus); row.appendChild(val); row.appendChild(plus);
    row.appendChild(el('span', 'field__hint', 'weeks'));
    lenField.appendChild(row);
  } else {
    var dateInput = document.createElement('input');
    dateInput.type = 'date'; dateInput.className = 'field__input';
    dateInput.value = d.raceDate || '';
    dateInput.min = new Date().toISOString().slice(0, 10);
    dateInput.addEventListener('change', function () {
      d.raceDate = dateInput.value;
      var wk = weeksUntil(d.raceDate);
      var note = document.getElementById('date-note');
      if (note) note.textContent = wk ? (wk + ' weeks until race day') : 'Pick a future date';
      renderActionBarForSetup();
    });
    lenField.appendChild(dateInput);
    var note = el('span', 'field__hint', '');
    note.id = 'date-note';
    var wk0 = weeksUntil(d.raceDate);
    note.textContent = wk0 ? (wk0 + ' weeks until race day') : 'Pick a date at least 2 weeks away';
    lenField.appendChild(note);
  }
  frag.appendChild(lenField);

  var sField = el('div', 'field');
  sField.appendChild(el('span', 'field__label', 'Sessions per week'));
  var choice = el('div', 'choicerow');
  [3, 4, 5, 6].forEach(function (n) {
    var b = el('button', 'choicerow__btn' + (d.sessions === n ? ' is-on' : ''), String(n));
    b.type = 'button';
    b.addEventListener('click', function () { d.sessions = n; renderPlanSetup(); });
    choice.appendChild(b);
  });
  sField.appendChild(choice);
  sField.appendChild(el('span', 'field__hint',
    'Phases redistribute these: easier early, sharper later, lighter in the taper.'));
  frag.appendChild(sField);

  clear(screen);
  screen.appendChild(frag);
  renderActionBarForSetup();
}

function renderActionBarForSetup() {
  var d = planState.draft;
  clear(actionBar);
  var back = el('button', 'btn btn--ghost', 'Back');
  back.type = 'button';
  back.addEventListener('click', planBackToProfile);
  actionBar.appendChild(back);
  var gen = el('button', 'btn btn--primary', 'Generate plan');
  gen.type = 'button';
  var canGen = d.lengthMode === 'weeks' ? d.weeks >= 2 : !!weeksUntil(d.raceDate);
  gen.disabled = !canGen;
  gen.addEventListener('click', function () { if (canGen) generateAndShow(); });
  actionBar.appendChild(gen);
}

function generateAndShow() {
  var d = planState.draft;
  var weeks = d.lengthMode === 'weeks' ? d.weeks : weeksUntil(d.raceDate);
  if (!weeks) return;
  var suit = GOAL_STYLE_SUITABILITY[state.goalId] || {};
  var plan = generatePlan({
    goalId: state.goalId, styleIds: state.selectedStyleIds,
    workouts: state.selectedWorkouts, allWorkouts: WORKOUTS,
    weeks: weeks, sessions: d.sessions, suitability: suit,
    styleLookup: function (id) { return getStyle(id); }
  });
  if (d.lengthMode === 'date' && d.raceDate) {
    plan.startDate = new Date().toISOString().slice(0, 10);
    plan.raceDate = d.raceDate;
  }
  planState.current = plan;
  planState.currentId = null;
  planState.view = 'plan';
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* SCREEN: generated plan */
function renderPlanScreen() {
  renderStepper();
  var plan = planState.current;
  if (!plan) { planBackToProfile(); return; }
  var goal = getGoal(plan.goalId);
  var frag = document.createDocumentFragment();

  var head = el('div', 'screen__head');
  head.appendChild(el('h1', 'screen__title', plan.weeks + '-week plan'));
  var sub = (goal ? goal.name : '') + ' \u00b7 ' + plan.sessionsPerWeek + ' sessions/week';
  if (plan.raceDate) sub += ' \u00b7 race ' + formatDate(plan.raceDate);
  head.appendChild(el('p', 'screen__sub', sub));
  frag.appendChild(head);

  var legend = el('div', 'phaselegend');
  plan.phases.forEach(function (pa) {
    var ph = PHASES.find(function (p) { return p.id === pa.phase; });
    var item = el('div', 'phaselegend__item phase--' + pa.phase);
    item.appendChild(el('span', 'phaselegend__name', ph ? ph.name : pa.phase));
    item.appendChild(el('span', 'phaselegend__weeks', pa.weeks + (pa.weeks === 1 ? ' week' : ' weeks')));
    legend.appendChild(item);
  });
  frag.appendChild(legend);

  var lastPhase = null;
  plan.planWeeks.forEach(function (wk, wi) {
    if (wk.phase !== lastPhase) {
      var ph = PHASES.find(function (p) { return p.id === wk.phase; });
      var phHead = el('div', 'phasehead phase--' + wk.phase);
      phHead.appendChild(el('span', 'phasehead__name', ph ? ph.name : wk.phase));
      phHead.appendChild(el('span', 'phasehead__note', ph ? ph.purpose : ''));
      frag.appendChild(phHead);
      lastPhase = wk.phase;
    }

    var card = el('div', 'weekcard phase--' + wk.phase + (wk.isDownWeek ? ' is-down' : ''));
    var wh = el('div', 'weekcard__head');
    wh.appendChild(el('span', 'weekcard__title', 'Week ' + wk.week));
    if (wk.isDownWeek) wh.appendChild(el('span', 'weekcard__tag', 'Recovery'));
    wh.appendChild(el('span', 'weekcard__count', wk.sessions.length + ' sessions'));
    card.appendChild(wh);

    var list = el('div', 'sesslist');
    wk.sessions.forEach(function (s) {
      var row = el('div', 'sess');
      row.appendChild(el('span', 'sess__dot'));
      var body = el('div', 'sess__body');
      body.appendChild(el('span', 'sess__title', s.day + ' \u00b7 ' + s.styleName));
      var presc = s.prescription + (s.unit ? ' ' + s.unit : '');
      var dt = dateForWeekDay(plan.startDate, wi, DAY_NAMES.indexOf(s.day));
      if (dt) presc += '  \u2014  ' + dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      body.appendChild(el('span', 'sess__meta', presc));
      row.appendChild(body);
      list.appendChild(row);
    });
    card.appendChild(list);
    frag.appendChild(card);
  });

  clear(screen);
  screen.appendChild(frag);

  clear(actionBar);
  var back = el('button', 'btn btn--ghost', 'Back');
  back.type = 'button';
  back.addEventListener('click', function () {
    planState.view = planState.currentId ? 'list' : 'setup';
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  actionBar.appendChild(back);

  if (planState.currentId) {
    var saved = el('button', 'btn btn--accent', 'Saved \u2713');
    saved.type = 'button'; saved.disabled = true;
    actionBar.appendChild(saved);
  } else {
    var save = el('button', 'btn btn--primary', 'Save plan');
    save.type = 'button';
    save.addEventListener('click', function () {
      planState.currentId = savePlan(plan);
      renderPlanScreen();
    });
    actionBar.appendChild(save);
  }
}

/* SCREEN: saved list */
function renderPlanList() {
  renderStepper();
  var plans = loadPlans();
  var frag = document.createDocumentFragment();

  var head = el('div', 'screen__head');
  head.appendChild(el('h1', 'screen__title', 'Saved plans'));
  head.appendChild(el('p', 'screen__sub',
    plans.length ? 'Open a saved plan or create a new one.' : 'No saved plans yet.'));
  frag.appendChild(head);

  if (!plans.length) {
    var empty = el('div', 'empty');
    empty.appendChild(el('p', 'empty__text', 'Generate a plan and save it to see it here.'));
    frag.appendChild(empty);
  } else {
    var list = el('div', 'card-list');
    plans.forEach(function (rec) {
      var card = el('div', 'plancard');
      var main = el('button', 'plancard__main');
      main.type = 'button';
      main.appendChild(el('span', 'plancard__name', rec.goalName));
      var meta = rec.weeks + ' weeks \u00b7 ' + rec.sessionsPerWeek + '/week';
      var rd = rec.raceDate || (rec.plan && rec.plan.raceDate);
      if (rd) meta += ' \u00b7 race ' + formatDate(rd);
      main.appendChild(el('span', 'plancard__meta', meta));
      main.appendChild(el('span', 'plancard__meta', 'Created ' + formatDate(rec.createdAt)));
      main.addEventListener('click', function () {
        planState.current = rec.plan; planState.currentId = rec.id;
        planState.view = 'plan'; render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
      card.appendChild(main);

      var del = el('button', 'plancard__del', '\u2715');
      del.type = 'button'; del.setAttribute('aria-label', 'Delete plan');
      del.addEventListener('click', function (e) {
        e.stopPropagation();
        if (del.classList.contains('is-confirm')) { deletePlan(rec.id); renderPlanList(); }
        else {
          del.classList.add('is-confirm'); del.textContent = 'Delete';
          setTimeout(function () { del.classList.remove('is-confirm'); del.textContent = '\u2715'; }, 2600);
        }
      });
      card.appendChild(del);
      list.appendChild(card);
    });
    frag.appendChild(list);
  }

  var newBtn = el('button', 'btn btn--primary planlist__new', 'Create new plan');
  newBtn.type = 'button';
  newBtn.addEventListener('click', function () {
    planState.view = 'setup'; render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  frag.appendChild(newBtn);

  clear(screen);
  screen.appendChild(frag);

  clear(actionBar);
  var back = el('button', 'btn btn--ghost', 'Back to profile');
  back.type = 'button';
  back.addEventListener('click', planBackToProfile);
  actionBar.appendChild(back);
  actionBar.appendChild(el('span', 'actionbar__spacer'));
}
