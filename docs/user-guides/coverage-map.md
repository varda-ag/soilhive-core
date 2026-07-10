# Coverage Map

The coverage map is the hexagonal overlay shown on the map. It gives a quick visual answer to the question *"where is there soil data, and how rich is it?"*: each hexagon is coloured by a score called the **Data Availability Index (DAI)** that summarises how much meaningful soil data has been loaded for that area. Darker cells hold richer data.

This page explains what counts towards the score, how the score is calculated, and how to read the resulting map.


## What counts towards the score

- **Only data matching your active filter.** The score is computed within your current selection: soil properties, sampling date range, depth range, licenses, and data types all scope what is counted. Tightening a filter lowers scores; clearing it raises them.
- **Only published datasets.** Datasets still in draft or unpublished state are invisible to the coverage map.
- **Only point and polygonal datasets.** Raster datasets (continuous gridded products) do not contribute to the score, because their values are modelled surfaces rather than per-location samples. Raster *filters*, however, still apply: they restrict the area over which scores are computed.
- **Each sampling location lands in exactly one hexagon.** A location — including a polygonal one, such as a field — is assigned to the hexagon containing its centre point. A large field therefore colours a single cell, not every cell it overlaps.


## The formula

The score is first calculated per sampling location, then summed for every hexagon.

For each sampling location, four components are counted and added together:

```
score = soil properties
      + soil properties below 30 cm
      + dated layers
      + distinct sampling years
```

| Component | What is counted | What it rewards |
|---|---|---|
| **Soil properties** | The number of distinct soil properties measured at the location. A property measured at several depths or dates still counts once. | Breadth of characterisation — locations where many different properties were analysed. |
| **Soil properties below 30 cm** | The number of distinct soil properties measured in a layer whose lower depth exceeds 30 cm. | Subsoil coverage. Data below the conventional topsoil boundary is rarer and particularly valuable, for example for carbon stock assessment. |
| **Dated layers** | The number of distinct depth/date layers that carry a sampling date. | Sampling intensity with known provenance — every dated sampling slice adds to the score. |
| **Distinct sampling years** | The number of different calendar years in which the location was sampled. | Temporal coverage — locations revisited over multiple years score higher than one-off campaigns. |

Locations with no sampling dates still score through their soil properties — the two date-based components are simply zero. A location contributes only if at least one soil property matches the active filter.

The **hexagon score** is the sum of the scores of all sampling locations whose centre falls inside the hexagon. Areas dense with well-characterised locations therefore accumulate high scores.

### Worked example

A location was sampled in **2019** and **2021**, each time at two depths: 0–30 cm and 30–60 cm. The 0–30 cm samples were analysed for **pH** and **organic carbon**; the 30–60 cm samples for **organic carbon** only.

| Component | Count | Explanation |
|---|---|---|
| Soil properties | 2 | pH and organic carbon |
| Soil properties below 30 cm | 1 | only organic carbon was measured in the 30–60 cm layers |
| Dated layers | 4 | two depths × two sampling dates, all dated |
| Distinct sampling years | 2 | 2019 and 2021 |
| **Score** | **9** | 2 + 1 + 4 + 2 |

If this were the only location in its hexagon, the hexagon's score would be 9. A neighbouring hexagon containing three such locations would score 27.


## Reading the map

- **Colours are relative to the current view.** The colour scale stretches over the scores of the hexagons currently on screen: the darkest cells are the richest *in this view*, not richest in absolute terms. Panning or zooming can therefore change a cell's colour without any change in the underlying data.
- **Zoom changes the hexagon size.** Zooming out merges data into larger hexagons, so their scores grow as more locations fall into each cell; zooming in splits them apart again.
- **The legend is qualitative.** *Very low* to *High* describe a cell's score relative to the current view, not fixed thresholds.
- **Opacity** can be adjusted from the coverage map widget to balance the overlay against the base map.
