# Data Management Portal

## Introduction

The SoilHive Data Management Portal gives anyone who owns soil data a straightforward way to upload, harmonise, and publish datasets in a standardised, interoperable format, with full control over who can access them.

Soil data has long suffered from fragmentation: datasets produced by different laboratories, projects, and countries rarely share a common vocabulary, unit system, or metadata structure, which makes them difficult to combine, compare, or put to full use for sustainable agriculture.

SoilHive addresses this by guiding users through a step-by-step workflow for loading data into the platform that requires no technical expertise. The workflow maps fields to a standardised vocabulary aligned with existing ontologies (GloSIS and AGROVOC), applies automatic unit conversions, and captures rich analytical metadata, giving every datapoint the context it needs to be genuinely useful for further analysis and decision-making.

### Who Is This Documentation For?

This documentation is intended for:

- Developers extending or integrating with the platform
- Scientists and data managers looking for a reference on the supported vocabulary, metadata schema, and unit conversion rules
- Data contributors uploading and publishing soil datasets

### Getting Started

1. Sign up to the platform.
2. Make sure you've been assigned the **Data Administrator** role. Only users with this role can load data into the platform.
3. Sign in to the platform, navigate to your profile, and select **Admin console**.
4. Open the **Data Publication** panel.
5. Click **Add a Dataset** in the top-right corner to begin.

What follows depends on the kind of file you uploaded, because vector data and raster data are described in different ways.

