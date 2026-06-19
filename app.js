/* ============================================================
   Training Matrix - app.js
   Adaptive training composition tool for runners.
   Vanilla JS. No frameworks. No backend.
   ============================================================ */

'use strict';

/* ------------------------------------------------------------
   1. ADAPTATIONS
   The canonical list of physiological qualities the app tracks.
   Every goal weight and style contribution must reference one
   of these exact strings.
   ------------------------------------------------------------ */
const ADAPTATIONS = [
  'Aerobic Base',
  'Threshold',
  'VO2 Max',
  'Speed',
  'Running Economy',
  'Fatigue Resistance',
  'Fuel Utilisation',
  'Strength / Durability',
  'Recovery'
];

/* ------------------------------------------------------------
   2. SCORING CONSTANTS
   ------------------------------------------------------------ */
const POINTS_PER_STAR = 16;   // 1 star of goal need = 16 target points
const WORKOUT_BONUS = 4;      // each selected workout adds +4 to its style's primary adaptation
const MAX_COVERAGE = 100;     // per-adaptation coverage is capped here

/* Diminishing returns. Stacking several styles on one adaptation
   shouldn't pile up linearly (that caused everything to slam to
   100%). The first band of points counts fully; points beyond the
   knee count for less. This keeps a single well-aimed style strong
   while preventing 3-4 overlapping styles from saturating. */
const STACK_KNEE = 34;        // points up to here count fully
const STACK_TAIL = 0.7;       // points beyond the knee count at 70%

function softStack(points) {
  if (points <= STACK_KNEE) return points;
  return STACK_KNEE + (points - STACK_KNEE) * STACK_TAIL;
}

/* ------------------------------------------------------------
   3. GOALS
   weights: adaptation -> star need (1-5). Star x10 = target points.
   Only adaptations the goal cares about are listed.
   ------------------------------------------------------------ */
const GOALS = [
  {
    id: 'marathon-time',
    name: 'Improve Marathon Time',
    desc: 'Build endurance, efficiency, fuel use, and enough threshold to move well over 26.2 miles.',
    weights: {
      'Aerobic Base': 5,
      'Fatigue Resistance': 5,
      'Fuel Utilisation': 5,
      'Running Economy': 4,
      'Threshold': 4,
      'VO2 Max': 2,
      'Strength / Durability': 3,
      'Recovery': 3
    }
  },
  {
    id: 'complete-marathon',
    name: 'Complete a Marathon',
    desc: 'Get to the start line healthy and cover the distance. Endurance and durability first, speed second.',
    weights: {
      'Aerobic Base': 5,
      'Fatigue Resistance': 5,
      'Fuel Utilisation': 4,
      'Strength / Durability': 4,
      'Recovery': 3,
      'Running Economy': 2,
      'Threshold': 2
    }
  },
  {
    id: 'improve-5k',
    name: 'Improve 5k Time',
    desc: 'Sharpen speed, VO2 max and threshold while keeping an aerobic foundation underneath.',
    weights: {
      'VO2 Max': 5,
      'Threshold': 4,
      'Speed': 4,
      'Running Economy': 4,
      'Aerobic Base': 3,
      'Recovery': 2
    }
  },
  {
    id: 'vo2-max',
    name: 'Increase VO2 Max',
    desc: 'A pure physiological target: maximise oxygen uptake through hard intervals and supporting speed.',
    weights: {
      'VO2 Max': 5,
      'Speed': 3,
      'Threshold': 3,
      'Running Economy': 2,
      'Aerobic Base': 2,
      'Recovery': 2
    }
  }
];

/* ------------------------------------------------------------
   4. TRAINING STYLES
   contribution: adaptation -> points added to coverage when the
   style is selected. The first / highest entry is treated as the
   style's PRIMARY adaptation (where its workouts add their bonus).
   primary: explicit primary adaptation for workout bonuses.
   ------------------------------------------------------------ */
