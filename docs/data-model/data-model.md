## 3. Data Model

### 3.1 Conceptual Data Model and Standards Alignment

Significant effort has gone into aligning the data model with established soil data standards, to avoid reinvention and strengthen interoperability with institutional and research-grade soil information systems.

**ISO 28258 (Digital Exchange of Soil Data)** provides the conceptual backbone of the model, covering the explicit linkage between site, profile, horizon, and observation; harmonised sample and depth representation; a dedicated procedure entity; and horizon classification using WRB.

**MODUS** informed the design of the procedure entity, with particular attention to defining the minimum metadata required to describe a laboratory method meaningfully. The goal is that every reported value carries enough methodological context to be reusable by other scientists, laying the groundwork for future integration with analytical laboratories and guided interfaces where the system suggests compatible procedures based on the property being mapped.

**ANSIS** (Australian National Soil Information System) was reviewed as part of the broader standards landscape. While not directly adopted, it remains a valuable reference for future expansion, particularly for horizon-level descriptors such as soil colour, structural features, and field observations.

### 3.2 Physical Data Model

The SoilHive database schema is organised around five logical groups of tables, each serving a distinct purpose in the platform's data lifecycle.

**Dataset metadata** follows a schema designed to satisfy the requirements of multiple well-established standards simultaneously: DataCite, Schema.org, Dublin Core, and the NORAD metadata specification.

**Soil data entities** form the core of the schema, structured to represent the hierarchical complexity of soil observations:

- **Features** store spatial information from sampling sites, supporting both point and polygon geometries. A geometry hash column ensures uniqueness of each spatial location.
- **Layers** store attributes of each soil layer: minimum and maximum depth, license, horizon code, and sampling date, where available. A unique constraint across all these properties allows nulls while preventing duplicate records.
- **Dataset layers** act as a join table linking a feature and a layer to one or more datasets, and carry information on the soil property measured.
- **Observations** store one or more sample values per dataset layer in the standard unit of measurement, together with procedure metadata where available. An Entity-Attribute-Value (EAV) pattern is used to accommodate the wide variety of soil properties without a fixed column schema.

**Fixed vocabularies** are mostly static dimension tables that provide the controlled lists used throughout the platform:

- **Soil property categories** group properties into four classes: physical, chemical, biological, and derived.
- **Soil properties** contains a curated list of widely used properties drawn primarily from GloSIS, AGROVOC, ChEBI, and ENVO, each with an acronym and standard unit. The table supports a two-level hierarchy through a self-referencing parent property ID; child properties are collapsed under their parent in the platform interface.
- **Vocabulary** stores classified analytical methodology concepts used to populate the procedures table.
- **Procedures** stores the analytical methodology (a combination of concepts from the vocabulary table) for each soil property measurement.
- **Licenses** holds the list of supported licenses (short name, full name, and URL).
- **Unit conversions** stores conversion rules for the most widely used units across supported soil properties, supporting the data loading pipeline.

**Data loading tables** capture the state of the data loading process:

- **Files** records uploaded file information, including path, format, field names, and fields inferred at upload time (geometry field, sampling date field, depth field, etc.).
- **Data mappings** stores user input from the field mapping step as a JSONB object, with original field names as keys and standardised platform field names as values. Where a field maps to a soil property, the object also carries the original unit of measurement and procedure information.
- **Dataset file mappings** is a join table linking a dataset to one or more files via a data mapping record.

**Backend utility tables** support platform operation independently of soil data:

- **JSON storage** holds application configuration.
- **Data filters** persists user-selected filters: area of interest, soil properties, and depth ranges.

**Entity identifiers** follow a dual-key approach: all entities are identified internally by a UUID, and exposed externally via a human-readable slug derived from representative text properties. If the underlying properties change, the slug is regenerated and the old slug is stored in a slug history table, enabling proper redirect handling for outdated references. This applies to datasets, files, licenses, procedures, vocabularies, soil property categories, soil properties, and unit conversions.

Backend implementation uses TypeORM for standard database interactions, supplemented by GDAL and raw queries for bulk data loading and extraction. Schema versioning is managed through TypeORM migrations, which handle both schema updates and vocabulary seeding across platform releases.