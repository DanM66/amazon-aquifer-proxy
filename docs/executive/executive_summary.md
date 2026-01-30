# Executive Summary

## Overview

This workflow provides a robust, Amazon‑appropriate method for detecting long‑term subsurface water decline using satellite observations. It integrates GRACE total water storage with GLDAS soil and canopy water to isolate a residual storage signal that represents deeper water components not captured by GLDAS.

The workflow is designed to be stable, conservative, and scientifically defensible in the hydrologically complex Amazon Basin.

---

## Key Features

- Conservative JRC water‑occurrence masking to avoid over‑masking floodplain forests.
- Subsurface storage proxy computed as:
  ```
  residual = GRACE_TWS - (soil + canopy)
  ```
- Deseasonalised anomalies to remove strong Amazon seasonality.
- Robust Theil–Sen trend estimation.
- Quality control using observation count, R2, and completeness.
- Hotspot classification for moderate and severe subsurface decline.

---

## What the Results Mean

### Negative slopes
Indicate long‑term subsurface water loss.

### Hotspots
Highlight areas with consistent, meaningful decline:
- 0 = stable
- 1 = moderate decline
- 2 = severe decline

### Quality mask
Ensures only reliable pixels are interpreted.

### Time‑series charts
Show how total, near‑surface, and subsurface storage evolve over time.

---

## Applications

- Aquifer and basin‑scale monitoring
- Environmental risk assessment
- Water‑security planning
- Scientific reporting
- Policy and stakeholder communication

---

## Limitations

- The residual is a proxy, not literal groundwater.
- GRACE resolution is coarse; results are best interpreted regionally.

---

## Summary

This workflow provides a defensible, operational, and Amazon‑safe method for tracking subsurface water degradation. It enables evidence‑based decisions in one of the world’s most hydrologically complex regions.