const STYLES = [
  {
    id: 'easy-aerobic',
    name: 'Easy Aerobic Runs',
    desc: 'Comfortable Zone 2 mileage that builds the aerobic engine.',
    primary: 'Aerobic Base',
    contribution: {
      'Aerobic Base': 30,
      'Fuel Utilisation': 14,
      'Recovery': 18,
      'Running Economy': 8
    }
  },
  {
    id: 'long-runs',
    name: 'Long Runs',
    desc: 'Extended efforts that build endurance, durability and fuel efficiency.',
    primary: 'Fatigue Resistance',
    contribution: {
      'Fatigue Resistance': 32,
      'Aerobic Base': 20,
      'Fuel Utilisation': 22,
      'Strength / Durability': 14
    }
  },
  {
    id: 'threshold',
    name: 'Threshold Sessions',
    desc: 'Comfortably hard efforts that raise sustainable race pace.',
    primary: 'Threshold',
    contribution: {
      'Threshold': 34,
      'Running Economy': 12,
      'Fatigue Resistance': 12,
      'VO2 Max': 8
    }
  },
  {
    id: 'vo2-intervals',
    name: 'VO2 Max Intervals',
    desc: 'Hard repetitions near maximal oxygen uptake.',
    primary: 'VO2 Max',
    contribution: {
      'VO2 Max': 34,
      'Speed': 14,
      'Threshold': 12,
      'Running Economy': 10
    }
  },
  {
    id: 'speed-strides',
    name: 'Speed & Strides',
    desc: 'Short fast efforts that improve top-end speed and mechanics.',
    primary: 'Speed',
    contribution: {
      'Speed': 30,
      'Running Economy': 18,
      'VO2 Max': 8
    }
  },
  {
    id: 'race-pace',
    name: 'Race-Pace Blocks',
    desc: 'Sustained work at goal race pace to rehearse effort and economy.',
    primary: 'Running Economy',
    contribution: {
      'Running Economy': 24,
      'Threshold': 14,
      'Fatigue Resistance': 14,
      'Fuel Utilisation': 10
    }
  },
  {
    id: 'hill-work',
    name: 'Hill Work',
    desc: 'Inclines that build strength, power and economy with low impact.',
    primary: 'Strength / Durability',
    contribution: {
      'Strength / Durability': 28,
      'Running Economy': 14,
      'VO2 Max': 10,
      'Speed': 10
    }
  },
  {
    id: 'strength',
    name: 'Strength Training',
    desc: 'Gym and bodyweight work that builds durability and resists injury.',
    primary: 'Strength / Durability',
    contribution: {
      'Strength / Durability': 32,
      'Running Economy': 10,
      'Recovery': 6
    }
  },
  {
    id: 'recovery-runs',
    name: 'Recovery Runs',
    desc: 'Very easy efforts that promote recovery between hard days.',
    primary: 'Recovery',
    contribution: {
      'Recovery': 30,
      'Aerobic Base': 12,
      'Fuel Utilisation': 6
    }
  }
];

/* ------------------------------------------------------------
   5. WORKOUTS
   Keyed by style id. Each workout belongs to a style and adds a
   small WORKOUT_BONUS to that style's primary adaptation.
   ------------------------------------------------------------ */
const WORKOUTS = {
  'easy-aerobic': [
    '30-45 min Zone 2 Run',
    '45-60 min Easy Run',
    'Recovery Jog',
    'Easy Trail Run'
  ],
  'long-runs': [
    'Standard Long Run',
    'Progressive Long Run',
    'Long Run With Fast Finish',
    'Back-to-Back Long Runs'
  ],
  'threshold': [
    '20-Minute Tempo',
    '3 x 10 Min Threshold',
    '2 x 20 Min Threshold',
    '5 x 2km Threshold'
  ],
  'vo2-intervals': [
    '5 x 1000m at 5k Effort',
    '6 x 800m Hard',
    '4 x 4 Min VO2',
    '10 x 1 Min Hard'
  ],
  'speed-strides': [
    '8 x 20s Strides',
    '10 x 100m Fast',
    '6 x 200m Quick',
    'Hill Sprints'
  ],
  'race-pace': [
    '3 x 2km at Race Pace',
    '5km Race-Pace Block',
    '2 x 5km at Marathon Pace',
    '10km Steady at Goal Pace'
  ],
  'hill-work': [
    '8 x 60m Short Hills',
    '6 x 2 Min Hills',
    'Rolling Hill Run',
    'Hill Circuit'
  ],
  'strength': [
    'Lower Body Strength',
    'Core & Stability',
    'Plyometrics',
    'Full Body Routine'
  ],
  'recovery-runs': [
    '20-30 min Very Easy',
    'Recovery Shakeout',
    'Easy Spin or Walk',
    'Flat Recovery Loop'
  ]
};

