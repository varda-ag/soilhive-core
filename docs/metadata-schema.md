## 4. Metadata Schema

The SoilHive metadata schema is designed to be interoperable with the most widely used scientific metadata standards. Field naming may differ slightly from individual standards, but all essential information is captured to ensure compliance with:

- DataCite
- Dublin Core
- INSPIRE Directive
- Schema.org
- ISO 19115 (Geographic Information, Metadata)

The table below lists all metadata fields, their definitions, and how they are populated.

| # | Field Name | Definition | Source |
|---|---|---|---|
| 1 | Name | A concise, descriptive name of the dataset | User input |
| 2 | Full Name | Extended or formal name of the dataset | User input |
| 3 | Version | Version of the dataset | User input |
| 4 | Description | A brief description of the dataset, including content, purpose, methodology, soil properties, and temporal/geographic coverage | User input |
| 5 | Author | Person or organisation responsible for creating the dataset | User input |
| 6 | Data Producer | Organisation responsible for generating or providing the data | User input |
| 7 | Variable Measured | Soil properties or variables included in the dataset | System inferred |
| 8 | Soil Depth Explored (cm) | Depth interval(s) to which the data refer, in centimetres | System inferred |
| 9 | GIS Data Type | Type of spatial data (e.g. point, vector) | System inferred |
| 10 | Spatial Resolution | Spatial resolution of the dataset (e.g. 250 m, field level); empty for point datasets | N/A |
| 11 | Temporal Coverage Start | Start date of the reference period of the dataset | System inferred |
| 12 | Temporal Coverage End | End date of the reference period of the dataset | System inferred |
| 13 | Publication Date | Date when the dataset was published or made available | User input |
| 14 | Related Resource | A related dataset, publication, or webpage associated with the described dataset | User input |
| 15 | Processing Steps | Description of processing steps applied to the dataset | User input |
| 16 | Access URL | Online location where the dataset can be accessed or downloaded (e.g. API, WMS, WFS) | System assigned |
| 17 | License | Conditions governing access and use of the dataset | System inferred or user input |
| 18 | Citation | Formal citation or bibliographic reference for the dataset | User input |
| 19 | Status | Current status of the dataset (e.g. draft, published, deprecated) | System assigned |
| 20 | Created At | Timestamp when the dataset record was created | System assigned |
| 21 | Updated At | Timestamp when the dataset record was last updated | System assigned |
| 22 | Deleted At | Timestamp when the dataset record was deleted, if applicable | System assigned |
| 23 | ID | Unique identifier for the dataset; a persistent identifier where available, otherwise an internal UUID | System assigned |
| 24 | Slug | URL-friendly identifier for the dataset | System assigned |
| 25 | Geographical Extent | Spatial coverage of the dataset (e.g. EU, country, region, bounding box) | System inferred |
| 26 | Spatial Extent | Geospatial definition of the dataset extent (e.g. bounding box, geometry) | System inferred |
| 27 | N Observations | Number of point-based observations included in the dataset | System inferred |
| 28 | Created By | User or system that created the dataset record | System assigned |
| 29 | Updated By | User or system that last updated the dataset record | System assigned |
