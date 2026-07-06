<img width="900" height="522" alt="image" src="https://github.com/user-attachments/assets/231002e6-3b9a-4b7c-b64b-0b984a0b629a" />

# SoilHive Core

SoilHive is an open-source, federated data infrastructure platform for global soil science, making soil datasets discoverable, interoperable, and machine-readable across institutions and geographies, developed by Varda Foundation.

## Why we built it

Soil data is abundant but siloed: collected by different institutions, at different resolutions, with different taxonomies, units, and depth conventions, and rarely published in a form that's actually machine-usable. Centralizing data into a repository doesn't fix this, the harmonization problem still sits unsolved underneath. At the same time, machine learning for soil property prediction, spectral sensor calibration, and soil carbon measurement for climate reporting and carbon markets all now depend on interoperable, queryable, well-documented data at scale. SoilHive is the infrastructure layer built to close that gap.

## What you can do with it

- **Discover what data already exists.** A geospatial search module lets you filter soil datasets by agroecological zone, land cover, soil property, and data type. Public datasets are browsable and downloadable directly; private ones are flagged as requestable, so you can initiate an access request without ever seeing the underlying data. Data owners retain full sovereignty, what's indexed is structured metadata, not the data itself.
- **Upload, harmonize, and clean your own data.** No need to hand-write conversion logic or reconcile schemas, the platform maps your fields to a standardized vocabulary, converts units automatically, and runs cleaning and validation checks before publication.
- **Export in the format you need.** Download results as CSV, XLSX, GeoJSON, or GeoPackage, with a consistent column structure across formats and properties.

## Getting started

- [Quickstart](docs/quickstart.md): How to run SoilHive Core in a Docker stack
- [Bare metal install](docs/bare-metal-install.md): How to setup and run platform without containerization
- [Authentication](docs/authentication.md): Modes and configuration
- [Frontend](docs/frontend.md): Running and developing the frontend
- [Backend](docs/backend.md): Running and developing the backend
- [Map based filters](docs/map-based-filters.md): How to install and activate the filters
- [Dependencies](docs/dependencies.md): List of 3rd party libraries used by the project

## Platform and data documentation

- [Data Management Portal](docs/data-management-portal.md): How to upload, map, clean, and publish a dataset
- [Data Model](docs/data-model.md): Standards alignment and physical database schema
- [Metadata Schema](docs/metadata-schema.md): Dataset-level metadata fields and standards compliance
- [Soil Property Vocabulary](docs/soil-property-vocabulary.md): Design principles and structure of the controlled vocabulary
- [Analytical Methodology Vocabulary](docs/analytical-methodology-vocabulary.md): Controlled terms describing how a reported value was produced
- [Unit Conversion Reference](docs/unit-conversion-reference.md): How original units are converted to SoilHive's standard units
- [Supported Licenses](docs/supported-licenses.md): Licenses recognized for published datasets
- [Data Output](docs/data-output.md): Structure and contents of downloaded data packages

For more details please visit each linked section above.

## Who it's for

- **Developers** building models, tools, dashboards, or applications on top of a well-documented, standards-aligned soil data infrastructure
- **Data contributors** anyone holding soil datasets who wants to publish, harmonize, and make them interoperable
- **Researchers and scientists** who need analysis-ready soil data instead of reconciling raw, inconsistent source files
- **National and regional soil data holders** looking to interconnect their data while retaining full control over access and licensing
- **Organizations working on climate adaptation, land degradation, and food security**, who need soil insight at scale

## Contributing

Please read our [contributor guidelines](CONTRIBUTING.md) if you would like to contribute to this repository.

## License

See [LICENSE](LICENSE) for the license governing this codebase.