/* ------------------------------------------------------------
   6. RECOMMENDED STYLES PER GOAL
   Which styles the app suggests pre-selecting for each goal,
   each with a 1-5 star suitability rating for that goal.
   Order = display order. suitability drives the star rating.
   ------------------------------------------------------------ */
const GOAL_STYLE_SUITABILITY = {
  'marathon-time': {
    'easy-aerobic': 5,
    'long-runs': 5,
    'threshold': 4,
    'race-pace': 4,
    'strength': 3,
    'recovery-runs': 3,
    'vo2-intervals': 2,
    'hill-work': 3,
    'speed-strides': 2
  },
  'complete-marathon': {
    'easy-aerobic': 5,
    'long-runs': 5,
    'strength': 4,
    'recovery-runs': 4,
    'race-pace': 4,
    'hill-work': 3,
    'threshold': 3,
    'speed-strides': 1,
    'vo2-intervals': 1
  },
  'improve-5k': {
    'vo2-intervals': 5,
    'threshold': 5,
    'speed-strides': 4,
    'easy-aerobic': 4,
    'race-pace': 4,
    'hill-work': 3,
    'recovery-runs': 3,
    'long-runs': 3,
    'strength': 2
  },
  'vo2-max': {
    'vo2-intervals': 5,
    'speed-strides': 4,
    'threshold': 4,
    'easy-aerobic': 4,
    'recovery-runs': 4,
    'hill-work': 3,
    'race-pace': 2,
    'long-runs': 2,
    'strength': 1
  }
};

/* A style is "recommended" (pre-selected) for a goal when its
   suitability is at or above this threshold. */
const RECOMMEND_THRESHOLD = 4;

/* ------------------------------------------------------------
   7. LOOKUP HELPERS
   ------------------------------------------------------------ */
function getGoal(id) {
  return GOALS.find(function (g) { return g.id === id; }) || null;
}
function getStyle(id) {
  return STYLES.find(function (s) { return s.id === id; }) || null;
}

/* ------------------------------------------------------------
   8. SCORING ENGINE
   Given a goal id, an array of selected style ids, and an object
   of selected workouts { styleId: [workoutName, ...] }, compute
   per-adaptation coverage, overall score, weakest area and a
   recommendation.
   ------------------------------------------------------------ */
