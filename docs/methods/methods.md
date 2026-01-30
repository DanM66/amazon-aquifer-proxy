# Methods

## 1. Data Sources

This workflow uses three satellite-based datasets to construct a subsurface water-storage proxy for the Amazon Basin:

### GRACE MASCON v04
- Monthly total water storage anomalies (TWS)
- Uncertainty fields
- April 2002 to October 2024

### GLDAS NOAH v2.1 (3-hourly)
- Soil moisture (0–200 cm across four layers)
- Canopy water storage

### JRC Global Surface Water v1.4
- Water occurrence (% of time a pixel is classified as water)
- Used for conservative open-water masking

All datasets are accessed through Google Earth Engine.

---

## 2. Study Area and Geometry Processing

- The workflow accepts either a geometry or a feature collection.
- The geometry is simplified using a 20 km tolerance for stable charting.
- A larger Amazon export window is defined for consistent raster exports.

This prevents memory errors while preserving spatial integrity.

---

## 3. GLDAS Preprocessing

### 3.1 Monthly Aggregation

GLDAS provides 3-hourly fields. For each month:

1. Filter all 3-hourly images within the month.
2. Compute the monthly mean for:
   - Soil moisture (0–10 cm)
   - Soil moisture (10–40 cm)
   - Soil moisture (40–100 cm)
   - Soil moisture (100–200 cm)
   - Canopy interception

### 3.2 Unit Conversion

GLDAS values are in millimetres:

```
cm = mm / 10
```

### 3.3 Near-Surface Storage

```
non_gw = soil_total + canopy
```

This represents near-surface water that must be removed from GRACE TWS to isolate deeper storage.

---

## 4. GRACE Preprocessing

GRACE MASCON monthly images are:

- Filtered to the same time window as GLDAS
- Renamed to:
  - tws_cm
  - tws_unc_cm
- Assigned:
  - ym (year-month string)
  - month (1–12)

These keys allow joining and deseasonalisation.

---

## 5. Temporal Harmonisation

GLDAS and GRACE are joined using an inner join on the `ym` key.

Each final monthly image contains:

- GRACE TWS
- Soil water
- Canopy water
- Temporal metadata

Only months present in both datasets are retained.

---

## 6. Open-Water Masking (Amazon-Safe)

A conservative JRC occurrence threshold is used:

```
mask = occurrence < 95%
```

Pixels with 95% or greater water occurrence are masked.

This removes persistent open water while retaining seasonally flooded forests.

---

## 7. Residual Storage Proxy

A subsurface storage proxy is computed:

```
gws_residual = GRACE_TWS - non_gw
```

A masked version is produced:

```
gws_residual_masked = gws_residual * JRC_mask
```

This residual represents deeper storage components not captured by GLDAS.

---

## 8. Deseasonalisation

To remove the strong Amazon seasonal cycle:

1. Compute a monthly climatology for each calendar month.
2. Subtract the climatology:

```
residual_ds = residual - climatology(month)
```

This isolates interannual variability and long-term trends.

---

## 9. Trend Estimation (Theil–Sen)

Trend analysis begins in January 2003.

For each pixel:

- t = years since trend start
- y = deseasonalised residual

A Theil–Sen slope is estimated, producing:

- Slope (cm/year)
- Intercept
- nObs (number of valid observations)
- R2
- Completeness (observed/expected months)

---

## 10. Quality Control

A pixel is considered reliable if:

```
nObs >= 18
R2 >= 0
completeness >= 0.30
```

Pixels failing any criterion are masked from trend and hotspot outputs.

---

## 11. Hotspot Classification

Quality-filtered slopes are classified as:

### Stable (0)
```
slope >= -0.20 cm/year
```

### Moderate decline (1)
```
-0.50 <= slope < -0.20 cm/year
```

### Severe decline (2)
```
slope < -0.50 cm/year
```

---

## 12. Visualisation

To ensure stable rendering:

- Layers are reprojected to the GRACE native grid
- Resolution is coarsened to 300 km
- Layers are clipped to the simplified aquifer geometry

---

## 13. Time-Series Analysis

For the aquifer geometry, monthly means are plotted for:

- GRACE TWS
- Near-surface storage
- Subsurface residual storage

---

## 14. Export

A multi-band raster is exported containing:

- Slope
- R2
- nObs
- Completeness
- Hotspot class

Exports use the Amazon window and a 60 km scale to match GRACE resolution.

