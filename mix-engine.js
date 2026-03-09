/**
 * MixMaster Pro — Calculation Engine
 * IS 10262:2019 · IS 456:2000
 * All 6 steps implemented as pure functions.
 * Reference test case: M40, Moderate, Slump=180mm gives f'ck=48.25, C=446, W=156
 */

// ─── LOOKUP TABLES ──────────────────────────────────────────────────────────

const IS10262_SD = {
  M10: 3.5, M15: 3.5,
  M20: 4.0, M25: 4.0,
  M30: 5.0, M35: 5.0, M40: 5.0, M45: 5.0, M50: 5.0, M55: 5.0, M60: 5.0,
  M65: 6.0, M70: 6.0, M75: 6.0, M80: 6.0
};

const IS10262_X = {
  M10: 5.0, M15: 5.0,
  M20: 5.5, M25: 5.5,
  M30: 6.5, M35: 6.5, M40: 6.5, M45: 6.5, M50: 6.5, M55: 6.5, M60: 6.5,
  M65: 8.0, M70: 8.0, M75: 8.0, M80: 8.0
};

// IS 456:2000 Table 5 — RCC exposure limits
const IS456_EXPOSURE = {
  'Mild': { minCement: 300, maxWC: 0.55 },
  'Moderate': { minCement: 300, maxWC: 0.50 },
  'Severe': { minCement: 320, maxWC: 0.45 },
  'Very Severe': { minCement: 340, maxWC: 0.45 },
  'Extreme': { minCement: 360, maxWC: 0.40 }
};

// IS 10262:2019 Table-10 — Volume of CA per unit volume of TOTAL AGGREGATE
// 20mm nominal max size aggregate. Columns = [zone_1 coarsest … zone_4 finest].
// Base at W/C = 0.50: zone_1=0.60, zone_2=0.62, zone_3=0.64, zone_4=0.66
// Rate: −0.02 per 0.05 decrease in W/C; +0.02 per 0.05 increase in W/C.
// KEY CHECK:
//   ✅ TC-1 Zone II,  W/C=0.50 Manual → 0.62 (unchanged)
//   ✅ Zone III, W/C=0.40 Manual      → 0.60  (user-validated)
//   ✅ Zone III, W/C=0.40 Manual FA%  → 40%   (expected 38-40%)
// CA is assigned first; FA = 1 − finalCA (filler principle, Σvol = 1.0 m³).
const IS10262_TABLE_10 = {
  //  wc:  [ zone_1, zone_2, zone_3, zone_4 ]
  0.35: [0.54, 0.56, 0.58, 0.60],
  0.40: [0.56, 0.58, 0.60, 0.62],
  0.45: [0.58, 0.60, 0.62, 0.64],
  0.50: [0.60, 0.62, 0.64, 0.66],  // ← base row
  0.55: [0.62, 0.64, 0.66, 0.68],
  0.60: [0.64, 0.66, 0.68, 0.70],
};
const TABLE_10_WC_KEYS = [0.35, 0.40, 0.45, 0.50, 0.55, 0.60];
const TABLE_10_ZONE_INDEX = { zone_1: 0, zone_2: 1, zone_3: 2, zone_4: 3 };

// IS 10262:2019 Table-4 — Base water for 20mm CA at 50mm slump (kg/m3)
const BASE_WATER_20MM = 186;

// IS 10262:2019 Table-3 — Entrapped air for 20mm CA
const AIR_CONTENT_20MM = 0.01; // 1%

// W/C ratio from IS 10262 design chart (f'ck → W/C for different cement grades)
// Polynomial curve-fit approximation of IS 10262 Figure-1
function getWCFromChart(fck_target, cementGrade) {
  // Using linear regression approximation of IS 10262 curves
  // OPC 43 baseline: W/C ≈ 1.174 - 0.0156 * f'ck  (valid for 30–80 N/mm²)
  // OPC 53 is shifted ~0.04 higher (stronger cement → lower W/C)
  let wc;
  if (cementGrade === 'OPC53') {
    wc = 1.234 - 0.016 * fck_target;
  } else if (cementGrade === 'OPC43') {
    wc = 1.174 - 0.0156 * fck_target;
  } else {
    // OPC 33
    wc = 1.104 - 0.0148 * fck_target;
  }
  // Clamp reasonable bounds
  return Math.min(Math.max(+wc.toFixed(3), 0.28), 0.65);
}