function computeProfile(goalId, selectedStyleIds, selectedWorkouts) {
  const goal = getGoal(goalId);
  if (!goal) return null;

  selectedStyleIds = selectedStyleIds || [];
  selectedWorkouts = selectedWorkouts || {};

  const weights = goal.weights;
  const requiredAdaptations = Object.keys(weights);

  // 1. Target points per required adaptation.
  const targets = {};
  requiredAdaptations.forEach(function (a) {
    targets[a] = weights[a] * POINTS_PER_STAR;
  });

  // 2. Sum style contributions across all adaptations.
  const earned = {};
  ADAPTATIONS.forEach(function (a) { earned[a] = 0; });

  selectedStyleIds.forEach(function (sid) {
    const style = getStyle(sid);
    if (!style) return;
    Object.keys(style.contribution).forEach(function (a) {
      earned[a] += style.contribution[a];
    });
  });

  // 3. Workout bonuses: each selected workout adds WORKOUT_BONUS
  //    to its parent style's primary adaptation. Only counts if the
  //    parent style is actually selected.
  Object.keys(selectedWorkouts).forEach(function (sid) {
    if (selectedStyleIds.indexOf(sid) === -1) return;
    const style = getStyle(sid);
    if (!style) return;
    const list = selectedWorkouts[sid] || [];
    earned[style.primary] += list.length * WORKOUT_BONUS;
  });

  // 4. Convert to coverage % per required adaptation, capped.
  //    Apply diminishing-returns curve so overlapping styles don't
  //    saturate every adaptation to 100%.
  const coverage = {};
  requiredAdaptations.forEach(function (a) {
    const target = targets[a];
    const effective = softStack(earned[a]);
    let pct = target > 0 ? (effective / target) * 100 : 0;
    if (pct > MAX_COVERAGE) pct = MAX_COVERAGE;
    coverage[a] = Math.round(pct);
  });

  // 5. Overall score: weighted average of coverage, weighted by
  //    the goal's star need for each adaptation.
  let weightedSum = 0;
  let weightTotal = 0;
  requiredAdaptations.forEach(function (a) {
    weightedSum += coverage[a] * weights[a];
    weightTotal += weights[a];
  });
  const overall = weightTotal > 0 ? Math.round(weightedSum / weightTotal) : 0;

  // 6. Weakest required adaptation (lowest coverage; tie -> higher star need first).
  let weakest = null;
  requiredAdaptations.forEach(function (a) {
    if (weakest === null) { weakest = a; return; }
    if (coverage[a] < coverage[weakest]) { weakest = a; }
    else if (coverage[a] === coverage[weakest] && weights[a] > weights[weakest]) { weakest = a; }
  });

  // 7. Recommendation: among UNSELECTED styles, find the one that
  //    contributes most to the weakest adaptation.
  let recommendation = null;
  if (weakest) {
    let best = null;
    let bestPoints = 0;
    STYLES.forEach(function (style) {
      if (selectedStyleIds.indexOf(style.id) !== -1) return;
      const pts = style.contribution[weakest] || 0;
      if (pts > bestPoints) { bestPoints = pts; best = style; }
    });
    if (best && bestPoints > 0) {
      recommendation = {
        adaptation: weakest,
        coverage: coverage[weakest],
        styleId: best.id,
        styleName: best.name,
        points: bestPoints
      };
    } else if (coverage[weakest] >= MAX_COVERAGE) {
      recommendation = { adaptation: weakest, coverage: coverage[weakest], styleId: null, complete: true };
    }
  }

  return {
    goalId: goalId,
    requiredAdaptations: requiredAdaptations,
    weights: weights,
    targets: targets,
    earned: earned,
    coverage: coverage,
    overall: overall,
    weakest: weakest,
    recommendation: recommendation
  };
}

/* ------------------------------------------------------------
   9. STATE + LOCALSTORAGE PERSISTENCE
   ------------------------------------------------------------ */
const STORAGE_KEY = 'training-matrix-state-v1';

const state = {
  step: 1,               // 1 goal, 2 styles, 3 workouts, 4 profile
  goalId: null,
  selectedStyleIds: [],
  selectedWorkouts: {}   // { styleId: [workoutName, ...] }
};

function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      step: state.step,
      goalId: state.goalId,
      selectedStyleIds: state.selectedStyleIds,
      selectedWorkouts: state.selectedWorkouts
    }));
  } catch (e) { /* storage unavailable; app still works in-session */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      state.step = parsed.step || 1;
      state.goalId = parsed.goalId || null;
      state.selectedStyleIds = Array.isArray(parsed.selectedStyleIds) ? parsed.selectedStyleIds : [];
      state.selectedWorkouts = parsed.selectedWorkouts && typeof parsed.selectedWorkouts === 'object' ? parsed.selectedWorkouts : {};
    }
  } catch (e) { /* corrupt or unavailable; start fresh */ }
}

function resetState() {
  state.step = 1;
  state.goalId = null;
  state.selectedStyleIds = [];
  state.selectedWorkouts = {};
  saveState();
}

/* ------------------------------------------------------------
   10. SMALL DOM HELPERS
   ------------------------------------------------------------ */
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/* Build a star rating element (filled + empty), accessible. */
function starsEl(rating, max) {
  max = max || 5;
  const wrap = el('span', 'stars');
  wrap.setAttribute('role', 'img');
  wrap.setAttribute('aria-label', rating + ' out of ' + max + ' stars');
  for (let i = 1; i <= max; i++) {
    const star = el('span', 'star' + (i <= rating ? ' star--on' : ''));
    star.setAttribute('aria-hidden', 'true');
    star.textContent = '\u2605'; // solid star char, styled by CSS colour
    wrap.appendChild(star);
  }
  return wrap;
}

