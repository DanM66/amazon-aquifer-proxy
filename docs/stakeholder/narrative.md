# Stakeholder Narrative

## Introduction

Understanding subsurface water change in the Amazon is difficult. The region is hydrologically complex, heavily forested, and dominated by seasonal flooding. Traditional groundwater monitoring is sparse, and satellite observations must be handled carefully to avoid misleading results. This workflow provides a practical, scientifically grounded way to monitor long‑term subsurface water trends using openly available satellite data.

The goal is not to estimate literal groundwater volumes, but to identify where deeper water storage is increasing, stable, or declining over time. This information supports environmental management, water‑security planning, and long‑term monitoring across the Amazon Basin.

---

## Why This Workflow Exists

The Amazon presents several challenges:

- GRACE satellites measure total water storage, not groundwater alone.
- GLDAS models near‑surface water but not deeper storage.
- Floodplain forests and wetlands confuse many masking approaches.
- Seasonal cycles dominate the hydrological signal.
- Data gaps and noise can distort trend estimates.

This workflow is designed specifically to address these challenges. It combines GRACE and GLDAS in a way that isolates a deeper storage signal, applies conservative masking to avoid removing valid pixels, and uses robust statistical methods to detect long‑term change.

---

## What the Workflow Produces

The workflow generates three main types of information:

### 1. Subsurface Storage Proxy
A monthly time series representing deeper water storage, derived by subtracting GLDAS near‑surface water from GRACE total water storage. This residual is not literal groundwater, but it reflects deeper hydrological behaviour.

### 2. Long‑Term Trends
A Theil–Sen trend is calculated for each pixel, showing whether subsurface storage is increasing, stable, or declining. This method is resistant to noise and missing data.

### 3. Hotspot Classification
Pixels are classified into:
- 0 = stable
- 1 = moderate decline
- 2 = severe decline

Only pixels that pass quality checks are included.

---

## How to Interpret the Results

### Subsurface Storage Proxy
Represents deeper water components not captured by GLDAS. It shows how storage changes month to month and year to year.

### Trend Maps
Negative slopes indicate long‑term decline. Positive slopes indicate recovery or recharge. Trends should be interpreted at regional scales due to GRACE resolution.

### Hotspots
Highlight areas where subsurface decline is consistent and meaningful. These areas may warrant further investigation or monitoring.

### Quality Mask
Ensures that only reliable pixels are used. Areas failing quality checks should not be interpreted.

---

## What This Workflow Can Support

- Basin‑scale hydrological assessments
- Environmental risk analysis
- Water‑security planning
- Monitoring of long‑term degradation
- Scientific reporting and communication
- Policy and stakeholder engagement

It provides a consistent, repeatable, and transparent method for tracking subsurface water change across the Amazon.

---

## Limitations

- The residual is a proxy, not a direct measurement of groundwater.
- GRACE resolution is coarse; results are best interpreted regionally.
- Local hydrological processes may not be fully captured.
- The workflow identifies trends, not absolute volumes.

---

## Summary

This workflow offers a defensible, Amazon‑appropriate approach to monitoring subsurface water change. By combining GRACE, GLDAS, and conservative masking with robust statistical methods, it provides a clear picture of where deeper water storage is stable, improving, or declining. It is designed to support decision‑makers, researchers, and environmental managers who need reliable, basin‑scale indicators of hydrological change.