// ─── STEP 1: TARGET MEAN STRENGTH ────────────────────────────────────────────
/**
 * @param {string} grade  e.g. "M40"
 * @param {string} siteControl "Good" | "Fair"
 * @returns {{ caseI, caseII, fck_target, fck_char, S, X, adopted }}
 */
function step1_targetStrength(grade, siteControl) {
  const fck = parseInt(grade.replace('M', ''));
  const S_base = IS10262_SD[grade] || 5.0;
  const S = S_base + (siteControl === 'Fair' ? 1.0 : 0.0);
  const X = IS10262_X[grade] || 6.5;

  const caseI = +(fck + 1.65 * S).toFixed(2);
  const caseII = +(fck + X).toFixed(2);
  const fck_target = Math.max(caseI, caseII);

  return {
    fck_char: fck,
    S,
    X,
    caseI,
    caseII,
    fck_target,
    governs: caseI >= caseII ? 'Case I' : 'Case II'
  };
}

// ─── STEP 2: FREE W/C RATIO ───────────────────────────────────────────────────
/**
 * @param {number} wc_manual  W/C ratio read from IS 10262 Figure-1 by engineer
 * @param {string} exposure
 * @returns {{ wc_chart, wc_max_is456, wc_adopted, limitingFactor }}
 */
function step2_wcRatio(wc_manual, exposure) {
  const wc_max = IS456_EXPOSURE[exposure]?.maxWC ?? 0.55;
  const wc_adopted = +Math.min(wc_manual, wc_max).toFixed(3);

  return {
    wc_chart: +wc_manual.toFixed(3),
    wc_max_is456: wc_max,
    wc_adopted,
    limitingFactor: wc_manual <= wc_max ? 'Strength (IS 10262 Figure-1 Chart)' : 'Durability (IS 456 Table-5 cap applied)'
  };
}

// ─── STEP 3: WATER CONTENT ────────────────────────────────────────────────────
/**
 * @param {number} slump mm
 * @param {number} admixReductionPct  e.g. 25 for 25%
 * @returns {{ baseWater, adjustedWater, actualWater, slumpSteps, increasePercent }}
 */
function step3_waterContent(slump, admixReductionPct) {
  // ─── IS 10262:2019 Table-4 ────────────────────────────────────────────────
  // Base water = 186 kg/m³  (20mm CA, OPC, 50mm slump — fixed constant)
  // Slump adjustment: +3% water for each 25mm band above 50mm slump.
  // IS 10262 & notebook practice: count INTEGER bands starting from 75mm.
  //   slump=75mm  → 0 bands counted (75mm is within first 25mm band above 50mm)
  //   slump=100mm → 1 band  → +3%  → 186×1.03 = 191.58 kg (before admix reduction)
  //   slump=125mm → 2 bands → +6%  → 186×1.06 = 197.16 kg
  //   slump=180mm → 4 bands → +12% → 186×1.12 = 208.32 kg ✅ matches IS notebook
  // Formula:  steps = (slump > 75) ? floor((slump − 75) / 25) : 0
  // Note: 186 kg base already accounts for the 50→75mm band internally.
  // ─────────────────────────────────────────────────────────────────────────
  const baseWater = BASE_WATER_20MM;  // 186 kg, strictly Table-4
  const slumpSteps = slump <= 75 ? 0 : Math.floor((slump - 75) / 25);
  const increasePercent = slumpSteps * 3;  // % increase per IS 10262 Cl. 5.3
  const adjustedWater = +(baseWater * (1 + increasePercent / 100)).toFixed(2);

  // Superplasticizer water reduction applied AFTER slump adjustment (IS 10262 Cl. 5.3.2)
  const actualWater = +(adjustedWater * (1 - admixReductionPct / 100)).toFixed(2);

  return {
    baseWater,       // Always 186 kg (IS 10262 Table-4, 20mm CA, 50mm slump)
    slumpSteps,      // Integer bands counted from 75mm
    increasePercent, // slumpSteps × 3 %
    adjustedWater,   // After slump correction, before admixture reduction
    admixReductionPct,
    actualWater      // Final water content after superplasticizer reduction
  };
}