/* ------------------------------------------------------------
   11. RENDERING
   The app renders one step into #screen, plus a persistent
   stepper and footer action bar.
   ------------------------------------------------------------ */
let screen, stepper, actionBar;

function renderStepper() {
  clear(stepper);
  const labels = ['Goal', 'Styles', 'Workouts', 'Profile'];
  for (let i = 0; i < labels.length; i++) {
    const n = i + 1;
    const item = el('div', 'stepper__item' +
      (n === state.step ? ' is-active' : '') +
      (n < state.step ? ' is-done' : ''));
    const dot = el('span', 'stepper__dot', n < state.step ? '\u2713' : String(n));
    const lab = el('span', 'stepper__label', labels[i]);
    item.appendChild(dot);
    item.appendChild(lab);
    item.setAttribute('aria-current', n === state.step ? 'step' : 'false');
    // Allow tapping a completed/earlier step to jump back.
    if (n < state.step) {
      item.classList.add('is-clickable');
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.addEventListener('click', function () { goToStep(n); });
      item.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goToStep(n); }
      });
    }
    stepper.appendChild(item);
    if (i < labels.length - 1) stepper.appendChild(el('span', 'stepper__line'));
  }
}

/* ---- Step 1: Goal selection ---- */
function renderGoalStep() {
  const frag = document.createDocumentFragment();
  const head = el('div', 'screen__head');
  head.appendChild(el('h1', 'screen__title', 'What are you training for?'));
  head.appendChild(el('p', 'screen__sub', 'Pick one goal. The app builds the adaptation targets around it.'));
  frag.appendChild(head);

  const list = el('div', 'card-list');
  GOALS.forEach(function (goal) {
    const card = el('button', 'card card--goal' + (state.goalId === goal.id ? ' is-selected' : ''));
    card.type = 'button';
    card.setAttribute('aria-pressed', state.goalId === goal.id ? 'true' : 'false');

    const top = el('div', 'card__top');
    top.appendChild(el('span', 'card__title', goal.name));
    const check = el('span', 'card__check');
    check.setAttribute('aria-hidden', 'true');
    check.textContent = '\u2713';
    top.appendChild(check);
    card.appendChild(top);

    card.appendChild(el('p', 'card__desc', goal.desc));

    // Show top adaptation needs as a compact preview.
    const needs = el('div', 'need-preview');
    const sorted = Object.keys(goal.weights).sort(function (a, b) {
      return goal.weights[b] - goal.weights[a];
    }).slice(0, 3);
    sorted.forEach(function (a) {
      const chip = el('span', 'need-chip');
      chip.appendChild(el('span', 'need-chip__label', a));
      chip.appendChild(starsEl(goal.weights[a]));
      needs.appendChild(chip);
    });
    card.appendChild(needs);

    card.addEventListener('click', function () { selectGoal(goal.id); });
    list.appendChild(card);
  });
  frag.appendChild(list);
  clear(screen);
  screen.appendChild(frag);
}

