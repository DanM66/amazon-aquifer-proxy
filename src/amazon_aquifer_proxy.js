/**** Amazon Aquifer System proxy: GRACE (Gravity Recovery and Climate Experiment) – GLDAS (Global Land Data Assimilation System) – JRC (Joint Research Centre) 
      Better version (Amazon-safe) plus adaptation-defendable outputs (with SWE and volumetric change)
      • No Sentinel-1 masking (too destructive in wet forest)
      • Conservative open-water removal using JRC occurrence only
      • Deseasonalisation via monthly climatology subtraction
      • Trend via Theil–Sen (ee.Reducer.sensSlope)
      • Two-tier quality masks (coverage vs confidence)
      • Split-record stability layers (early vs late)
      • Simple slope signal-to-noise proxy using GRACE uncertainty
      • Volumetric change layer (km3/year) derived from slope and pixel area
      • Cheap debug layers: dyn_mask and quality masks
      • Robust end date cap to GRACE availability (prevents 2025+ failures)
      • Defensive monthly GLDAS aggregation (drops empty months without nulls)
      • Display layers unmasked to avoid translucency artefacts
      • Completeness calculation aligned with filterDate semantics (no +1)
****/

// ------------------------------------------------------------
// 0) USER INPUT
// ------------------------------------------------------------
var aquiferInput = aquiferFc;

var aquiferGeom = ee.Geometry(
  ee.Algorithms.If(
    ee.Algorithms.ObjectType(aquiferInput).compareTo('FeatureCollection').eq(0),
    ee.FeatureCollection(aquiferInput).geometry(),
    aquiferInput
  )
);

var aquiferGeomSimple = aquiferGeom.simplify(20000);

// ------------------------------------------------------------
// 1) CONFIG
// ------------------------------------------------------------
var CONFIG = {
  startDate: ee.Date('2002-04-01'),
  endDate:   ee.Date('2025-10-01'),  // Requested end date (will be capped to GRACE availability)

  // Safety window for exports. Plots use aquiferGeomSimple.
  amazonWindow: ee.Geometry.Rectangle([-80, -20, -45, 6], null, false),

  // JRC occurrence (percent of time pixel is water). Higher = stricter water masking.
  // 100 = only permanent water removed. 99 also effectively removes near-permanent water.
  occurrenceThreshold: 100,

  // Scales
  seriesScale: 150000,       // safe for charts
  exportScale: 60000,        // exports (GRACE is coarser anyway)
  displayScale: 300000,      // ultra-stable display

  trendStart: ee.Date('2003-01-01'),

  // Hotspot thresholds (cm/year)
  severeThr: -0.50,
  moderateThr: -0.20
};

// Two-tier quality gates for adaptation screening
var QA = {
  exploratory:  {minObs: 18, minR2: 0.00, minCompleteness: 0.30},
  conservative: {minObs: 60, minR2: 0.10, minCompleteness: 0.70}
};

Map.centerObject(aquiferGeomSimple, 4);
Map.addLayer(CONFIG.amazonWindow, {}, 'Amazon window (export region)');
Map.addLayer(aquiferGeomSimple, {}, 'Aquifer boundary (simplified)');

// ------------------------------------------------------------
// 2) HELPERS
// ------------------------------------------------------------
function addMonthKeys(img) {
  var d = ee.Date(img.get('system:time_start'));
  return img.set('ym', d.format('YYYY-MM')).set('month', d.get('month'));
}

// Defensive monthly mean aggregation: drops months with no source data (no null returns)
function monthlyMeanFrom3Hourly(ic, startDate, endDate, bands) {
  var nMonths = endDate.difference(startDate, 'month').round();
  var months = ee.List.sequence(0, nMonths.subtract(1));

  var out = ee.ImageCollection(months.map(function(m) {
    var start = startDate.advance(m, 'month');
    var end   = start.advance(1, 'month');

    var sub = ic.filterDate(start, end).select(bands);
    var n = sub.size();

    // If empty month, return fully masked dummy image (safe) + hasData flag for filtering.
    var mean = sub.mean();
    var img = ee.Image(ee.Algorithms.If(
      n.gt(0),
      mean,
      ee.Image.constant(0).updateMask(ee.Image.constant(0))
    ));

    return img
      .set('system:time_start', start.millis())
      .set('hasData', n.gt(0))
      .set('ym', start.format('YYYY-MM'))
      .set('month', start.get('month'));
  }))
  .filter(ee.Filter.eq('hasData', 1));

  return out;
}

