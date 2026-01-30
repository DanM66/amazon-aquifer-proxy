# Executive Summary

## Overview

This workflow provides a robust, Amazon-appropriate method for detecting long-term residual subsurface water decline using satellite observations. It integrates GRACE total water storage with GLDAS soil and canopy water to derive a residual storage signal that represents deeper and unmodelled water components not captured by GLDAS.

The workflow is designed to be stable, conservative, and scientifically defensible in the hydrologically complex Amazon Basin.

---

## Key Features

- Conservative JRC water-occurrence masking to avoid over-masking floodplain forests.
- Residual subsurface storage proxy computed as:
  residual = GRACE_TWS - (soil + canopy)
- Deseasonalised anomalies to remove strong Amazon seasonality.
- Robust Theil–Sen trend estimation.
- Quality control using observation count, R2, and completeness.
- Hotspot classification for moderate and severe residual subsurface decline.

---

## What the Results Mean

### Negative slopes
Indicate long-term decline in residual subsurface and unmodelled water storage.

### Hotspots
Highlight areas with consistent, meaningful decline:
- 0 = stable
- 1 = moderate decline
- 2 = severe decline

### Quality mask
Ensures only reliable pixels are interpreted.

### Time-series charts
Show how total, near-surface, and residual subsurface storage evolve over time.

---

## Applications

- Basin-scale hydrological monitoring
- Environmental risk assessment
- Water-security planning
- Scientific reporting
- Policy and stakeholder communication

---

## Limitations

- The residual is a proxy, not a direct measurement of groundwater.
- GRACE resolution is coarse; results are best interpreted regionally.
- In the Amazon, residual storage may include groundwater, deep unsaturated storage, floodplain storage, and other unmodelled components.

---

## Summary

This workflow provides a defensible, operational, and Amazon-safe method for tracking long-term changes in residual subsurface water storage. It supports evidence-based decision-making in one of the world’s most hydrologically complex regions without over-claiming groundwater specificity.