Once your data is loaded, you can publish it, either publicly or privately to selected users. Publication works the same way for both kinds of data and is described [below](#publication).

---

## How to Upload Data Into the Platform

### General Info — Describe the Dataset

Provide basic descriptive information about the dataset you're about to create. This forms the core of the metadata record; many additional fields are inferred automatically by the system, reducing the amount of manual input required.

The following fields are requested at this stage:

- **Name**: a concise, descriptive name for the dataset.
- **Full Name**: the extended or formal name of the dataset.
- **Description**: a brief description covering content, purpose, methodology, soil properties measured, and temporal and geographic coverage.
- **Author**: the person or organisation responsible for creating the dataset.

### Soil Data — Upload Your File(s)

Upload one or more files to associate with your dataset.

**Supported formats**

GeoJSON, GPKG, CSV, XLSX, GML, KML and KMZ are accepted as vector data and can be uploaded directly. Shapefiles and File Geodatabases are accepted only inside a ZIP: a shapefile needs all its associated files (`.shp`, `.shx`, `.dbf`, `.prj`) in one archive, and a `.gdb` is a folder rather than a file. A lone `.shp` or `.gdb` is rejected by the upload box, because a file picker cannot collect either in one selection. GeoTIFF (`.tif`, `.tiff`) is accepted as raster data, and must not be zipped.

The upload box lists the same set, and rejects anything else before the file leaves your browser.

The maximum size of a single upload is set by the platform administrator and is shown underneath the upload box. The same limit applies to every file the Admin console accepts, including the platform logo.

**One dataset holds one kind of data**

A dataset is either vector or raster, never both. The first file you upload decides which, and any later file of the other kind is rejected with a message saying so. The decision comes from reading the file rather than from its extension: SoilHive asks GDAL to describe every upload, and a file that reports raster bands is treated as raster.

**All files at once**

All files in one dataset must be loaded together. The platform does not currently support adding files to an existing dataset afterwards. Vector files carry the additional requirement that they all share an identical field structure (the same fields and the same data types), described in more detail in the [vector guide](1a-vector-data-ingestion.md#uploading-multiple-files).

**Coordinate Reference System**

After upload, the portal shows the coordinate reference system it read from each file, and asks you to supply one where it could not read any. Where the CRS comes from, whether you can override it, and whether the data is reprojected all differ between the two kinds of data:

- Vector data is always reprojected to EPSG:4326 (WGS 84) on load. See [Vector: coordinate reference system](1a-vector-data-ingestion.md#coordinate-reference-system).
- Raster data is kept in whatever CRS it arrives in, and is only reprojected where a specific output needs it. See [Raster: coordinate reference system](1b-raster-data-ingestion.md#coordinate-reference-system).

### The Remaining Steps

Continue in the guide for the kind of data you uploaded:

- **[Loading vector data](1a-vector-data-ingestion.md)**: field mapping, the cleaning rules applied at load, and the preview.
- **[Loading raster data](1b-raster-data-ingestion.md)**: band mapping, what the load does to your raster file, and what can make it fail.

Both end with the data in the SoilHive database and the dataset marked **Loaded**, ready to publish.

---

## Publication

Loading your data and publishing it are two separate things. Once the load finishes, the dataset exists in the SoilHive database but no one outside the Admin console can see it: it does not appear in the search results, on the map, in downloads, or in any statistics. **Publishing is the step that makes a dataset live.**

**Finding your dataset in the list**

Every dataset you have created is listed in the Admin console, with a status that tells you where it is in the process. Loaded datasets, the ones waiting to be published, are highlighted so they are easy to spot. You can search by name and filter by data type (Point, Polygonal, Raster) and by visibility (Public, Private).

| Status | What it means | What you can do |
|---|---|---|
| **Draft** | The dataset was created but the upload wizard was never completed | Edit (resumes the wizard at the furthest step you reached), Delete |
| **Loading** | The file is being processed and loaded | Wait for it to finish |
| **Loaded** | The data is in the database but is not visible to users | **Publish**, Delete |
| **Published** | The dataset is live | Edit (opens the settings page), Delete |

If something went wrong during loading, the row is marked with a warning icon and an **Error details** link that opens a summary of what failed and how to fix it. Deleting a dataset requires the delete entitlement, so the bin icon is not shown to every administrator.

**Dataset settings**

Clicking **Publish** on a Loaded dataset opens the *Dataset settings* page. Nothing is published until you confirm from this page, and the page has two sections.

*1. Metadata preview*

The **Check your metadata** link opens the dataset's public metadata page in a new tab. As an administrator you can edit each field directly on that page.

The metadata page is always visible to everyone, **even when the dataset is private**. That is intentional: people can discover that the data exists and see how it was produced, and then request access. Only the data itself is restricted.

Publishing is blocked until every mandatory metadata field is filled in. The **Publish** button stays disabled and a warning tells you what is missing. The mandatory fields are:

| Mandatory metadata | Notes |
|---|---|
| Name, Full name, Version, Description, Author | Name, Full name, Description and Author are collected in the General Info step; Version and the fields below are edited on the metadata page |
| Citation | How the dataset should be cited by whoever uses it |
| GIS data type | Point, Polygonal or Raster |
| Spatial resolution | Raster datasets only |
| Min and max soil depth | The depth range covered by the dataset |
| Reference coverage start and end | The period the measurements refer to |
| License | At least one |
| Variables measured | At least one soil property |

Several of these are filled in for you by the load. License is mandatory and never derived. For raster datasets in particular, spatial resolution, spatial extent, depth range, reference period and variables measured are all derived from the layers that were loaded. See [what the load writes at dataset level](1b-raster-data-ingestion.md#what-the-load-writes-to-the-dataset).

*2. Data visibility*

Choose one of the two cards:

| Choice | Who can see the metadata | Who can preview and download the data |
|---|---|---|
| **Public dataset** | Everyone | Everyone, subject to the license terms you specify |
| **Private dataset** | Everyone | Data administrators, plus the users you list explicitly |

Choosing **Private** opens the *Who can access this dataset* panel, where you add the email addresses of the people allowed in. Each address you add is granted preview and download rights on this dataset only. The list is saved as a whole when you publish: whatever is on screen replaces the previous list, so removing an address here revokes that person's access.

> **Note:** Granting access by email only works if your platform signs users in with an identifiable email address. If it doesn't, the panel is disabled and a warning explains that no one on the list will actually be granted access, and a private dataset then stays restricted to data administrators. Contact your platform administrator if per-user access is required.

**Confirming publication**

Press **Publish** to confirm. If the platform has no Terms & Conditions and Privacy Policy configured, a dialog warns you first: a dataset license covers the data, but not how users of the platform may access, use, and handle it. You can either cancel and configure those documents (see the Look & Feel section of the Admin console) or proceed anyway.

On confirmation the platform sets the status to **Published**, records today's date as the publication date (only the first time, so re-publishing later does not overwrite the original date), saves the access list if the dataset is private, and returns you to the dataset list.

**After publication**

The dataset is now included in everything the consumer portal does: search, preview, downloads. Only published datasets are ever returned by these queries.

Publication is not final. Clicking the edit icon on a published dataset takes you straight back to the same settings page, where you can correct metadata, switch between public and private, or change who has access. Press **Publish** again to save your changes. There is no separate "unpublish" action: to withdraw a dataset from circulation, either switch it to private or delete it.