function deseasonaliseByMonth(col, band) {
  col = ee.ImageCollection(col);

  var months = ee.Dictionary(col.aggregate_histogram('month')).keys()
    .map(function(k){ return ee.Number.parse(k); });

  var clim = ee.ImageCollection(months.map(function(m) {
    var subset = col.filter(ee.Filter.eq('month', m)).select(band);
    return subset.mean().rename('clim').set('month', m);
  }));

  var joined = ee.ImageCollection(
    ee.Join.saveFirst('climImg').apply(
      col, clim,
      ee.Filter.equals({leftField:'month', rightField:'month'})
    )
  );

  var ds = joined.map(function(img) {
    img = ee.Image(img);
    var raw = img.select(band);
    var climImg = ee.Image(img.get('climImg'));
    var out = raw.subtract(climImg.select('clim')).rename(band + '_ds');
    return img.addBands(out);
  });

  return {ds: ds, clim: clim};
}

function cheapDisplay(img, name, proj) {
  return ee.Image(img)
    .setDefaultProjection(proj)
    .reduceResolution({
      reducer: ee.Reducer.mode(),
      maxPixels: 256,
      bestEffort: true
    })
    .reproject({crs: proj, scale: CONFIG.displayScale})
    .clip(aquiferGeomSimple)
    .rename(name);
}

function makeQMask(nObs, r2, comp, gate) {
  return nObs.gte(gate.minObs)
    .and(r2.gte(gate.minR2))
    .and(comp.gte(gate.minCompleteness));
}

function classifyHotspot(slopeImg, qMaskImg, label) {
  var slopeQ = slopeImg.updateMask(qMaskImg);

  var severe = slopeQ.lt(CONFIG.severeThr);
  var moderate = slopeQ.gte(CONFIG.severeThr).and(slopeQ.lt(CONFIG.moderateThr));

  return ee.Image(0)
    .where(moderate, 1)
    .where(severe, 2)
    .updateMask(qMaskImg)
    .rename('hotspot_' + label);
}

// Build trend bundle for any date range on the deseasonalised residual band
function buildTrend(storageDS_in, startDate, endDate, label) {
  var reg = ee.ImageCollection(storageDS_in)
    .filterDate(startDate, endDate)
    .map(function(img){
      var t = ee.Image.constant(
        img.date().difference(startDate, 'year')
      ).toFloat().rename('t');

      var y = img.select('gws_residual_masked_cm_ds')
        .toFloat()
        .rename('y');

      return t.addBands(y).copyProperties(img, ['system:time_start']);
    });

  var sens = reg.select(['t','y']).reduce(ee.Reducer.sensSlope());
  var slope = sens.select('slope').rename('slope_' + label);
  var offset = sens.select('offset');

  var nObs = reg.select('y').count().rename('nObs_' + label);
  var yMean = reg.select('y').mean();

  // Pragmatic R2-like metric around the fitted line (stability indicator)
  var sse = reg.map(function(img){
    var y = img.select('y');
    var yHat = offset.add(sens.select('slope').multiply(img.select('t')));
    return y.subtract(yHat).pow(2);
  }).sum();

  var sst = reg.map(function(img){
    var y = img.select('y');
    return y.subtract(yMean).pow(2);
  }).sum();

  var r2 = ee.Image(1).subtract(
    sse.divide(sst.where(sst.eq(0), 1))
  ).rename('r2_' + label);

  // Completeness relative to expected monthly steps (aligned with filterDate end-exclusive)
  var expectedMonths = ee.Number(endDate.difference(startDate,'month')).max(1);
  var completeness = nObs.divide(expectedMonths).rename('completeness_' + label);

  return {
    slope: slope,
    r2: r2,
    nObs: nObs,
    completeness: completeness
  };
}