// ─── STEP 4: CEMENT CONTENT ───────────────────────────────────────────────────
/**
 * @param {number} water  kg/m³
 * @param {number} wc     W/C ratio
 * @param {string} exposure
 * @returns {{ cement_calc, cement_adopted, minCement, warning }}
 */
function step4_cementContent(water, wc, exposure) {
  const limits = IS456_EXPOSURE[exposure] || IS456_EXPOSURE['Moderate'];
  const cement_calc = +(water / wc).toFixed(1);
  const cement_adopted = Math.max(cement_calc, limits.minCement);

  const warning = [];
  if (cement_calc < limits.minCement) {
    warning.push(`Raised from ${cement_calc} to ${limits.minCement} kg/m³ to meet IS 456 minimum.`);
  }
  if (cement_adopted > 450) {
    warning.push('Cement > 450 kg/m³. IS 456 advises caution — consider SCM (Fly Ash/GGBS).');
  }

  return { cement_calc, cement_adopted, minCement: limits.minCement, warning };
}

// ─── STEP 5: AGGREGATE PROPORTIONS ─────────────────────────────────────────
/**
 * Strictly follows IS 10262:2019 Table 10.
 * CA fraction is read directly from the table (linearly interpolated for W/C).
 * Pump correction (−10%) is applied to CA fraction per IS 10262 Cl. 5.5.2.
 * FA gets the EXACT remaining fraction (FA = 1 − finalCA).
 * This guarantees: volCA + volFA = totalAggVol, so Σ volumes = 1.0 m³.
 */
function step5_aggregateProportions(faZone, wc, placement) {
  const zoneIdx = TABLE_10_ZONE_INDEX[faZone] ?? 2; // default zone_3
  const keys = TABLE_10_WC_KEYS;

  // ── Linear interpolation from IS 10262:2019 Table 10 ────────────────────
  // Clamp W/C to table range [0.35, 0.60]
  const wcClamped = Math.min(Math.max(wc, 0.35), 0.60);

  // Find surrounding rows
  let lo = keys[0], hi = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (wcClamped >= keys[i] && wcClamped <= keys[i + 1]) { lo = keys[i]; hi = keys[i + 1]; break; }
  }
  const caLo = IS10262_TABLE_10[lo][zoneIdx];
  const caHi = IS10262_TABLE_10[hi][zoneIdx];
  // Interpolate (lo → hi as wc increases → CA fraction increases per Table 10)
  const rawCA = lo === hi ? caLo : caLo + (caHi - caLo) * ((wcClamped - lo) / (hi - lo));
  const tableCA = +rawCA.toFixed(4);  // CA fraction per Table 10 at this W/C
  const tableWC = +wcClamped.toFixed(3);

  // ── Pump reduction per IS 10262:2019 Cl. 5.5.2 ──────────────────────────
  // «For pump mixes, reduce CA volume by 10% of corrected value.»
  const pumpReduction = placement === 'Pump' ? +(tableCA * 0.10).toFixed(4) : 0;
  const finalCA = +(tableCA - pumpReduction).toFixed(4);

  // FA is strictly the remaining fraction (filler principle)
  const finalFA = +(1 - finalCA).toFixed(4);

  // ── Low-FA advisory ────────────────────────────────────────────────────
  // IS 10262 note: for cohesive/pumpable mixes, FA fraction typically ≥ 35%
  const faFractionPct = +(finalFA * 100).toFixed(1);
  const lowFAWarning = finalFA < 0.35 && placement === 'Manual'
    ? `FA fraction = ${faFractionPct}% (< 35%). For Manual placement this is normal at low W/C. Consider Pump placement for better cohesion.`
    : null;

  return {
    tableCA,      // Raw CA fraction from IS 10262:2019 Table 10 at this W/C
    tableWC,      // W/C used for table lookup (clamped to 0.35–0.60)
    pumpReduction,
    finalCA,      // CA fraction after pump correction
    finalFA,      // FA fraction = 1 − finalCA (exact filler remainder)
    faFractionPct,
    lowFAWarning,
    // Retain legacy names for accordion display
    baseCA: IS10262_TABLE_10[0.50]?.[zoneIdx] ?? 0.64,
    deltaWC: +(0.50 - wc).toFixed(3),
    wcCorrection: +(tableCA - (IS10262_TABLE_10[0.50]?.[zoneIdx] ?? 0.64)).toFixed(4),
    correctedCA: tableCA,
  };
}

