/**** Amazon Aquifer System proxy: GRACE – GLDAS – JRC
      Better version (Amazon-safe)
      • No Sentinel-1 masking (too destructive in wet forest)
      • Conservative open-water removal using JRC occurrence only
      • Trend via Theil–Sen (ee.Reducer.sensSlope)
      • Realistic quality mask so you get coverage
      • Cheap debug layers: dyn_mask and qMask
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
  endDate:   ee.Date('2024-10-01'),

  // Keep this as a safety window for exports. Your plots use aquiferGeomSimple.
  amazonWindow: ee.Geometry.Rectangle([-80, -20, -45, 6], null, false),

  // JRC occurrence (percent of time pixel is water). Higher = stricter water masking.
  // 100 = only permanent water removed. 90 removes very frequently-water pixels too.
  occurrenceThreshold: 95,

  // Scales
  seriesScale: 150000,       // safe for charts
  exportScale: 60000,        // exports (GRACE is coarser anyway)
  displayScale: 300000,      // ultra-stable display

  trendStart: ee.Date('2003-01-01'),

  // Quality gates (Amazon-safe defaults)
  minObs: 18,
  minR2: 0.00,
  minCompleteness: 0.30,

  // Hotspot thresholds (cm/year)
  severeThr: -0.50,
  moderateThr: -0.20
};

Map.centerObject(aquiferGeomSimple, 4);
Map.addLayer(CONFIG.amazonWindow, {}, 'Amazon window');
Map.addLayer(aquiferGeomSimple, {}, 'Aquifer boundary');

// ------------------------------------------------------------
// 2) HELPERS
// ------------------------------------------------------------
function addMonthKeys(img) {
  var d = ee.Date(img.get('system:time_start'));
  return img.set('ym', d.format('YYYY-MM')).set('month', d.get('month'));
}

function monthlyMeanFrom3Hourly(ic, startDate, endDate, bands) {
  var nMonths = endDate.difference(startDate, 'month').round();
  var months = ee.List.sequence(0, nMonths.subtract(1));

  return ee.ImageCollection(months.map(function(m) {
    var start = startDate.advance(m, 'month');
    var end   = start.advance(1, 'month');
    var img = ic.filterDate(start, end).select(bands).mean();
    return img.set('system:time_start', start.millis());
  })).map(addMonthKeys);
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
    ee.Join.saveFirst('climImg').apply(col, clim,
      ee.Filter.equals({leftField:'month', rightField:'month'}))
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
    // now reduceResolution is legal
    .reduceResolution({
      reducer: ee.Reducer.mode(),
      maxPixels: 256,
      bestEffort: true
    })
    .reproject({crs: proj, scale: CONFIG.displayScale})
    .clip(aquiferGeomSimple)
    .rename(name);
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
// 4) GRACE
// ------------------------------------------------------------
var grace = ee.ImageCollection('NASA/GRACE/MASS_GRIDS_V04/MASCON')
  .filterDate(CONFIG.startDate, CONFIG.endDate)
  .select(['lwe_thickness','uncertainty'])
  .map(function(img){
    return ee.Image.cat([
      img.select('lwe_thickness').rename('tws_cm'),
      img.select('uncertainty').rename('tws_unc_cm')
    ]).copyProperties(img, img.propertyNames());
  })
  .map(addMonthKeys);

var GRACE_PROJ = ee.Image(grace.first()).select('tws_cm').projection();

// ------------------------------------------------------------
// 5) GLDAS monthly
// ------------------------------------------------------------
var gldas = ee.ImageCollection('NASA/GLDAS/V021/NOAH/G025/T3H')
  .filterDate(CONFIG.startDate, CONFIG.endDate);

// Soil (mm → cm)
var soilMonthly = monthlyMeanFrom3Hourly(
  gldas, CONFIG.startDate, CONFIG.endDate,
  ['SoilMoi0_10cm_inst','SoilMoi10_40cm_inst','SoilMoi40_100cm_inst','SoilMoi100_200cm_inst']
).map(function(img){
  var mm = img.reduce(ee.Reducer.sum()).rename('soil_mm');
  return mm.divide(10).rename('soil_cm')
    .copyProperties(img, img.propertyNames());
});

// Canopy (mm → cm)
var canopyMonthly = monthlyMeanFrom3Hourly(
  gldas, CONFIG.startDate, CONFIG.endDate,
  ['CanopInt_inst']
).map(function(img){
  return img.select('CanopInt_inst').divide(10).rename('canopy_cm')
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
  ee.Join.inner().apply(graceSoil, canopyMonthly, join)
).map(function(f){
  f = ee.Feature(f);
  return ee.Image(f.get('primary'))
    .addBands(ee.Image(f.get('secondary')).select('canopy_cm'));
});

// ------------------------------------------------------------
// 7) Mask (JRC-only, Amazon-safe)
// ------------------------------------------------------------
var matchedMasked = matched.map(function(img){
  var mask = jrcNonWaterMask().rename('dyn_mask');
  return img.addBands(mask);
});

// ------------------------------------------------------------
// 8) Residual storage proxy
// ------------------------------------------------------------
var storageCol = matchedMasked.map(function(img){
  var soil = img.select('soil_cm');
  var canopy = img.select('canopy_cm');
  var tws = img.select('tws_cm');

  var nonGw = soil.add(canopy).rename('non_gw_cm');
  var gws = tws.subtract(nonGw).rename('gws_residual_cm');

  var gwsM = gws.updateMask(img.select('dyn_mask'))
    .rename('gws_residual_masked_cm');

  return ee.Image.cat([
    tws, soil, canopy, nonGw, gws, gwsM
  ]).copyProperties(img, img.propertyNames());
});

// ------------------------------------------------------------
// 9) Deseasonalisation (masked residual)
// ------------------------------------------------------------
var ds = deseasonaliseByMonth(storageCol, 'gws_residual_masked_cm');
var storageDS = ds.ds;

// ------------------------------------------------------------
// 10) Regression collection
// ------------------------------------------------------------
var regCol = storageDS
  .filterDate(CONFIG.trendStart, CONFIG.endDate)
  .map(function(img){
    // Force a normal float type for homogeneity
    var t = ee.Image.constant(
      img.date().difference(CONFIG.trendStart, 'year')
    ).toFloat().rename('t');

    var y = img.select('gws_residual_masked_cm_ds')
      .toFloat()
      .rename('y');

    return t.addBands(y).copyProperties(img, ['system:time_start']);
  });
// ------------------------------------------------------------
// 11) Trend + confidence
// ------------------------------------------------------------
var sens = regCol.select(['t','y']).reduce(ee.Reducer.sensSlope());
var slope = sens.select('slope').rename('slope');
var offset = sens.select('offset');

var nObs = regCol.select('y').count().rename('nObs');
var yMean = regCol.select('y').mean();

var sse = regCol.map(function(img){
  var y = img.select('y');
  var yHat = offset.add(slope.multiply(img.select('t')));
  return y.subtract(yHat).pow(2);
}).sum();

var sst = regCol.map(function(img){
  var y = img.select('y');
  return y.subtract(yMean).pow(2);
}).sum();

var r2 = ee.Image(1).subtract(sse.divide(sst)).rename('r2');

var expectedMonths = ee.Number(CONFIG.endDate.difference(CONFIG.trendStart,'month')).add(1);
var completeness = nObs.divide(expectedMonths).rename('completeness');

// ------------------------------------------------------------
// 12) Quality mask + hotspot classes
// ------------------------------------------------------------
var qMask = nObs.gte(CONFIG.minObs)
  .and(r2.gte(CONFIG.minR2))
  .and(completeness.gte(CONFIG.minCompleteness));

var slopeQ = slope.updateMask(qMask);

var severe = slopeQ.lt(CONFIG.severeThr);
var moderate = slopeQ.gte(CONFIG.severeThr)
  .and(slopeQ.lt(CONFIG.moderateThr));

var hotspot = ee.Image(0)
  .where(moderate, 1)
  .where(severe, 2)
  .updateMask(qMask)
  .rename('hotspot');

// ------------------------------------------------------------
// 13) Ultra-stable display layers
// ------------------------------------------------------------
var hotspotDisp = cheapDisplay(hotspot, 'hotspot_disp', GRACE_PROJ);
var dynMaskDisp = cheapDisplay(matchedMasked.first().select('dyn_mask'), 'dyn_mask_disp', GRACE_PROJ);
var qMaskDisp = cheapDisplay(qMask.rename('qmask'), 'qmask_disp', GRACE_PROJ);

Map.addLayer(
  dynMaskDisp,
  {min:0, max:1, palette:['red','green']},
  'Dynamic mask (red masked, green kept)'
);

Map.addLayer(
  qMaskDisp,
  {min:0, max:1, palette:['red','green']},
  'Quality mask (red fails, green passes)'
);

Map.addLayer(
  hotspotDisp,
  {min:0, max:2, palette:['white','yellow','red']},
  'Hotspots (stable)'
);

// ------------------------------------------------------------
// 14) Safe charts
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
print(chart(storageCol, 'non_gw_cm', 'Near-surface storage (cm)'));
print(chart(storageCol, 'gws_residual_masked_cm', 'Subsurface residual proxy (cm)'));

print('Done (Amazon-safe).');

// ------------------------------------------------------------
// 15) EXPORTS (optional)
// ------------------------------------------------------------
Export.image.toDrive({
  image: ee.Image.cat([slopeQ, r2, nObs, completeness, hotspot]),
  description: 'Amazon_degradation_layers_amazon_safe',
  folder: 'GEE_GRACE_Amazon',
  region: CONFIG.amazonWindow,
  scale: CONFIG.exportScale,
  maxPixels: 1e13
});