// ------------------------------------------------------------
// 3) JRC open-water mask (conservative)
// ------------------------------------------------------------
var jrcOcc = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence')
  .unmask(0);

// dyn_mask = 1 where we keep pixels, 0 where we mask them out
function jrcNonWaterMask() {
  return jrcOcc.gte(CONFIG.occurrenceThreshold).not();
}

// ------------------------------------------------------------
// 4) GRACE (robust end date cap)
// ------------------------------------------------------------
// First, get the last available GRACE timestamp
var grace_raw = ee.ImageCollection('NASA/GRACE/MASS_GRIDS_V04/MASCON')
  .filterDate(CONFIG.startDate, CONFIG.endDate)
  .select(['lwe_thickness','uncertainty']);

var graceLast = ee.Date(ee.Number(grace_raw.aggregate_max('system:time_start')));

// Cap requested end date to GRACE availability (no ee.Date.min() in GEE)
var END_EFFECTIVE = ee.Date(ee.Algorithms.If(
  ee.Date(CONFIG.endDate).millis().lte(graceLast.millis()),
  CONFIG.endDate,
  graceLast.advance(1, 'day')  // include last GRACE month safely
));

print('Requested end date', CONFIG.endDate);
print('GRACE last date', graceLast);
print('Effective end date (capped)', END_EFFECTIVE);

// Build GRACE collection using effective end date
var grace = ee.ImageCollection('NASA/GRACE/MASS_GRIDS_V04/MASCON')
  .filterDate(CONFIG.startDate, END_EFFECTIVE)
  .select(['lwe_thickness','uncertainty'])
  .map(function(img){
    return ee.Image.cat([
      img.select('lwe_thickness').rename('tws_cm'),
      img.select('uncertainty').rename('tws_unc_cm')
    ]).copyProperties(img, img.propertyNames());
  })
  .map(addMonthKeys);

print('GRACE image count', grace.size());

var GRACE_PROJ = ee.Image(grace.first()).select('tws_cm').projection();

// ------------------------------------------------------------
// 5) GLDAS monthly (includes SWE for Andean headwaters)
// ------------------------------------------------------------
var gldas = ee.ImageCollection('NASA/GLDAS/V021/NOAH/G025/T3H')
  .filterDate(CONFIG.startDate, END_EFFECTIVE);

print('GLDAS image count', gldas.size());
var gldasLast = ee.Date(ee.Number(gldas.aggregate_max('system:time_start')));
print('GLDAS last date', gldasLast);

// Soil (mm to cm)
var soilMonthly = monthlyMeanFrom3Hourly(
  gldas, CONFIG.startDate, END_EFFECTIVE,
  ['SoilMoi0_10cm_inst','SoilMoi10_40cm_inst','SoilMoi40_100cm_inst','SoilMoi100_200cm_inst']
).map(function(img){
  var mm = img.reduce(ee.Reducer.sum()).rename('soil_mm');
  return mm.divide(10).rename('soil_cm')
    .copyProperties(img, img.propertyNames());
});

// Canopy interception + Snow Water Equivalent (mm to cm)
var surfaceMonthly = monthlyMeanFrom3Hourly(
  gldas, CONFIG.startDate, END_EFFECTIVE,
  ['CanopInt_inst', 'SWE_inst']
).map(function(img){
  return img.divide(10).rename(['canopy_cm', 'swe_cm'])
    .copyProperties(img, img.propertyNames());
});

// ------------------------------------------------------------
// 6) Join GRACE + GLDAS by month
// ------------------------------------------------------------
var join = ee.Filter.equals({leftField:'ym', rightField:'ym'});

var graceSoil = ee.ImageCollection(
  ee.Join.inner().apply(grace, soilMonthly, join)
).map(function(f){
  f = ee.Feature(f);
  return ee.Image(f.get('primary'))
    .addBands(ee.Image(f.get('secondary')).select('soil_cm'));
});