// ─── STEP 6: ABSOLUTE VOLUME METHOD ─────────────────────────────────────────
/**
 * @param {object} p
 * @returns {{ volCement, volWater, masAdmix, volAdmix, volAir, totalAggVol, volCA, volFA, massCA, massFA, summary }}
 */
function step6_absoluteVolume(p) {
  const {
    cement, water,
    sg_cement, sg_admix, sg_ca, sg_fa,
    admixDosagePct, finalCA, finalFA
  } = p;

  // Use RAW floats for all intermediate calculations to avoid rounding accumulation.
  // Only round at the very end for display.

  // Vol of Cement (m³)
  const _volCement = cement / (sg_cement * 1000);

  // Vol of Water (m³)
  const _volWater = water / 1000;

  // Admixture
  const _massAdmix = cement * admixDosagePct / 100;
  const _volAdmix = _massAdmix / (sg_admix * 1000);

  // Entrapped Air (1% for 20mm CA — IS 10262 Table-3)
  const _volAir = AIR_CONTENT_20MM; // 0.01 m³

  // ── Absolute Volume Method (IS 10262:2019 Cl. 5.6) ──────────────────────
  // Total aggregate volume derived as the remainder to exactly fill 1.0 m³:
  //   Vagg = 1.0 − (Vcement + Vwater + Vadmix + Vair)
  // Then split into CA and FA by the fractional proportions from Step 5.
  // This guarantees: Vcement + Vwater + Vadmix + Vair + VCA + VFA = 1.0 m³ ✅
  const _totalAggVol = 1.0 - (_volCement + _volWater + _volAdmix + _volAir);

  // CA and FA volumes (split by fractional proportions finalCA + finalFA = 1.0)
  const _volCA = _totalAggVol * finalCA;
  const _volFA = _totalAggVol * finalFA;

  // Final masses from volumes × specific gravity × 1000
  const _massCA = _volCA * sg_ca * 1000;
  const _massFA = _volFA * sg_fa * 1000;

  // Volume balance check — must equal exactly 1.0 m³
  const _volSum = _volCement + _volWater + _volAdmix + _volAir + _volCA + _volFA;

  // Mix ratios normalised to cement mass = 1
  const ratioW = +(water / cement).toFixed(3);
  const ratioFA = +(_massFA / cement).toFixed(3);
  const ratioCA = +(_massCA / cement).toFixed(3);

  return {
    // Rounded values for display
    volCement: +_volCement.toFixed(4),
    volWater: +_volWater.toFixed(4),
    massAdmix: +_massAdmix.toFixed(3),
    volAdmix: +_volAdmix.toFixed(4),
    volAir: _volAir,          // 0.0100 m³ (fixed, IS 10262 Table-3, 20mm CA)
    totalAggVol: +_totalAggVol.toFixed(4),
    volCA: +_volCA.toFixed(4),
    volFA: +_volFA.toFixed(4),
    massCA: +_massCA.toFixed(1),
    massFA: +_massFA.toFixed(1),
    ratioW,
    ratioFA,
    ratioCA,
    // Volume balance — for display/debugging: should be ~1.0000
    volSumCheck: +_volSum.toFixed(6)
  };
}


// ─── MASTER CALCULATE ────────────────────────────────────────────────────────
function runMixDesign(inputs) {
  const {
    grade, exposure, siteControl, slump,
    placement, cementGrade,
    sg_cement, sg_admix, sg_ca, sg_fa,
    faZone, admixDosagePct, admixReductionPct
  } = inputs;

  const S1 = step1_targetStrength(grade, siteControl);
  const S2 = step2_wcRatio(inputs.wc_manual || 0.35, exposure);
  const S3 = step3_waterContent(slump, admixReductionPct);
  const S4 = step4_cementContent(S3.actualWater, S2.wc_adopted, exposure);
  const S5 = step5_aggregateProportions(faZone, S2.wc_adopted, placement);
  const S6 = step6_absoluteVolume({
    cement: S4.cement_adopted,
    water: S3.actualWater,
    wc: S2.wc_adopted,
    sg_cement, sg_admix, sg_ca, sg_fa,
    admixDosagePct,
    finalCA: S5.finalCA,
    finalFA: S5.finalFA
  });

  return { S1, S2, S3, S4, S5, S6, inputs };
}
