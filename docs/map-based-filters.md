# Map-Based Filters

Each filter provides **global coverage** and is distributed as a **separate package**, to be installed in a running SoilHive instance.

## Installation

1. Choose a filter and download the two related files: `<filter>.dump` and `<filter>.mappings`
2. Copy the two files inside the root folder of the running SoilHive instance
3. Open terminal inside SoilHive instance
4. Run command `node dist/app.js --load-raster-filter ./<filter>.dump`
5. Wait for the process to complete
6. Access SoilHive admin portal to confirm filter has been enabled

## Turning On/Off Installed Filters

Installing a filter (see above) is a one-time step that makes the filter **available** to the instance, or **active**. Whether an installed filter is actually **on** is controlled separately by a toggle in the admin portal — no CLI reload is needed to switch it on or off.

> **Prerequisite:** the filter must already be installed. The toggle only appears for filters that have been loaded via `--load-raster-filter`.

To turn on or off an installed filter:
1. Open the SoilHive admin portal and go to the **Map-based filters** page
2. Scroll to the **Activate the filters** list inside the **Activate the filters** section
3. Each filter shows its installation status (**Installed** or **Not installed**) next to a toggle switch
4. Flip the toggle to turn on or off the filter — the change is saved immediately (the toggle is briefly disabled while saving)

Turning a filter off does **not** uninstall it or delete its data; it only disables it. You can re-enable it at any time with the same toggle, without re-running the installation command.

### Available Filters

- Agroecological zones (37 MB)
  - https://static.soilhive.ag/map-based-filters/agroecological_zones.dump
  - https://static.soilhive.ag/map-based-filters/agroecological_zones.mappings
  - <details>
    <summary>Mappings</summary>

    | Category | Value |
    | -------- | -------- |
    | Tropical lowland semi-arid | 1 |
    | Tropical lowland sub-humid | 2 |
    | Tropical lowland humid | 3 |
    | Tropical highland semi-arid | 4 |
    | Tropical highland sub-humid | 5 |
    | Tropical highland humid | 6 |
    | Subtropical warm semi-arid | 7 |
    | Subtropical warm sub-humid | 8 |
    | Subtropical warm humid | 9 |
    | Subtropical moderately cool semi-arid | 10 |
    | Subtropical moderately cool sub-humid | 11 |
    | Subtropical moderately cool humid | 12 |
    | Subtropical cool semi-arid | 13 |
    | Subtropical cool sub-humid | 14 |
    | Subtropical cool humid | 15 |
    | Temperate moderate dry | 16 |
    | Temperate moderate moist | 17 |
    | Temperate moderate wet | 18 |
    | Temperate cool dry | 19 |
    | Temperate cool moist | 20 |
    | Temperate cool wet | 21 |
    | Boreal Cold no permafrost dry | 22 |
    | Boreal Cold no permafrost moist | 23 |
    | Boreal Cold no permafrost wet | 24 |
    | Dominantly very steep terrain | 25 |
    | Land with severe soil terrain limitations | 26 |
    | Land with ample irrigated soils | 27 |
    | Dominantly hydromorphic soil | 28 |
    | Desert Arid climate | 29 |
    | Boreal Cold with permafrost | 30 |
    | Arctic Very cold climate | 31 |

    </details>
- Agroecological zones v5 (37 MB)
  - https://static.soilhive.ag/map-based-filters/agroecological_zones_v5.dump
  - https://static.soilhive.ag/map-based-filters/agroecological_zones_v5.mappings
  - <details>
    <summary>Mappings</summary>

    | Category | Value |
    | -------- | -------- |
    | Tropics lowland; semi-arid | 1 | 
    | Tropics lowland; sub-humid | 2 | 
    | Tropics lowland; humid | 3 | 
    | Tropics highland; semi-arid | 4 | 
    | Tropics highland; sub-humid | 5 | 
    | Tropics highland; humid | 6 | 
    | Sub-tropics warm; semi-arid | 7 | 
    | Sub-tropics warm; sub-humid | 8 | 
    | Sub-tropics warm; humid | 9 | 
    | Sub-tropics moderately cool; semi-arid | 10 | 
    | Sub-tropics moderately cool; sub-humid | 11 | 
    | Sub-tropics moderately cool; humid | 12 | 
    | Sub-tropics cool; semi-arid | 13 | 
    | Sub-tropics cool; sub-humid | 14 | 
    | Sub-tropics cool; humid | 15 | 
    | Temperate moderate; dry | 16 | 
    | Temperate moderate; moist | 17 | 
    | Temperate moderate; wet | 18 | 
    | Temperate cool; dry | 19 | 
    | Temperate cool; moist | 20 | 
    | Temperate cool; wet | 21 | 
    | Cold no permafrost; dry | 22 | 
    | Cold no permafrost; moist | 23 | 
    | Cold no permafrost; wet | 24 | 
    | Dominantly very steep terrain | 25 | 
    | Land with severe soil/terrain limitations | 26 | 
    | Land with ample irrigated soils | 27 | 
    | Dominantly hydromorphic soils | 28 | 
    | Desert/Arid climate | 29 | 
    | Boreal/Cold climate | 30 | 
    | Arctic/Very cold climate | 31 | 
    | Dominantly built-up land | 32 | 
    | Dominantly water | 33 | 
    | No Data | 255 |

    </details>