var matched = ee.ImageCollection(
  ee.Join.inner().apply(graceSoil, surfaceMonthly, join)
).map(function(f){
  f = ee.Feature(f);
  return ee.Image(f.get('primary'))
    .addBands(ee.Image(f.get('secondary')).select(['canopy_cm', 'swe_cm']));
});

print('Matched months', matched.size());

// ------------------------------------------------------------
// 7) Mask (JRC-only, Amazon-safe)  (mask band added after join)
// ------------------------------------------------------------
var matchedMasked = matched.map(function(img){
  var mask = jrcNonWaterMask().rename('dyn_mask');
  return img.addBands(mask);
});

// ------------------------------------------------------------
// 8) Residual storage proxy (includes SWE)
// ------------------------------------------------------------
var storageCol = matchedMasked.map(function(img){
  var soil   = img.select('soil_cm');
  var canopy = img.select('canopy_cm');
  var swe    = img.select('swe_cm');
  var tws    = img.select('tws_cm');

  var nonGw = soil.add(canopy).add(swe).rename('non_gw_cm');
  var gws   = tws.subtract(nonGw).rename('gws_residual_cm');

  var gwsM = gws.updateMask(img.select('dyn_mask'))
    .rename('gws_residual_masked_cm');

  return ee.Image.cat([
    tws, img.select('tws_unc_cm'),
    soil, canopy, swe, nonGw, gws, gwsM,
    img.select('dyn_mask')
  ]).copyProperties(img, img.propertyNames());
});

print('Storage months', storageCol.size());

// ------------------------------------------------------------
// 9) Deseasonalisation (masked residual)
// ------------------------------------------------------------
var ds = deseasonaliseByMonth(storageCol, 'gws_residual_masked_cm');
var storageDS = ds.ds;

print('Deseasonalised months', storageDS.size());

// ------------------------------------------------------------
// 10) Full-period trend bundle
// ------------------------------------------------------------
var full = buildTrend(storageDS, CONFIG.trendStart, END_EFFECTIVE, 'full');

var slope_full = full.slope.rename('slope_cm_per_yr');
var r2_full    = full.r2.rename('r2_full');
var nObs_full  = full.nObs.rename('nObs_full');
var comp_full  = full.completeness.rename('completeness_full');

// ------------------------------------------------------------
// 11) Two-tier quality masks and hotspots
// ------------------------------------------------------------
var qMask_expl = makeQMask(nObs_full, r2_full, comp_full, QA.exploratory).rename('qmask_expl');
var qMask_cons = makeQMask(nObs_full, r2_full, comp_full, QA.conservative).rename('qmask_cons');

var hotspot_expl = classifyHotspot(slope_full, qMask_expl, 'expl');
var hotspot_cons = classifyHotspot(slope_full, qMask_cons, 'cons');

// Shortlist: where both tiers identify a hotspot (moderate or severe)
var hotspot_overlap = hotspot_expl.gt(0).and(hotspot_cons.gt(0))
  .rename('hotspot_overlap');

// ------------------------------------------------------------
// 12) Split-record stability
// ------------------------------------------------------------
var mid = ee.Date('2013-01-01');

var early = buildTrend(storageDS, CONFIG.trendStart, mid, 'early');
var late  = buildTrend(storageDS, mid, END_EFFECTIVE, 'late');

var slope_early = early.slope.rename('slope_early_cm_per_yr');
var slope_late  = late.slope.rename('slope_late_cm_per_yr');

var sign_agree = slope_early.gt(0).and(slope_late.gt(0))
  .or(slope_early.lt(0).and(slope_late.lt(0)))
  .rename('sign_agree');

var drying_stable = slope_early.lt(CONFIG.moderateThr)
  .and(slope_late.lt(CONFIG.moderateThr))
  .rename('drying_stable');