/* ---- Step 2: Training styles ---- */
function renderStyleStep() {
  const goal = getGoal(state.goalId);
  const frag = document.createDocumentFragment();
  const head = el('div', 'screen__head');
  head.appendChild(el('h1', 'screen__title', 'Choose your training styles'));
  head.appendChild(el('p', 'screen__sub',
    'Recommended styles for ' + goal.name + ' are pre-selected. Keep or remove any.'));
  frag.appendChild(head);

  const suit = GOAL_STYLE_SUITABILITY[state.goalId] || {};
  // Order styles by suitability descending.
  const ordered = STYLES.slice().sort(function (a, b) {
    return (suit[b.id] || 0) - (suit[a.id] || 0);
  });

  const list = el('div', 'card-list');
  ordered.forEach(function (style) {
    const selected = state.selectedStyleIds.indexOf(style.id) !== -1;
    const rating = suit[style.id] || 1;
    const card = el('div', 'card card--style' + (selected ? ' is-selected' : ''));

    const top = el('div', 'card__top');
    const titleWrap = el('div', 'card__titlewrap');
    titleWrap.appendChild(el('span', 'card__title', style.name));
    const srow = el('div', 'suit-row');
    srow.appendChild(el('span', 'suit-row__label', 'For this goal'));
    srow.appendChild(starsEl(rating));
    titleWrap.appendChild(srow);
    top.appendChild(titleWrap);

    // Toggle as an accessible switch.
    const toggle = el('button', 'toggle' + (selected ? ' is-on' : ''));
    toggle.type = 'button';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', selected ? 'true' : 'false');
    toggle.setAttribute('aria-label', (selected ? 'Remove ' : 'Add ') + style.name);
    toggle.appendChild(el('span', 'toggle__knob'));
    toggle.addEventListener('click', function () { toggleStyle(style.id); });
    top.appendChild(toggle);
    card.appendChild(top);

    card.appendChild(el('p', 'card__desc', style.desc));
    list.appendChild(card);
  });
  frag.appendChild(list);
  clear(screen);
  screen.appendChild(frag);
}

/* ---- Step 3: Workout selection ---- */
function renderWorkoutStep() {
  const frag = document.createDocumentFragment();
  const head = el('div', 'screen__head');
  head.appendChild(el('h1', 'screen__title', 'Pick your workouts'));
  head.appendChild(el('p', 'screen__sub',
    'Choose sessions under each style. Each one nudges that style\u2019s main adaptation a little higher.'));
  frag.appendChild(head);

  if (state.selectedStyleIds.length === 0) {
    const empty = el('div', 'empty');
    empty.appendChild(el('p', 'empty__text', 'No styles selected yet. Go back a step to add some.'));
    frag.appendChild(empty);
    clear(screen);
    screen.appendChild(frag);
    return;
  }

  // Render in the same suitability order as step 2 for consistency.
  const suit = GOAL_STYLE_SUITABILITY[state.goalId] || {};
  const ordered = state.selectedStyleIds.slice().sort(function (a, b) {
    return (suit[b] || 0) - (suit[a] || 0);
  });

  ordered.forEach(function (sid) {
    const style = getStyle(sid);
    if (!style) return;
    const group = el('section', 'wgroup');
    const ghead = el('div', 'wgroup__head');
    ghead.appendChild(el('span', 'wgroup__title', style.name));
    const chosen = (state.selectedWorkouts[sid] || []).length;
    const count = el('span', 'wgroup__count', chosen + ' selected');
    count.setAttribute('data-style', sid);
    ghead.appendChild(count);
    group.appendChild(ghead);

    const opts = el('div', 'wopts');
    (WORKOUTS[sid] || []).forEach(function (name) {
      const isOn = (state.selectedWorkouts[sid] || []).indexOf(name) !== -1;
      const chip = el('button', 'wchip' + (isOn ? ' is-on' : ''));
      chip.type = 'button';
      chip.setAttribute('aria-pressed', isOn ? 'true' : 'false');
      const tick = el('span', 'wchip__tick');
      tick.setAttribute('aria-hidden', 'true');
      tick.textContent = '\u2713';
      chip.appendChild(tick);
      chip.appendChild(el('span', 'wchip__label', name));
      chip.addEventListener('click', function () { toggleWorkout(sid, name); });
      opts.appendChild(chip);
    });
    group.appendChild(opts);
    frag.appendChild(group);
  });

  clear(screen);
  screen.appendChild(frag);
}

