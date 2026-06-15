# Data Load

This page outlines some requirements and general indications to load data in a running SoilHive instance.


## Dataset metadata

The following information may be provided when creating a new dataset:
- Name: A concise, descriptive name of the dataset.
- Full name: Extended or formal name of the dataset.
- Version: Version of the dataset.
- Description: A brief description of the dataset, including content, purpose, methodology, soil properties, and temporal/geographic coverage.
- Author: Person or organization responsible for creating the dataset.
- Data producer: Organization responsible for generating or providing the data.
- Publication date: Date when the dataset was published or made available.
- Citation: Formal citation or bibliographic reference for the dataset.

## File upload

The files uploaded to load in the platform must meet the following requirements:

- Formats supported: `GeoJSON`, `GPKG`, `SHP`, `CSV`, `XLSX`, `GML`, `KML`, `GDB` (or `ZIP` containing any of the mentioned formats).
- If format is `SHP`, all Shapefile files must be zipped.
- If format is `XLSX`, then data must be in the **first sheet**.
- If file is `multi-layer GPKG`, then only the first layer with a supported geometry type (point or polygon/multipolygon) will be considered.
- A geometry (or latitude and longitude) field is required. Additional fields with the sampling date (in format `YYYY` or `YYYY-MM` or `YYYY-MM-DD`), upper and lower depth in cm (as integers) or a depth range (as a text field with integer values separated by character '-'), horizon code and license are recommended. If not supplied, there is an option to fill part of this information with fixed values in the dataset metadata in a posterior step.
- Soil data provided as one field per soil property, unit and procedure.
- A dataset may have several files.
- All files uploaded for a dataset need to have the same structure (same fields and datatypes).


## Data mapping

This step allows to map any given file to the SoilHive data model. 
For every field in the file, there will be an option to either:
- Map the field to a **standard soil property** - Selecting one of the soil properties from the vocabulary. An original unit of measurement may be added to enable data conversion to the standard unit. Additionally, optional information related to procedure may be provided:
    1. Sample pre-treatment: Physical or chemical preparation applied to the sample prior to analysis.
    2. Technique: High-level categorisation of how the reported value was obtained. One of:
        - Lab procedure: Laboratory analytical technique based on physical or chemical analysis of soil samples, including extraction, digestion, and instrumental measurement steps.
        - Spectral: Technique based on spectral or resonance measurements used to derive soil properties from their physical or chemical response to applied energy.
        - Calculated: The reported value is derived through mathematical formulas, statistical models, or process-based models using other measured or assumed input variables.
    3. Laboratory method: The named laboratory method or protocol used to generate the result, including standard protocols or digestion/combustion approaches where applicable.
    4. Extractant concentration: Concentration of the extraction solution.
    5. Extraction ratio: Soil-to-solution ratio or extraction mixture ratio used during the procedure
    6. Extraction base: Basis of the extraction ratio (mass/mass, volume/mass, or volume/volume).
    7. Measurement procedure: Technique, instrument, or procedure used to determine the soil property value.
    8. Limit of detection: The lowest concentration or amount of the target analyte that can be reliably distinguished from zero by the method used.
- Map the field to a **standard metadata** field - The system attempts to infer these mappings based on the field name. Supported fields are: *latitude*, *longitude*, *geometry*, *minimum depth*, *maximum depth*, *depth* (range of numeric values), *sampling date*, *license* and *horizon*.
- Ignore the field from loading to the platform (by leaving `Map to` empty).

## Data preview

Uploaded and mapped data will be rendered in this step. This preview provides an overview of the values that will be loaded into the system with some cleaning steps applied and soil property values converted to the standard unit of measurement for any given soil property. 
The table rendered preserves the structure of the uploaded file(s), one row per record.
This step allows to delete records (full table rows) to exclude them from the load into the platform.
The basic cleaning steps applied are:
- All negative depth values will be marked as `NULL`.
- All negative or 0 soil property values will be marked as `NULL` and skipped in the loading process.
- Soil property values for which the standard unit of measurement is `%` and their value (once converted from the original unit of measurement if applies) is above 100 will be marked as `NULL` and skipped in the loading process.
- Soil samples with value -999 are assumed to be below limit of detection and will be loaded as is, without applying conversion formulas.
- Soil property values are rounded to 3 decimals.