// ------------------------------------------------------------
// 13) Simple signal-to-noise proxy using GRACE uncertainty
// ------------------------------------------------------------
var tws_unc_mean = storageCol.select('tws_unc_cm').mean().rename('tws_unc_mean_cm');
var slope_snr = slope_full.abs()
  .divide(tws_unc_mean.where(tws_unc_mean.eq(0), 1))
  .rename('slope_snr');

// ------------------------------------------------------------
// 14) Ultra-stable display layers (unmasked for non-translucent rendering)
// ------------------------------------------------------------
var dynMaskDisp = cheapDisplay(matchedMasked.first().select('dyn_mask').unmask(0), 'dyn_mask_disp', GRACE_PROJ);

var qExplDisp = cheapDisplay(qMask_expl.unmask(0), 'qmask_expl_disp', GRACE_PROJ);
var qConsDisp = cheapDisplay(qMask_cons.unmask(0), 'qmask_cons_disp', GRACE_PROJ);

var hsExplDisp = cheapDisplay(hotspot_expl.unmask(0), 'hotspot_expl_disp', GRACE_PROJ);
var hsConsDisp = cheapDisplay(hotspot_cons.unmask(0), 'hotspot_cons_disp', GRACE_PROJ);
var hsOvDisp   = cheapDisplay(hotspot_overlap.unmask(0), 'hotspot_overlap_disp', GRACE_PROJ);

var stabDisp   = cheapDisplay(drying_stable.unmask(0), 'drying_stable_disp', GRACE_PROJ);

Map.addLayer(dynMaskDisp, {min:0, max:1, palette:['red','green']}, 'Dynamic mask (red masked, green kept)');

Map.addLayer(qExplDisp, {min:0, max:1, palette:['red','green']}, 'Quality mask (exploratory)');
Map.addLayer(qConsDisp, {min:0, max:1, palette:['red','green']}, 'Quality mask (conservative)');

Map.addLayer(hsExplDisp, {min:0, max:2, palette:['white','yellow','red']}, 'Hotspots (exploratory)');
Map.addLayer(hsConsDisp, {min:0, max:2, palette:['white','yellow','red']}, 'Hotspots (conservative)');

Map.addLayer(hsOvDisp, {min:0, max:1, palette:['white','blue']}, 'Hotspot overlap (shortlist)');
Map.addLayer(stabDisp, {min:0, max:1, palette:['white','purple']}, 'Drying stable (split-record)');

// Optional: view slope and signal-to-noise at display scale (unmasked for opaque rendering)
var slopeDisp = cheapDisplay(slope_full.unmask(0), 'slope_disp', GRACE_PROJ);
var snrDisp   = cheapDisplay(slope_snr.unmask(0), 'snr_disp', GRACE_PROJ);

Map.addLayer(slopeDisp, {min:-1, max:1, palette:['red','white','blue']}, 'Slope (cm/year, display)');
Map.addLayer(snrDisp,   {min:0,  max:1, palette:['white','black']}, 'Slope SNR proxy (display)');

// Optional: show where SWE matters (mean SWE)
var sweMeanDisp = cheapDisplay(storageCol.select('swe_cm').mean().unmask(0), 'swe_mean_disp', GRACE_PROJ);
Map.addLayer(sweMeanDisp, {min:0, max:10, palette:['white','cyan','blue']}, 'Mean SWE (cm, display)');

// ------------------------------------------------------------
// 15) Safe charts
// ------------------------------------------------------------
function chart(ic, band, title) {
  return ui.Chart.image.series({
    imageCollection: ic.select(band),
    region: aquiferGeomSimple,
    reducer: ee.Reducer.mean(),
    scale: CONFIG.seriesScale,
    xProperty: 'system:time_start'
  }).setOptions({title:title});
}

print(chart(storageCol, 'tws_cm', 'Total water storage anomaly (cm)'));
print(chart(storageCol, 'non_gw_cm', 'Near-surface storage proxy (cm)'));
print(chart(storageCol, 'gws_residual_masked_cm', 'Residual storage proxy (cm)'));
print(chart(storageDS,  'gws_residual_masked_cm_ds', 'Deseasonalised residual proxy (cm)'));