/* ---- Step 4: Profile ---- */
function renderProfileStep() {
  const goal = getGoal(state.goalId);
  const profile = computeProfile(state.goalId, state.selectedStyleIds, state.selectedWorkouts);

  const frag = document.createDocumentFragment();
  const head = el('div', 'screen__head');
  head.appendChild(el('h1', 'screen__title', 'Your training profile'));
  head.appendChild(el('p', 'screen__sub', 'Coverage of what ' + goal.name + ' demands.'));
  frag.appendChild(head);

  // Overall score ring/figure.
  const overall = el('div', 'overall');
  const score = el('div', 'overall__score');
  score.appendChild(el('span', 'overall__num', String(profile.overall)));
  score.appendChild(el('span', 'overall__pct', '%'));
  overall.appendChild(score);
  const olabel = el('div', 'overall__label');
  olabel.appendChild(el('span', 'overall__title', 'Overall coverage'));
  olabel.appendChild(el('span', 'overall__hint', 'Weighted by how much each quality matters to your goal.'));
  overall.appendChild(olabel);
  frag.appendChild(overall);

  // Per-adaptation bars.
  const bars = el('div', 'bars');
  profile.requiredAdaptations
    .slice()
    .sort(function (a, b) { return profile.weights[b] - profile.weights[a]; })
    .forEach(function (a) {
      const row = el('div', 'bar');
      const top = el('div', 'bar__top');
      const left = el('div', 'bar__left');
      left.appendChild(el('span', 'bar__name', a));
      left.appendChild(starsEl(profile.weights[a]));
      top.appendChild(left);
      top.appendChild(el('span', 'bar__pct', profile.coverage[a] + '%'));
      row.appendChild(top);

      const track = el('div', 'bar__track');
      const fill = el('div', 'bar__fill');
      const pct = profile.coverage[a];
      fill.style.width = pct + '%';
      if (pct < 50) fill.classList.add('bar__fill--low');
      else if (pct < 80) fill.classList.add('bar__fill--mid');
      else fill.classList.add('bar__fill--high');
      // Mark the weakest area.
      if (a === profile.weakest) row.classList.add('is-weak');
      track.appendChild(fill);
      row.appendChild(track);
      bars.appendChild(row);
    });
  frag.appendChild(bars);

  // Recommendation panel.
  const rec = el('div', 'rec');
  if (profile.recommendation && profile.recommendation.styleId) {
    const r = profile.recommendation;
    rec.appendChild(el('span', 'rec__tag', 'Biggest opportunity'));
    rec.appendChild(el('p', 'rec__text',
      'Your lowest coverage is ' + r.adaptation + ' at ' + r.coverage + '%. ' +
      'Add ' + r.styleName + ' to improve this area without rebuilding the whole programme.'));
    const add = el('button', 'btn btn--accent rec__btn', 'Add ' + r.styleName);
    add.type = 'button';
    add.addEventListener('click', function () {
      toggleStyle(r.styleId);
      goToStep(2);
    });
    rec.appendChild(add);
  } else {
    rec.classList.add('rec--complete');
    rec.appendChild(el('span', 'rec__tag', 'Well balanced'));
    rec.appendChild(el('p', 'rec__text',
      'Your selected styles already cover every quality this goal demands. Nice work.'));
  }
  frag.appendChild(rec);

  // Build-a-plan entry (optional next step). Defined in plan.js.
  if (typeof renderBuildPlanButton === 'function') {
    renderBuildPlanButton(frag);
  }

  // Restart link.
  const restart = el('button', 'btn btn--ghost restart', 'Start over');
  restart.type = 'button';
  restart.addEventListener('click', function () {
    resetState();
    render();
  });
  frag.appendChild(restart);

  // Link to saved plans, if any exist. Defined in plan.js.
  if (typeof renderViewPlansLink === 'function') {
    renderViewPlansLink(frag);
  }

  clear(screen);
  screen.appendChild(frag);
}

/* ------------------------------------------------------------
   12. ACTION BAR (Back / Continue)
   ------------------------------------------------------------ */
function renderActionBar() {
  clear(actionBar);

  // Back button (steps 2-4).
  if (state.step > 1) {
    const back = el('button', 'btn btn--ghost', 'Back');
    back.type = 'button';
    back.addEventListener('click', function () { goToStep(state.step - 1); });
    actionBar.appendChild(back);
  } else {
    actionBar.appendChild(el('span', 'actionbar__spacer'));
  }

  // Primary button (steps 1-3). Step 4 has its own controls.
  if (state.step < 4) {
    const primary = el('button', 'btn btn--primary', state.step === 3 ? 'See my profile' : 'Continue');
    primary.type = 'button';
    const enabled = canAdvance();
    primary.disabled = !enabled;
    primary.addEventListener('click', function () {
      if (canAdvance()) goToStep(state.step + 1);
    });
    actionBar.appendChild(primary);
  } else {
    actionBar.appendChild(el('span', 'actionbar__spacer'));
  }
}

