# Amazon Aquifer System Proxy: GRACE–GLDAS Residual Storage Workflow

This repository implements an Amazon‑safe workflow for estimating subsurface water‑storage trends using GRACE TWS, GLDAS soil/canopy water, and a conservative JRC water mask. The workflow produces deseasonalised residual storage anomalies, robust Theil–Sen trends, quality metrics, and hotspot classifications.

## Overview

The script:
- Aggregates 3‑hourly GLDAS data to monthly soil and canopy water.
- Harmonises GRACE and GLDAS using year‑month keys.
- Computes a subsurface storage proxy:  
  **Residual = GRACE TWS − (Soil + Canopy)**.
- Applies a conservative JRC occurrence mask (≥95% water removed).
- Deseasonalises the residual signal by month.
- Computes Theil–Sen trends (cm/year) and confidence metrics.
- Applies quality gates (nObs, R², completeness).
- Classifies moderate and severe degradation hotspots.
- Produces stable display layers and time‑series charts.
- Exports slope, R², nObs, completeness, and hotspot layers.

## Why This Workflow

Amazon hydrology is challenging:
- Dense forest and floodplains confuse radar‑based masks.
- GRACE is coarse and must be handled carefully.
- GLDAS provides near‑surface components needed to isolate deeper storage.
- Seasonal cycles dominate the signal and must be removed.
- Trends require robust, outlier‑resistant methods.

This workflow is designed to be:
- **Amazon‑safe** (minimal destructive masking)
- **Memory‑safe** (coarse projections for display)
- **Scientifically defensible** (Theil–Sen, deseasonalisation)
- **Operationally stable** (quality gates, completeness checks)

## Outputs

### Pixel‑wise layers
- `slopeQ` — Theil–Sen slope (cm/year), quality‑masked  
- `r2` — Coefficient of determination  
- `nObs` — Number of valid monthly observations  
- `completeness` — Fraction of expected months present  
- `hotspot` — 0 = none, 1 = moderate, 2 = severe decline  

### Display layers
- Dynamic mask (JRC)
- Quality mask
- Hotspot map (stable projection)

### Time‑series charts
- GRACE TWS anomaly  
- Near‑surface storage (soil + canopy)  
- Subsurface residual proxy

## Documentation

- [Scientific Methods](../methods/methods.md)
- [Stakeholder Narrative](../stakeholder/narrative.md)
- [Executive Summary](../executive/executive_summary.md)


## Interpretation

- **Residual storage** is a proxy for deeper water storage, not literal groundwater.  
- **Negative slopes** indicate long‑term subsurface decline.  
- **Hotspots** highlight areas of consistent degradation.  
- **Quality mask** ensures only reliable pixels are interpreted.

## Export

The script exports a multi‑band image covering the Amazon window for GIS analysis and reporting.