// ------------------------------------------------------------
// 16) VOLUMETRIC ANALYSIS (km3/year) and total over conservative QC
// ------------------------------------------------------------
var volSlope = slope_full
  .reproject(GRACE_PROJ)
  .divide(100)                     // cm/year to m/year
  .multiply(ee.Image.pixelArea())  // m/year * m2 = m3/year
  .divide(1e9)                     // m3/year to km3/year
  .rename('residual_storage_km3_yr');

var totalVolStats = volSlope.updateMask(qMask_cons).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: aquiferGeomSimple,
  scale: CONFIG.exportScale,
  maxPixels: 1e13
});

print('Annual residual storage change (km3/year) in conservative quality areas:', totalVolStats);

print('Done (Amazon-safe plus adaptation outputs, SWE + volumetric, robust end date).');

// ------------------------------------------------------------
// 17) EXPORTS
// ------------------------------------------------------------
Export.image.toDrive({
  image: ee.Image.cat([
    slope_full, r2_full, nObs_full, comp_full,
    qMask_expl, qMask_cons,
    hotspot_expl, hotspot_cons, hotspot_overlap,
    slope_early, slope_late, sign_agree, drying_stable,
    tws_unc_mean, slope_snr,
    volSlope
  ]),
  description: 'Amazon_adaptation_hotspots_v2',
  folder: 'GEE_GRACE_Amazon',
  region: CONFIG.amazonWindow,
  scale: CONFIG.exportScale,
  maxPixels: 1e13
});

// ------------------------------------------------------------
// LEGEND PANEL
// ------------------------------------------------------------
var legend = ui.Panel({
  style: {
    position: 'bottom-left',
    padding: '8px 10px',
    backgroundColor: 'rgba(255,255,255,0.9)'
  }
});

var legendTitle = ui.Label({
  value: 'Legend',
  style: {fontWeight: 'bold', fontSize: '14px', margin: '0 0 6px 0'}
});
legend.add(legendTitle);

function addLegendRow(color, label) {
  var row = ui.Panel({
    layout: ui.Panel.Layout.Flow('horizontal'),
    style: {margin: '0 0 4px 0'}
  });

  var box = ui.Label({
    style: {
      backgroundColor: color,
      padding: '8px',
      margin: '0 6px 0 0'
    }
  });

  var text = ui.Label({
    value: label,
    style: {fontSize: '12px'}
  });

  row.add(box).add(text);
  legend.add(row);
}

// Dynamic mask
legend.add(ui.Label({value: 'JRC Water Mask', style:{fontWeight:'bold', margin:'6px 0 2px 0'}}));
addLegendRow('green', 'Pixel retained');
addLegendRow('red',   'Masked (persistent open water)');

// Quality masks
legend.add(ui.Label({value: 'Quality Gates', style:{fontWeight:'bold', margin:'6px 0 2px 0'}}));
addLegendRow('green', 'Passes quality criteria');
addLegendRow('red',   'Fails quality criteria');

// Hotspots
legend.add(ui.Label({value: 'Hotspots (Trend)', style:{fontWeight:'bold', margin:'6px 0 2px 0'}}));
addLegendRow('white',  'No hotspot / insufficient quality');
addLegendRow('yellow', 'Moderate decline');
addLegendRow('red',    'Severe decline');

// Overlap shortlist
legend.add(ui.Label({value: 'Shortlist', style:{fontWeight:'bold', margin:'6px 0 2px 0'}}));
addLegendRow('blue', 'Identified by both exploratory and conservative gates');

// Stability
legend.add(ui.Label({value: 'Stability', style:{fontWeight:'bold', margin:'6px 0 2px 0'}}));
addLegendRow('purple', 'Consistent decline in early and late periods');

// Slope
legend.add(ui.Label({value: 'Slope (cm/year)', style:{fontWeight:'bold', margin:'6px 0 2px 0'}}));
addLegendRow('red',   'Negative (drying)');
addLegendRow('white', 'Near zero');
addLegendRow('blue',  'Positive (wetting)');

Map.add(legend);
