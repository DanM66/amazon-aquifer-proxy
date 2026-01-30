# Amazon Aquifer System Proxy: GRACE–GLDAS Residual Storage Workflow

This repository implements an Amazon-safe workflow for estimating **subsurface and unmodelled water-storage trends** using GRACE Total Water Storage (TWS), GLDAS soil and canopy water, and a conservative JRC surface-water mask. The workflow produces deseasonalised residual storage anomalies, robust Theil–Sen trends, quality metrics, and hotspot classifications.

## Overview

The script:
- Aggregates 3-hourly GLDAS data to monthly soil and canopy water.
- Harmonises GRACE and GLDAS using year-month keys.
- Computes a subsurface storage proxy:  
  **Residual = GRACE TWS − (Soil + Canopy)**.
- Applies a conservative JRC occurrence mask (≥95% water removed).
- Deseasonalises the residual signal by month.
- Computes Theil–Sen trends (cm/year) and confidence metrics.
- Applies quality gates (nObs, R², completeness).
- Classifies moderate and severe degradation hotspots.
- Produces stable display layers and time-series charts.
- Exports slope, R², nObs, completeness, and hotspot layers.

## Why This Workflow

Amazon hydrology is challenging:
- Dense forest and floodplains confuse radar-based masks.
- GRACE is coarse and must be handled carefully.
- GLDAS provides near-surface components needed to isolate **deeper and poorly modelled storage**.
- Seasonal cycles dominate the signal and must be removed.
- Trends require robust, outlier-resistant methods.

This workflow is designed to be:
- **Amazon-safe** (minimal destructive masking)
- **Memory-safe** (coarse projections for display)
- **Scientifically defensible** (Theil–Sen, deseasonalisation)
- **Operationally stable** (quality gates, completeness checks)

## Outputs

### Pixel-wise layers
- `slopeQ` — Theil–Sen slope (cm/year), quality-masked  
- `r2` — Coefficient of determination  
- `nObs` — Number of valid monthly observations  
- `completeness` — Fraction of expected months present  
- `hotspot` — 0 = none, 1 = moderate, 2 = severe decline  

### Display layers
- Dynamic mask (JRC)
- Quality mask
- Hotspot map (stable projection)

### Time-series charts
- GRACE TWS anomaly  
- Near-surface storage (soil + canopy)  
- Subsurface residual storage proxy

## Documentation

- [Scientific Methods](docs/methods/methods.md)
- [Stakeholder Narrative](docs/stakeholder/narrative.md)
- [Executive Summary](docs/executive/executive_summary.md)

## Interpretation

- **Residual storage** represents subsurface and unmodelled components of terrestrial water storage, not a direct groundwater measurement.  
- **Negative slopes** indicate long-term decline in residual storage relative to near-surface components.  
- **Hotspots** highlight areas of persistent subsurface or unmodelled storage decline and are intended for screening and prioritisation.  
- **Quality masking** ensures only statistically supported trends are interpreted.

In humid, floodplain-dominated environments such as the Amazon, the residual signal may include contributions from groundwater, deep unsaturated zone storage, seasonally inundated floodplains, and scale-mismatch effects between GRACE and land-surface models.

## Export

The script exports a multi-band image covering the Amazon window for GIS analysis and reporting.