- Land Cover 2019 (3.6 GB)
  - https://static.soilhive.ag/map-based-filters/land_cover.dump
  - https://static.soilhive.ag/map-based-filters/land_cover.mappings
  - <details>
    <summary>Mappings</summary>

    | Category | Value |
    | -------- | -------- |
    | Shrubs | 20 |
    | Unknown | 0 |
    | Oceans seas | 200 |
    | Snow and ice | 70 |
    | Moss and lichen | 100 |
    | Urban / built up | 50 |
    | Herbaceous wetland | 90 |
    | Open forest mixed | 125 |
    | Closed forest mixed | 115 |
    | Herbaceous vegetation | 30 |
    | Permanent water bodies | 80 |
    | Bare / sparse vegetation | 60 |
    | Open forest deciduous broad leaf | 124 |
    | Open forest evergreen broad leaf | 122 |
    | Open forest deciduous needle leaf | 123 |
    | Open forest evergreen needle leaf | 121 |
    | Closed forest deciduous broad leaf | 114 |
    | Closed forest evergreen broad leaf | 112 |
    | Closed forest deciduous needle leaf | 113 |
    | Closed forest evergreen needle leaf | 111 |
    | Cultivated and managed vegetation / agriculture | 40 |
    | Open forest not matching any of the other definitions | 126 |
    | Closed forest not matching any of the other definitions | 116 |

    </details>
- Land Cover 2024 (2.6 GB)
  - https://static.soilhive.ag/map-based-filters/land_cover_2024.dump
  - https://static.soilhive.ag/map-based-filters/land_cover_2024.mappings
  - <details>
    <summary>Mappings</summary>

    | Category | Value |
    | -------- | -------- |
    | Water | 1 |
    | Trees | 2 |
    | Flooded Vegetation | 4 |
    | Crops | 5 |
    | Built Area | 7 |
    | Bare Ground | 8 |
    | Snow/Ice | 9 |
    | Rangeland | 11 |

    </details>
- Soil Groups (30 MB)
  - https://static.soilhive.ag/map-based-filters/soil_groups.dump
  - https://static.soilhive.ag/map-based-filters/soil_groups.mappings
  - <details>
    <summary>Mappings</summary>

    | Category | Value |
    | -------- | -------- |
    | Acrisols | 6567 | 
    | Alisols | 6576 | 
    | Andosols | 6578 | 
    | Arenosols | 6582 | 
    | Anthrosols | 6584 | 
    | Chernozems | 6772 | 
    | Calcisols | 6776 | 
    | Cambisols | 6777 | 
    | Cryosols | 6782 | 
    | Fluvisols | 7076 | 
    | Ferralsols | 7082 | 
    | Glaciers | 7171 | 
    | Gleysols | 7176 | 
    | Gypsisols | 7189 | 
    | Histosols | 7283 | 
    | Kastanozems | 7583 | 
    | Leptosols | 7680 | 
    | Luvisols | 7686 | 
    | Lixisols | 7688 | 
    | Nitisols | 7884 | 
    | Phaeozem | 8072 | 
    | Planosols | 8076 | 
    | Plinthosols | 8084 | 
    | Podzols | 8090 | 
    | Regosols | 8271 | 
    | Retisols | 8284 | 
    | Solonchaks | 8367 | 
    | Solonetz | 8378 | 
    | Stagnosols | 8384 | 
    | Technosols | 8467 | 
    | Umbrisols | 8577 | 
    | Vertisols | 8682 |

    </details>

### Troubleshooting

- **Q**: *I run `--load-raster-filter` command but I received an error. How should I proceed?*
- **A**: You need administrator DB access to proceed. You can try following steps:
  - Check that SoilHive application DB user has permissions to create tables in the desired schema
  - Open a database client and search for the table named as the filter you are trying to install. Delete the table and retry running the command line command