function canAdvance() {
  if (state.step === 1) return !!state.goalId;
  if (state.step === 2) return state.selectedStyleIds.length > 0;
  if (state.step === 3) return true; // workouts optional
  return false;
}

/* ------------------------------------------------------------
   13. ACTIONS
   ------------------------------------------------------------ */
function selectGoal(goalId) {
  if (state.goalId === goalId) return;
  state.goalId = goalId;
  // Pre-select recommended styles for this goal.
  const suit = GOAL_STYLE_SUITABILITY[goalId] || {};
  state.selectedStyleIds = STYLES
    .filter(function (s) { return (suit[s.id] || 0) >= RECOMMEND_THRESHOLD; })
    .map(function (s) { return s.id; });
  // Reset workouts that no longer belong.
  pruneWorkouts();
  saveState();
  render();
}

function toggleStyle(styleId) {
  const idx = state.selectedStyleIds.indexOf(styleId);
  if (idx === -1) state.selectedStyleIds.push(styleId);
  else {
    state.selectedStyleIds.splice(idx, 1);
    delete state.selectedWorkouts[styleId]; // drop its workouts too
  }
  saveState();
  // Live recompute: re-render current step + action bar.
  render();
}

function toggleWorkout(styleId, name) {
  if (!state.selectedWorkouts[styleId]) state.selectedWorkouts[styleId] = [];
  const list = state.selectedWorkouts[styleId];
  const idx = list.indexOf(name);
  if (idx === -1) list.push(name);
  else list.splice(idx, 1);
  if (list.length === 0) delete state.selectedWorkouts[styleId];
  saveState();
  // Update only the count label + chip state to keep it snappy.
  updateWorkoutGroup(styleId);
}

function pruneWorkouts() {
  Object.keys(state.selectedWorkouts).forEach(function (sid) {
    if (state.selectedStyleIds.indexOf(sid) === -1) delete state.selectedWorkouts[sid];
  });
}

/* Light DOM update for a workout group without full re-render. */
function updateWorkoutGroup(styleId) {
  const count = screen.querySelector('.wgroup__count[data-style="' + styleId + '"]');
  if (count) {
    const n = (state.selectedWorkouts[styleId] || []).length;
    count.textContent = n + ' selected';
  }
  // Re-render workout step chips state cheaply by toggling classes.
  // Simpler + safe: just re-render the step.
  renderWorkoutStep();
}

function goToStep(n) {
  if (n < 1 || n > 4) return;
  // Guard forward moves.
  if (n > state.step && !canAdvance()) return;
  state.step = n;
  if (n === 3) pruneWorkouts();
  saveState();
  render();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ------------------------------------------------------------
   14. MASTER RENDER
   ------------------------------------------------------------ */
function render() {
  // Plan module can take over the whole view (setup, plan, list).
  // It sets planState.view; when active, it renders and we stop.
  if (typeof renderPlanView === 'function' && renderPlanView()) {
    return;
  }
  renderStepper();
  if (state.step === 1) renderGoalStep();
  else if (state.step === 2) renderStyleStep();
  else if (state.step === 3) renderWorkoutStep();
  else if (state.step === 4) renderProfileStep();
  renderActionBar();
}

/* ------------------------------------------------------------
   15. INIT
   ------------------------------------------------------------ */
function init() {
  screen = document.getElementById('screen');
  stepper = document.getElementById('stepper');
  actionBar = document.getElementById('actionbar');

  loadState();

  // Integrity guard: if loaded state is inconsistent, repair it.
  if (state.goalId && !getGoal(state.goalId)) resetState();
  if (!state.goalId && state.step > 1) state.step = 1;

  render();

  // Register service worker for PWA/offline.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./service-worker.js').catch(function () {
        /* registration failure is non-fatal */
      });
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
