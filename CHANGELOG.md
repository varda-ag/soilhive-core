# Changelog

## 1.1.0 (2026-07-24)

## What's Changed
* fix(be): sp-5489 round raster nodata by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/734
* feat: storing logo bytes in json config by @svaccari in https://github.com/varda-ag/soilhive-core/pull/736


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v1.0.0...v1.1.0

## 1.0.0 (2026-07-23)

## What's Changed
* fix: sp-5288 missing visibility property in filter coverage endpoint response by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/582
* fix: geotiff file open from s3 by @svaccari in https://github.com/varda-ag/soilhive-core/pull/584
* fix: sp-5283 require at least one soil property mapping by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/585
* fix: sp-5287 orphan staging table cleanup by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/587
* fix: dataPreview cleaning by @d-rom in https://github.com/varda-ag/soilhive-core/pull/586
* feat: sp-5266 - datasets access filters by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/589
* fix: clear token with OIDC provider by @svaccari in https://github.com/varda-ag/soilhive-core/pull/591
* feat: sp-5292 - warning about row deletion during preview by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/592
* feat: sp-5053 - alert popup when leaving ingestion flow by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/590
* fix: sp-5253 uploading a polygon or search for a location doesn't work the second time by @cristbello in https://github.com/varda-ag/soilhive-core/pull/594
* feat: token iss by @svaccari in https://github.com/varda-ag/soilhive-core/pull/596
* chore(deps): update postgis/postgis:18-3.6 docker digest to 804c0a7 by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/588
* fix: sp-5299 - ui enhancement on the publication page by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/598
* fix(be): sp-5280 fix database creation by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/597
* fix(be): sp-SP-5280 remove gdal build from source by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/599
* feat: sp-5291 - docs links on ingestion steps by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/595
* feat: sp-5290 - metadata page last update by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/600
* feat: sp-5266 - datasets sidebar list item update by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/601
* feat: sp-5053 - leave ingestion popup turned on by default on edit by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/602
* fix: sp-5304 - mapping step only low level properties selection by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/603
* fix: sp-5301 - dataset general info description field limit by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/604
* fix: depth ranges mapping by @d-rom in https://github.com/varda-ag/soilhive-core/pull/605
* feat: performance suite by @svaccari in https://github.com/varda-ag/soilhive-core/pull/606
* feat: sp-5265 added optional related resources and preprocessing steps in metadata page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/607
* fix: update cursor creation to new logic in bulk-load job by @d-rom in https://github.com/varda-ag/soilhive-core/pull/608
* feat: new features in perf suite by @svaccari in https://github.com/varda-ag/soilhive-core/pull/610
* fix(be): sp-5321 fix Excel ingestion with lat/lon columns by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/609
* feat: sp-5265 added dirty state to en/dis-able save button by @cristbello in https://github.com/varda-ag/soilhive-core/pull/611
* fix: detail xlsx and GPKG constraints by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/613
* fix: expired token removal by @svaccari in https://github.com/varda-ag/soilhive-core/pull/614
* fix: explicit null check for metadata columns by @d-rom in https://github.com/varda-ag/soilhive-core/pull/615
* fix: sp-5177 raster download optimizations by @d-rom in https://github.com/varda-ag/soilhive-core/pull/612
* fix: sp-5326 exclude unavailable initialVisibleColumns from MultiSelect value by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/619
* fix: sp-5218 google tag manager not loading correctly and emitting analytics by @cristbello in https://github.com/varda-ag/soilhive-core/pull/618
* chore(deps): update postgis/postgis:18-3.6 docker digest to c48eb51 by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/616
* feat: added frontend feature flags by @svaccari in https://github.com/varda-ag/soilhive-core/pull/621
* feat(be): sp-5331 surface dataset ingestion errors by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/617
* fix(UI): sp-5341 fix mapping details placeholder by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/622
* fix: sp-5218 fixed cookie popup not affecting analytics and added them also on datasets routes by @cristbello in https://github.com/varda-ag/soilhive-core/pull/623
* fix: sp-5346 - private datasets are selecteble only for logged in users by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/626
* feat: data cleaning summary by @d-rom in https://github.com/varda-ag/soilhive-core/pull/624
* fix: sp-5337 - preview step horizontal scrollbar by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/627
* feat: sp-5332 surface dataset ingestion errors by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/625
* fix(be): sp-5332 improve ingestion flow messages in case of errors by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/628
* fix: sp-5340 license dropdown in metadata page unusable by @cristbello in https://github.com/varda-ag/soilhive-core/pull/629
* feat: storing user geometries in dedicated table by @svaccari in https://github.com/varda-ag/soilhive-core/pull/593
* fix: sp-5351 metadata link now opens in a new tab by @cristbello in https://github.com/varda-ag/soilhive-core/pull/630
* fix: soil export filename sanitizing, polygonal counts in ds list by @d-rom in https://github.com/varda-ag/soilhive-core/pull/631
* chore: add vocabulary items by @d-rom in https://github.com/varda-ag/soilhive-core/pull/620
* feat: refresh token on 401 by @svaccari in https://github.com/varda-ag/soilhive-core/pull/633
* fix: enable postgis_gdal_drivers in docker compose by @d-rom in https://github.com/varda-ag/soilhive-core/pull/635
* refactor: merging migrations by @svaccari in https://github.com/varda-ag/soilhive-core/pull/634
* fix: map min zoom level by @svaccari in https://github.com/varda-ag/soilhive-core/pull/638
* feat: sp-5334 mandatory metadata fields ux by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/632
* feat: sp-5352 made unpublished metadata page only accessible by admin by @cristbello in https://github.com/varda-ag/soilhive-core/pull/636
* chore(deps): update quay.io/keycloak/keycloak:latest docker digest to 9b03307 by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/637
* feat: storing email instead of sub by @svaccari in https://github.com/varda-ag/soilhive-core/pull/640
* fix: server side token from cookie by @svaccari in https://github.com/varda-ag/soilhive-core/pull/642
* feat: sp-5364 add updated-by column to datasets publication table by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/639
* chore(deps): update quay.io/keycloak/keycloak:latest docker digest to 20e96e4 by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/643
* chore(deps): update postgis/postgis:18-3.6 docker digest to db37d16 by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/645
* Feature/sp 5336 preview step summary by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/641
* fix: soil data preview caching by @svaccari in https://github.com/varda-ag/soilhive-core/pull/646
* fix: discard duplicate rows before duplicate cells, percentage units … by @d-rom in https://github.com/varda-ag/soilhive-core/pull/644
* feat: sp-5336 - accordion transition, infocard responsivness by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/648
* feat: sp-5333 dynamic download format options by dataset type by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/647
* fix: sp-5372 - dataset publication title on the subpages by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/649
* docs: added recommendations regarding infrastructure sizing by @robertoprato in https://github.com/varda-ag/soilhive-core/pull/564
* fix: update sanitizeField to comply with sqlite rules by @d-rom in https://github.com/varda-ag/soilhive-core/pull/652
* feat: loading plugins from config by @svaccari in https://github.com/varda-ag/soilhive-core/pull/650
* fix: sp-5387 include visibility in raster dataset response by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/651
* fix(fe): sp-5393 fix file-to-db job invocation by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/655
* feat: plugin support by @svaccari in https://github.com/varda-ag/soilhive-core/pull/654
* fix: sp-5333 align download dropdown by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/656
* feat: sp-5392 data cleaning fixes by @d-rom in https://github.com/varda-ag/soilhive-core/pull/658
* feat: removed email from required token claims by @svaccari in https://github.com/varda-ag/soilhive-core/pull/660
* fix: sp-5393 fix file status on error by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/662
* feat:sp-5392 data cleaning fixes by @d-rom in https://github.com/varda-ag/soilhive-core/pull/663
* fix: sp-5333 fix download dropdown by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/661
* feat: sp-5373 poll dataset publication page for live status updates by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/659
* fix: sp-5333 download typography by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/664
* chore: procedures data cleanup by @d-rom in https://github.com/varda-ag/soilhive-core/pull/665
* feat: sp-5388 raster downloads optimization by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/666
* feat: sp-5311 data cleaning OOB check fixes by @d-rom in https://github.com/varda-ag/soilhive-core/pull/668
* feat: sp-5314 - dai visualization settings and widget by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/667
* fix: null data in job, error messages by @svaccari in https://github.com/varda-ag/soilhive-core/pull/669
* fix: snap output bounds to the source pixel grid by @d-rom in https://github.com/varda-ag/soilhive-core/pull/671
* docs: sp-5400 docs for soil ingestion and data mapping by @cristbello in https://github.com/varda-ag/soilhive-core/pull/674
* feat: sp-5134 - dai visualization fixes by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/673
* feat: query optimizations, new queryDebugMiddleware by @svaccari in https://github.com/varda-ag/soilhive-core/pull/672
* chore(deps): update postgis/postgis:18-3.6 docker digest to f248a10 by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/675
* chore(deps): update quay.io/keycloak/keycloak:latest docker digest to 0aae0de by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/657
* feat: sp-5408 - enhancements to the dai implementation by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/676
* feat: cache layer by @svaccari in https://github.com/varda-ag/soilhive-core/pull/677
* feat: sp-5314-dai-widget-style-updates by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/678
* feat: sp-5314 - searchbar fix on mobile by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/679
* refactor: use standalone workflows by @Butterneck in https://github.com/varda-ag/soilhive-core/pull/670
* feat: sp-5405 hidden map attribution in mobile and thumbnail by @cristbello in https://github.com/varda-ag/soilhive-core/pull/681
* feat: sp-5406 show map's scale only when zooming in/out in mobile by @cristbello in https://github.com/varda-ag/soilhive-core/pull/682
* fix: dataset table sorting by @svaccari in https://github.com/varda-ag/soilhive-core/pull/684
* feat: sp-5165 - users are notified that raster preview is not supported by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/685
* fix: sp-5416 - dai selection is saved after the navigation by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/686
* perf: dai without filters precompute by @svaccari in https://github.com/varda-ag/soilhive-core/pull/683
* feat: sp-5404 added varda attribution in availability page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/688
* feat: sp-5414 - necessary changes to the metadata page by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/687
* fix: added conversion logic for rasterIngestService by @d-rom in https://github.com/varda-ag/soilhive-core/pull/692
* docs: update data-model documentation by @estermiglio in https://github.com/varda-ag/soilhive-core/pull/690
* feat: sp-4722 - drag n drop upload on the map by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/693
* perf: dai in-query aoi by @svaccari in https://github.com/varda-ag/soilhive-core/pull/694
* docs: coverage map by @svaccari in https://github.com/varda-ag/soilhive-core/pull/691
* fix: sp-5427 merge processing_steps fields by @d-rom in https://github.com/varda-ag/soilhive-core/pull/696
* docs: coverage by @svaccari in https://github.com/varda-ag/soilhive-core/pull/698
* fix: processing_steps update behavior, reference_period start and sto… by @d-rom in https://github.com/varda-ag/soilhive-core/pull/699
* fix: processing_steps type error by @d-rom in https://github.com/varda-ag/soilhive-core/pull/700
* feat: supporting visibility and data type filters by @svaccari in https://github.com/varda-ag/soilhive-core/pull/701
* feat: sp-5421 metadata page shows required fields by @cristbello in https://github.com/varda-ag/soilhive-core/pull/702
* docs: added details on scope for contributions by @robertoprato in https://github.com/varda-ag/soilhive-core/pull/697
* feat: sp-5421 fixed metadata toprow positioning by @cristbello in https://github.com/varda-ag/soilhive-core/pull/705
* fix: sp-5431 - failed job request issue by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/695
* fix: add laboratory_method information to raster layers by @d-rom in https://github.com/varda-ag/soilhive-core/pull/706
* fix: mapping dropdown options by @svaccari in https://github.com/varda-ag/soilhive-core/pull/704
* fix: endpoint scopes by @svaccari in https://github.com/varda-ag/soilhive-core/pull/707
* fix: sp-5421 fixed missing striped rows in metadata page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/708
* fix: sp-5461 fixed link to download terms and conditions by @cristbello in https://github.com/varda-ag/soilhive-core/pull/711
* feat: sp-5446 leave explore button enabled for raster data by @cristbello in https://github.com/varda-ag/soilhive-core/pull/710
* docs: quickstart guide lets you boot up a fully functioning env with a single command [SP-5437] by @robertoprato in https://github.com/varda-ag/soilhive-core/pull/703
* fix: avoid loading invalid depth ranges by @d-rom in https://github.com/varda-ag/soilhive-core/pull/712
* fix: epsg selection by @svaccari in https://github.com/varda-ag/soilhive-core/pull/709
* fix: sp-5448 delete values below lod (-999) by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/714
* feat: sp-4722 - upload geojson modal by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/713
* fix: sp-5452 - sticky bottom navbar in the ingestion process by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/716
* fix: discarding mixed geometries by @svaccari in https://github.com/varda-ag/soilhive-core/pull/715
* fix: sp-5464 cleaningCte fix for tables with >50 cols by @d-rom in https://github.com/varda-ag/soilhive-core/pull/718
* feat: sp-5426 store per-file cleaning stats on bulk-load by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/717
* feat: raster filter toggle endpoint by @svaccari in https://github.com/varda-ag/soilhive-core/pull/719
* test: raster filtering by @svaccari in https://github.com/varda-ag/soilhive-core/pull/721
* chore: release 1.0.0 by @svaccari in https://github.com/varda-ag/soilhive-core/pull/722
* feat: sp-5449 admins can now (de)activate raster filters previously enabled by @cristbello in https://github.com/varda-ag/soilhive-core/pull/720
* feat: sp-5459 dataset table redesign by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/723
* feat: sp-5459 - translation fix by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/725
* feat: raster metadata extraction by @svaccari in https://github.com/varda-ag/soilhive-core/pull/724
* fix: removed custom licenses from seed sql by @d-rom in https://github.com/varda-ag/soilhive-core/pull/726
* feat: sp-5449 upadte admin filters raster by @cristbello in https://github.com/varda-ag/soilhive-core/pull/727
* fix: raster overviews in metadata by @svaccari in https://github.com/varda-ag/soilhive-core/pull/728
* feat: sp-5220 clarified unclear meaning of Data Points in the download sections by @cristbello in https://github.com/varda-ag/soilhive-core/pull/729
* fix: sp-5485 info tooltip going under the table by @cristbello in https://github.com/varda-ag/soilhive-core/pull/731
* feat: sp-5490 made publishing dataset have the same checks of metadat… by @cristbello in https://github.com/varda-ag/soilhive-core/pull/730
* docs: added link to infrastructure documentation by @robertoprato in https://github.com/varda-ag/soilhive-core/pull/732

## New Contributors
* @robertoprato made their first contribution in https://github.com/varda-ag/soilhive-core/pull/564
* @estermiglio made their first contribution in https://github.com/varda-ag/soilhive-core/pull/690

**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.90.0...v1.0.0

## 0.90.0 (2026-06-05)

## What's Changed
* feat: dataset settings backend binding by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/483
* fix(fe): (sp-5133) fix mapping pill colors by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/484
* feat: 🔊 added basic logging features by @svaccari in https://github.com/varda-ag/soilhive-core/pull/488
* feat: sp-5196 - default colors by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/489
* feat: adding pg-boss concurrency env vars by @svaccari in https://github.com/varda-ag/soilhive-core/pull/490
* chore(ci): add renovate workflow by @Butterneck in https://github.com/varda-ag/soilhive-core/pull/491
* feat: sp-5093 Implement the metadata page as standalone page (read only) by @cristbello in https://github.com/varda-ag/soilhive-core/pull/430
* feat: sp-5093 metadata page links by @cristbello in https://github.com/varda-ag/soilhive-core/pull/496
* fix: sp-5093 fixed split button padding by @cristbello in https://github.com/varda-ag/soilhive-core/pull/497
* feat: removed min-width split button by @cristbello in https://github.com/varda-ag/soilhive-core/pull/498
* feat: ✨ adding raster mask creation options by @svaccari in https://github.com/varda-ag/soilhive-core/pull/499
* fix: code refactoring by @svaccari in https://github.com/varda-ag/soilhive-core/pull/501
* build: :art: updating dependencies, adding CORS rules by @svaccari in https://github.com/varda-ag/soilhive-core/pull/502
* feat: sp-5296 - restore default colors updates theme colors by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/504
* fix: sp-5064 fix setting delete button color by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/506
* feat(data): adding inferred_properties by @svaccari in https://github.com/varda-ag/soilhive-core/pull/508
* fix: sp-5064 fixed trash icon color by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/509
* perf(data): ⚡ improved dataset filtering by @svaccari in https://github.com/varda-ag/soilhive-core/pull/510
* chore(deps): pin dependencies by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/503
* fix: sp-5093 mobile changes for metadata page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/511
* feat: sp-5132 - info card on the map by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/512
* fix(fe): fix httpClient delete management by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/513
* fix: forwarding admin rights by @svaccari in https://github.com/varda-ag/soilhive-core/pull/515
* feat: ✨ dai implementation by @svaccari in https://github.com/varda-ag/soilhive-core/pull/507
* fix: sp-5043 fix preview data extraction by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/517
* chore: added carob procedures by @d-rom in https://github.com/varda-ag/soilhive-core/pull/500
* fix: unit conversion mapping by @svaccari in https://github.com/varda-ag/soilhive-core/pull/519
* feat: sp-5144 location selection by clicking on row in explore by @cristbello in https://github.com/varda-ag/soilhive-core/pull/514
* fix(data): skipping geometry field mapping by @svaccari in https://github.com/varda-ag/soilhive-core/pull/520
* fix(data): :bug: avoiding entity reloading in public schema by @svaccari in https://github.com/varda-ag/soilhive-core/pull/521
* fix: :bug: internal token validation by @svaccari in https://github.com/varda-ag/soilhive-core/pull/522
* feat: :sparkles: create license endpoint by @svaccari in https://github.com/varda-ag/soilhive-core/pull/523
* feat(be): sp-5145 file to db user mapping by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/524
* feat: sp-5151 various changes for availability mobile by @cristbello in https://github.com/varda-ag/soilhive-core/pull/525
* feat(data): unit_conversions entity and data update by @d-rom in https://github.com/varda-ag/soilhive-core/pull/527
* fix: skipping probe logs by @svaccari in https://github.com/varda-ag/soilhive-core/pull/529
* fix(be): sp-5042 use file slug in file apis by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/528
* fix(be): sp-5044 fix preview pagination by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/530
* fix: avoiding gdal reprojection by @svaccari in https://github.com/varda-ag/soilhive-core/pull/531
* fix: probes by @svaccari in https://github.com/varda-ag/soilhive-core/pull/534
* fix(fe): sp-5145 fix apply mapping by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/535
* fix: ingestion values data fixes, null license handing in /coverage by @d-rom in https://github.com/varda-ag/soilhive-core/pull/533
* feat(fe): sp-5083 ingestion last step by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/532
* fix(be): sp-5083 extended put config to data-admin by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/538
* fix(be): sp-5145 fix file to db tests by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/537
* feat: sp-5136 start file-to-db job from ingestion portal by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/539
* fix(fe): sp-5136 fix transition to data preview by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/541
* fix(fe): sp-5136 fix file-to-db start by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/542
* fix(fe): sp-5136  invalidate dataset file settings by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/544
* feat:sp 5157 dataset_layer_count update by @d-rom in https://github.com/varda-ag/soilhive-core/pull/543
* feat: sp-5042 - datasets preview step by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/545
* Feature/sp 5045 start bulk import by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/546
* fix: sp-5042 - dataset preview drop_records fix by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/547
* fix: sp-5042 - preview delete checkboxes fix and invalidating queries by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/548
* fix(be): sp-5261 fix data preview cursor pagination by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/549
* feat: sp-5158 implemented metadata editing by @cristbello in https://github.com/varda-ag/soilhive-core/pull/540
* feat: sp-5019 tc and privacy policy indicators by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/550
* fix: sp-5042 - initial visible collumns update by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/551
* feat: sp-5158 disabled editing in mobile by @cristbello in https://github.com/varda-ag/soilhive-core/pull/552
* fix: sp-5158 useDevice crashed Metadata page in SSR by @cristbello in https://github.com/varda-ag/soilhive-core/pull/553
* feat: sp-5254 changed fill to line in explorer page's map by @cristbello in https://github.com/varda-ag/soilhive-core/pull/556
* fix: sp-5158 broken link in dataset setting page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/555
* feat: sp-5151 hide toolbar button, show info dialog in mobile, and disable download by @cristbello in https://github.com/varda-ag/soilhive-core/pull/554
* chore(deps): update node.js to 191c9f0 by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/536
* chore(deps): update localstack/localstack:latest docker digest to 235ba7f by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/516
* chore(deps): update quay.io/keycloak/keycloak:latest docker digest to f9ba7b2 by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/526
* chore(deps): update postgis/postgis:18-3.6 docker digest to 750ce28 by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/518
* feat: sp-5151 added title in info dialog and fixed wrong unit for vertical height in dialog by @cristbello in https://github.com/varda-ag/soilhive-core/pull/558
* fix(fe): sp-5241 geometry edit logic by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/557
* fix: sp-5269 dataset publish status by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/560
* fix: sp-5269 show only published datasets by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/561
* fix: sp-5269 add published constrain to filter query by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/563
* chore(deps): update varda-ag/.github action to v1.13.3 by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/495
* chore(deps): update postgis/postgis:18-3.6 docker digest to 1ac8d72 by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/562
* fix: using gdal openAsync everywhere by @svaccari in https://github.com/varda-ag/soilhive-core/pull/559
* Feature/fix data load preview sorting by @d-rom in https://github.com/varda-ag/soilhive-core/pull/565
* feat: adding raster info in readme pdf by @svaccari in https://github.com/varda-ag/soilhive-core/pull/566
* feat: raster filtering poc by @d-rom in https://github.com/varda-ag/soilhive-core/pull/505
* feat: sp-5151 mobile changes for filters section in availability page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/569
* refactor: removing gdal-async by @svaccari in https://github.com/varda-ag/soilhive-core/pull/567
* fix: sp-5256 fix sort pagination when column has null values by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/572
* feat: new metadata fields by @svaccari in https://github.com/varda-ag/soilhive-core/pull/575
* fix: sp-5278 dropdown unit selector clipped at bottom of viewport by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/573
* feat: sp-5111 orphan file cleanup job by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/570
* feat: new env var for export batch size by @svaccari in https://github.com/varda-ag/soilhive-core/pull/576
* feat: gdal s3 zip support by @svaccari in https://github.com/varda-ag/soilhive-core/pull/574
* feat: raster download by @d-rom in https://github.com/varda-ag/soilhive-core/pull/568
* test: storage cleanup by @svaccari in https://github.com/varda-ag/soilhive-core/pull/579
* feat: sp-5143 added custom attribution for maps by @cristbello in https://github.com/varda-ag/soilhive-core/pull/578
* fix: removing localstack in docker compose and docs by @svaccari in https://github.com/varda-ag/soilhive-core/pull/581
* chore(deps): update quay.io/keycloak/keycloak:latest docker digest to 5fdbf2d by @varda-renovate[bot] in https://github.com/varda-ag/soilhive-core/pull/580

## New Contributors
* @varda-renovate[bot] made their first contribution in https://github.com/varda-ag/soilhive-core/pull/503

**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.89.3...v0.90.0

## 0.89.3 (2026-04-30)

## What's Changed
* fix: probe endpoints by @svaccari in https://github.com/varda-ag/soilhive-core/pull/481


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.89.2...v0.89.3

## 0.89.2 (2026-04-30)

## What's Changed
* fix: making project pipeline compliant by @svaccari in https://github.com/varda-ag/soilhive-core/pull/479


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.89.1...v0.89.2

## 0.89.1 (2026-04-29)

## What's Changed
* fix: fixes infinite setState loop by @svaccari in https://github.com/varda-ag/soilhive-core/pull/477


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.89.0...v0.89.1

## 0.89.0 (2026-04-29)

## What's Changed
* feat: re-added min and max depth to preview table default columns by @cristbello in https://github.com/varda-ag/soilhive-core/pull/475


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.88.0...v0.89.0

## 0.88.0 (2026-04-29)

## What's Changed
* feat: sp-5060 updatedAt, defaultSorting, empty state by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/469
* feat(fe): sp-5064 dataset settings page by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/472
* fix: sp-5159 duplicate data-filters and soil-data calls by @cristbello in https://github.com/varda-ag/soilhive-core/pull/471
* feat: sp-5194 - selected filters unavailible state while loading bug by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/474
* perf: query performance by @svaccari in https://github.com/varda-ag/soilhive-core/pull/473


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.87.0...v0.88.0

## 0.87.0 (2026-04-27)

## What's Changed
* feat(data): exposing raw data as preview by @svaccari in https://github.com/varda-ag/soilhive-core/pull/466
* fix: sp-5150 performance improvements for the /explore page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/467


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.86.0...v0.87.0

## 0.86.0 (2026-04-24)

## What's Changed
* feat: sp-5107 - menu dropdown hover state by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/463
* feat: sp-5130 - abort signal for useApiQuery by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/465


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.85.1...v0.86.0

## 0.85.1 (2026-04-24)

## What's Changed
* fix: clear selection text by @svaccari in https://github.com/varda-ag/soilhive-core/pull/461


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.85.0...v0.85.1

## 0.85.0 (2026-04-24)

## What's Changed
* feat: sp-5107 - menu dropdown styles fix by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/459


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.84.0...v0.85.0

## 0.84.0 (2026-04-24)

## What's Changed
* feat(data): :sparkles: added mapping detection by @svaccari in https://github.com/varda-ag/soilhive-core/pull/443
* feat: sp-5106 - privacy policy settings by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/457
* feat: sp-5107 - preview policy page by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/458


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.83.0...v0.84.0

## 0.83.0 (2026-04-24)

## What's Changed
* feat(fe):  sp-5133 data mappings validation by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/452
* feat(fe): (sp-5133) make metadata field options exclusive across conc… by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/454
* fix(fe): (sp-5133) add basic green colors by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/455


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.82.0...v0.83.0

## 0.82.0 (2026-04-24)

## What's Changed
* fix: timeout message by @svaccari in https://github.com/varda-ag/soilhive-core/pull/448
* feat: sp-5150 mobile fixes for data explorer page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/447
* fix: custom fonts by @svaccari in https://github.com/varda-ag/soilhive-core/pull/450
* feat: sp-5108 implement t and c page on the platform by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/451


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.81.0...v0.82.0

## 0.81.0 (2026-04-23)

## What's Changed
* feat: ✨ readme file generation by @svaccari in https://github.com/varda-ag/soilhive-core/pull/427
* fix: :bug: geocoder control focus by @svaccari in https://github.com/varda-ag/soilhive-core/pull/445
* feat(fe): sp-5133 show inline error on files with inconsistent structure by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/444
* fix: minor PDF changes by @svaccari in https://github.com/varda-ag/soilhive-core/pull/446


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.80.0...v0.81.0

## 0.80.0 (2026-04-22)

## What's Changed
* feat: sp-5130 - enable buttons with datasets result by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/440


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.79.2...v0.80.0

## 0.79.2 (2026-04-22)

## What's Changed
* fix(fe): fix detected_coulmns application logic by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/438


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.79.1...v0.79.2

## 0.79.1 (2026-04-22)

## What's Changed
* perf: filterDatasets - replicate and merge raster filtering logic fro… by @d-rom in https://github.com/varda-ag/soilhive-core/pull/432


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.79.0...v0.79.1

## 0.79.0 (2026-04-22)

## What's Changed
* feat(fe): (sp-5092) add validation helper utilities by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/431
* feat(fe): (sp-5127) pre-populate mapping dropdowns from detected_fields by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/435
* feat: sp-5130 - split the coverage request by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/436


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.78.0...v0.79.0

## 0.78.0 (2026-04-21)

## What's Changed
* feat: data portal mappings  details and save by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/428


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.77.0...v0.78.0

## 0.77.0 (2026-04-21)

## What's Changed
* feat: sp-5124 changes to preview and download page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/422


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.76.2...v0.77.0

## 0.76.2 (2026-04-21)

## What's Changed
* fix: skip entitlements for admins by @svaccari in https://github.com/varda-ag/soilhive-core/pull/424
* fix: add filter criteria to datasets list query by @d-rom in https://github.com/varda-ag/soilhive-core/pull/426


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.76.1...v0.76.2

## 0.76.1 (2026-04-20)

## What's Changed
* refactor: datasets list query by @d-rom in https://github.com/varda-ag/soilhive-core/pull/417


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.76.0...v0.76.1

## 0.76.0 (2026-04-20)

## What's Changed
* fix(fe): sp-503 fix crs placeholder and autocomplete placeholder length by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/419
* feat: sp-5114 various changes by @cristbello in https://github.com/varda-ag/soilhive-core/pull/420


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.75.1...v0.76.0

## 0.75.1 (2026-04-20)

## What's Changed
* fix(fe): sp-5030 fix logic to display additional files by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/416


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.75.0...v0.75.1

## 0.75.0 (2026-04-20)

## What's Changed
* feat(data): :lock: enforcing entitlements by @svaccari in https://github.com/varda-ag/soilhive-core/pull/413
* fix: visibility definition by @svaccari in https://github.com/varda-ag/soilhive-core/pull/415


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.74.1...v0.75.0

## 0.74.1 (2026-04-17)

## What's Changed
* fix: small gap in notice banner in mobile and tablet by @cristbello in https://github.com/varda-ag/soilhive-core/pull/411


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.74.0...v0.74.1

## 0.74.0 (2026-04-17)

## What's Changed
* feat: sp-5114 added beta banner component and page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/401


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.73.1...v0.74.0

## 0.73.1 (2026-04-17)

## What's Changed
* fix: removing expired token by @svaccari in https://github.com/varda-ag/soilhive-core/pull/408


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.73.0...v0.73.1

## 0.73.0 (2026-04-17)

## What's Changed
* fix(fe): add autocomplete dropdown and hide details if not needed by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/400
* feat: procedures and vocabularies endpoints by @d-rom in https://github.com/varda-ag/soilhive-core/pull/404


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.72.1...v0.73.0

## 0.72.1 (2026-04-17)

## What's Changed
* fix(fe): fix file upload template docs and improve error message by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/403
* fix: ssr and local dev envs by @svaccari in https://github.com/varda-ag/soilhive-core/pull/406


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.72.0...v0.72.1

## 0.72.0 (2026-04-16)

## What's Changed
* feat: adding auth to SSR by @svaccari in https://github.com/varda-ag/soilhive-core/pull/399


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.71.0...v0.72.0

## 0.71.0 (2026-04-16)

## What's Changed
* feat: new auth middleware, merging remote entitlements, applying entitlements by @svaccari in https://github.com/varda-ag/soilhive-core/pull/384
* feat: data mapping unit of measures by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/396
* feat: :sparkles: enabling SSR by @svaccari in https://github.com/varda-ag/soilhive-core/pull/398


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.70.0...v0.71.0

## 0.70.0 (2026-04-15)

## What's Changed
* feat(UI): sp-5030 data mapping step by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/390
* feat(UI): sp-5127 load and display detected fields to map by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/394
* feat: sp-5060 - datasets table page by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/395


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.69.1...v0.70.0

## 0.69.1 (2026-04-14)

## What's Changed
* fix: fixed popup appearing while drawing by @cristbello in https://github.com/varda-ag/soilhive-core/pull/391


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.69.0...v0.69.1

## 0.69.0 (2026-04-14)

## What's Changed
* fix: line height by @svaccari in https://github.com/varda-ag/soilhive-core/pull/387
* feat: sp-5041 removed <1% rule from toolbarMode by @cristbello in https://github.com/varda-ag/soilhive-core/pull/389


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.68.0...v0.69.0

## 0.68.0 (2026-04-14)

## What's Changed
* fix: fileToDB table name by @d-rom in https://github.com/varda-ag/soilhive-core/pull/382
* feat: sp-5041 improved availability navigation by @cristbello in https://github.com/varda-ag/soilhive-core/pull/381
* fix: dataset visibility fix, super admin token fix, UI message fix by @svaccari in https://github.com/varda-ag/soilhive-core/pull/386
* feat: sp-5041 availability navigation improvement by @cristbello in https://github.com/varda-ag/soilhive-core/pull/385


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.67.1...v0.68.0

## 0.67.1 (2026-04-14)

## What's Changed
* fix: OIDC auth detection by @svaccari in https://github.com/varda-ag/soilhive-core/pull/378
* fix: token validator middleware, adding tests by @svaccari in https://github.com/varda-ag/soilhive-core/pull/380


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.67.0...v0.67.1

## 0.67.0 (2026-04-13)

## What's Changed
* feat: improved no data message, reviewing entitlements by @svaccari in https://github.com/varda-ag/soilhive-core/pull/376


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.66.1...v0.67.0

## 0.66.1 (2026-04-13)

## What's Changed
* fix: :bug: fixing NaN date bug, transactionMiddleware, timezones by @svaccari in https://github.com/varda-ag/soilhive-core/pull/374


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.66.0...v0.66.1

## 0.66.0 (2026-04-10)

## What's Changed
* feat: sp-5091 metadata buttons styles update by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/372


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.65.0...v0.66.0

## 0.65.0 (2026-04-10)

## What's Changed
* feat: sp-5091 - review css styles and link them to the look and feel … by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/370


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.64.1...v0.65.0

## 0.64.1 (2026-04-10)

## What's Changed
* refactor: merge typeorm migrations into one by @d-rom in https://github.com/varda-ag/soilhive-core/pull/365
* fix: rm renamed migration by @d-rom in https://github.com/varda-ag/soilhive-core/pull/369


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.64.0...v0.64.1

## 0.64.0 (2026-04-10)

## What's Changed
* feat: sp-5078 changed preview to explore by @cristbello in https://github.com/varda-ag/soilhive-core/pull/364
* fix: moving migration by @svaccari in https://github.com/varda-ag/soilhive-core/pull/367


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.63.0...v0.64.0

## 0.63.0 (2026-04-09)

## What's Changed
* feat(data): :sparkles: adding entitlements endpoints by @svaccari in https://github.com/varda-ag/soilhive-core/pull/350
* feat: sp-4994 - look and feel colors tab by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/360
* fix(fe): fix hidden browser popup by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/363


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.62.2...v0.63.0

## 0.62.2 (2026-04-09)

## What's Changed
* fix: fixing geocoding result icons by @svaccari in https://github.com/varda-ag/soilhive-core/pull/358


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.62.1...v0.62.2

## 0.62.1 (2026-04-09)

## What's Changed
* fix: download file name by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/356


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.62.0...v0.62.1

## 0.62.0 (2026-04-08)

## What's Changed
* feat: sp-5078 minor changes to preview table by @cristbello in https://github.com/varda-ag/soilhive-core/pull/351
* refactor: coverage response update to avoid replicating raster coverage by @d-rom in https://github.com/varda-ag/soilhive-core/pull/349
* feat: data portal add files page by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/353
* feat(data): :sparkles: returning supported EPSG codes, patching a fil… by @svaccari in https://github.com/varda-ag/soilhive-core/pull/354
* fix(fe): fix crs update by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/355


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.61.1...v0.62.0

## 0.61.1 (2026-04-02)

## What's Changed
* fix: :bug: keeping search term by @svaccari in https://github.com/varda-ag/soilhive-core/pull/347


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.61.0...v0.61.1

## 0.61.0 (2026-04-02)

## What's Changed
* docs: data load documentation and rounding loaded values by @d-rom in https://github.com/varda-ag/soilhive-core/pull/342
* fix(fe): move common datasets transaltions by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/344
* feat: new geocoder button and result icons, showing geocoder on selec… by @svaccari in https://github.com/varda-ag/soilhive-core/pull/345
* chore: default bbox notification by @svaccari in https://github.com/varda-ag/soilhive-core/pull/346


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.60.2...v0.61.0

## 0.60.2 (2026-04-01)

## What's Changed
* fix(fe): fix year only date rendering in preview page by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/340


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.60.1...v0.60.2

## 0.60.1 (2026-04-01)

## What's Changed
* fix: :bug: checking stored token expiration by @svaccari in https://github.com/varda-ag/soilhive-core/pull/338


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.60.0...v0.60.1

## 0.60.0 (2026-04-01)

## What's Changed
* refactor: layers sampling_date to type text by @d-rom in https://github.com/varda-ag/soilhive-core/pull/336
* feat: datasets general info step by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/334


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.59.0...v0.60.0

## 0.59.0 (2026-03-31)

## What's Changed
* feat: :sparkles: added map settings, refactored ThemeConfig by @svaccari in https://github.com/varda-ag/soilhive-core/pull/331
* fix: reverted dataset DB deletion order, added schema by @d-rom in https://github.com/varda-ag/soilhive-core/pull/333


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.58.0...v0.59.0

## 0.58.0 (2026-03-31)

## What's Changed
* fix: sp-5015 getSoilData query timeout and divided aoi by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/330
* feat: sp-4993 - look and feel logo tab by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/329


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.57.2...v0.58.0

## 0.57.2 (2026-03-30)

## What's Changed
* fix(be): sp-5015 getSoilData query rewrite without typeorm by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/322


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.57.1...v0.57.2

## 0.57.1 (2026-03-27)

## What's Changed
* fix: use base images from ecr public gallery by @Butterneck in https://github.com/varda-ag/soilhive-core/pull/326


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.57.0...v0.57.1

## 0.57.0 (2026-03-27)

## What's Changed
* feat: :sparkles: adding cookie consent and analytics by @svaccari in https://github.com/varda-ag/soilhive-core/pull/321
* feat: sp-5021 datasets admin layout and routes by @cristbello in https://github.com/varda-ag/soilhive-core/pull/320


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.56.1...v0.57.0

## 0.56.1 (2026-03-27)

## What's Changed
* fix: :bug: returning logo with correct content type, removing default… by @svaccari in https://github.com/varda-ag/soilhive-core/pull/323


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.56.0...v0.56.1

## 0.56.0 (2026-03-26)

## What's Changed
* feat: sp-5037 refactor procedures by @d-rom in https://github.com/varda-ag/soilhive-core/pull/316
* feat: t&c config page by @svaccari in https://github.com/varda-ag/soilhive-core/pull/315
* feat(fe): resume download jobs on page reload by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/319


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.55.1...v0.56.0

## 0.55.1 (2026-03-25)

## What's Changed
* fix(fe): fix wrong translation in mobile download dialog by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/314


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.55.0...v0.55.1

## 0.55.0 (2026-03-24)

## What's Changed
* feat(fe): no download from mobile dialog by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/311
* feat: sp-4992 - look and feel page structure by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/312
* feat: sp-4935 - use error popup for network errors by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/306


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.54.0...v0.55.0

## 0.54.0 (2026-03-24)

## What's Changed
* feat(data): :sparkles: adding convenience endpoints to retrieve datas… by @svaccari in https://github.com/varda-ag/soilhive-core/pull/307
* feat: delete dataset job by @d-rom in https://github.com/varda-ag/soilhive-core/pull/308
* feat: :sparkles: adding default satellite map style by @svaccari in https://github.com/varda-ag/soilhive-core/pull/310
* feat: sp-4986 put preview page under a route by @cristbello in https://github.com/varda-ag/soilhive-core/pull/294


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.53.0...v0.54.0

## 0.53.0 (2026-03-19)

## What's Changed
* docs: fixing link by @svaccari in https://github.com/varda-ag/soilhive-core/pull/302
* feat: sp-5017 create account widget by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/304


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.52.1...v0.53.0

## 0.52.1 (2026-03-19)

## What's Changed
* fix(fe): sp-4921 add official raster filters setup documentation page by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/300
* docs: page refactoring by @svaccari in https://github.com/varda-ag/soilhive-core/pull/293


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.52.0...v0.52.1

## 0.52.0 (2026-03-18)

## What's Changed
* feat(fe): sp-4921 add map based filters configuration page by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/296


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.51.2...v0.52.0

## 0.51.2 (2026-03-18)

## What's Changed
* fix: using ST_MakeValid by @svaccari in https://github.com/varda-ag/soilhive-core/pull/297


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.51.1...v0.51.2

## 0.51.1 (2026-03-17)

## What's Changed
* perf: refactored filtering query by @d-rom in https://github.com/varda-ag/soilhive-core/pull/285


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.51.0...v0.51.1

## 0.51.0 (2026-03-17)

## What's Changed
* feat: sp-4976 add entitlement matrix by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/286
* feat: sp-4977 - create page structure for admin portal by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/288
* feat: sp-5000 made selectable calendar months green by @cristbello in https://github.com/varda-ag/soilhive-core/pull/291
* feat: adding claims to password auth token by @svaccari in https://github.com/varda-ag/soilhive-core/pull/292


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.50.0...v0.51.0

## 0.50.0 (2026-03-16)

## What's Changed
* feat: sp-4901 populate download summary page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/287


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.49.0...v0.50.0

## 0.49.0 (2026-03-12)

## What's Changed
* fix(data): fallback to dataset license if no layer license is available by @svaccari in https://github.com/varda-ag/soilhive-core/pull/279
* feat: sp-4903 - downloads context connected to be by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/281
* chore: updated data vocabularies by @d-rom in https://github.com/varda-ag/soilhive-core/pull/283
* feat: sp-4900 created main content for download summary by @cristbello in https://github.com/varda-ag/soilhive-core/pull/284


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.48.0...v0.49.0

## 0.48.0 (2026-03-10)

## What's Changed
* feat: sp-4898 changes to preview page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/249


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.47.1...v0.48.0

## 0.47.1 (2026-03-09)

## What's Changed
* fix(be): geojson export by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/277


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.47.0...v0.47.1

## 0.47.0 (2026-03-09)

## What's Changed
* feat: sp-4884 - clear suggestions list before search by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/274
* fix(be): sp-4980 fix geojson export logic by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/276


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.46.0...v0.47.0

## 0.46.0 (2026-03-06)

## What's Changed
* feat(fe): add i18n by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/270
* perf: reducing query timeouts by @svaccari in https://github.com/varda-ag/soilhive-core/pull/273


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.45.1...v0.46.0

## 0.45.1 (2026-03-06)

## What's Changed
* perf(data): adding max area threshold to query raster values by @svaccari in https://github.com/varda-ag/soilhive-core/pull/265
* fix: raster coverage refactoring by @svaccari in https://github.com/varda-ag/soilhive-core/pull/271


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.45.0...v0.45.1

## 0.45.0 (2026-03-04)

## What's Changed
* fix(docker-build-workflow): image version for pull requests in workflow by @Butterneck in https://github.com/varda-ag/soilhive-core/pull/267
* feat: sp-4899 download summary page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/255


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.44.0...v0.45.0

## 0.44.0 (2026-03-04)

## What's Changed
* fix(data): :zap: fixing raster overview and output values by @svaccari in https://github.com/varda-ag/soilhive-core/pull/263
* feat(fe): raster filter integration by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/266


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.43.0...v0.44.0

## 0.43.0 (2026-03-03)

## What's Changed
* feat: sp-4884 - searching by enter on the map fix by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/261
* feat(data): ⚡ using raster overviews by @svaccari in https://github.com/varda-ag/soilhive-core/pull/260


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.42.0...v0.43.0

## 0.42.0 (2026-03-02)

## What's Changed
* feat(fe): sp-4920 integrate fe raster filters to be by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/258


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.41.1...v0.42.0

## 0.41.1 (2026-03-02)

## What's Changed
* fix: moving dependency by @svaccari in https://github.com/varda-ag/soilhive-core/pull/256


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.41.0...v0.41.1

## 0.41.0 (2026-03-02)

## What's Changed
* feat: sp-4902 - implement download overlay by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/251
* feat(fe): sp-4919 raster filters UI component by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/237
* feat(data): :sparkles: adding raster dump restore CLI command by @svaccari in https://github.com/varda-ag/soilhive-core/pull/254


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.40.0...v0.41.0

## 0.40.0 (2026-03-02)

## What's Changed
* feat(data): ✨ added raster filter endpoints by @svaccari in https://github.com/varda-ag/soilhive-core/pull/248


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.39.1...v0.40.0

## 0.39.1 (2026-02-27)

## What's Changed
* fix:sp-4905 ingestion fixes by @d-rom in https://github.com/varda-ag/soilhive-core/pull/245
* chore: add gdal-driver-pg by @Butterneck in https://github.com/varda-ag/soilhive-core/pull/246
* fix: fileToDB function fixes by @d-rom in https://github.com/varda-ag/soilhive-core/pull/250


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.39.0...v0.39.1

## 0.39.0 (2026-02-26)

## What's Changed
* feat: sp-4925 changed dataset and soil properties filters in preview page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/229


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.38.2...v0.39.0

## 0.38.2 (2026-02-26)

## What's Changed
* fix(be): sp-4689 export job fix by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/242


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.38.1...v0.38.2

## 0.38.1 (2026-02-25)

## What's Changed
* fix: migration by @svaccari in https://github.com/varda-ag/soilhive-core/pull/240


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.38.0...v0.38.1

## 0.38.0 (2026-02-25)

## What's Changed
* feat: sp-4814 - notifications animation adjustments by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/232
* feat(data): loading raw file PR2 by @svaccari in https://github.com/varda-ag/soilhive-core/pull/233
* feat: sp-4884 - trigger debounced search on the map when typing by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/235
* feat(data): :sparkles: added license endpoints by @svaccari in https://github.com/varda-ag/soilhive-core/pull/236
* refactor(data): :fire: removing horizon from API responses by @svaccari in https://github.com/varda-ag/soilhive-core/pull/239
* feat(data): :sparkles: updating dataset metadata on bulk load by @svaccari in https://github.com/varda-ag/soilhive-core/pull/238


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.37.0...v0.38.0

## 0.37.0 (2026-02-24)

## What's Changed
* feat: sp-4893 - filtering sidebar accordions changes by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/227
* feat(be): sp-4756 files endpoints by @d-rom in https://github.com/varda-ag/soilhive-core/pull/206
* refactor: fileToDB refactoring by @svaccari in https://github.com/varda-ag/soilhive-core/pull/230
* feat: sp-4814 - notifications animation by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/231


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.36.0...v0.37.0

## 0.36.0 (2026-02-23)

## What's Changed
* feat(be): sp-4883 bind export function to its pgboss queue by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/219
* fix: sp-4926 preview page various fixes by @cristbello in https://github.com/varda-ag/soilhive-core/pull/224
* feat:sp 4758 populate vocabularies tables by @d-rom in https://github.com/varda-ag/soilhive-core/pull/225
* feat(be): sp-4882 file download endpoint and export job cancellation by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/226


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.35.1...v0.36.0

## 0.35.1 (2026-02-20)

## What's Changed
* fix: sp-4895 - going back to map from preview fix by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/217


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.35.0...v0.35.1

## 0.35.0 (2026-02-19)

## What's Changed
* feat: bulk load worker by @svaccari in https://github.com/varda-ag/soilhive-core/pull/209


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.34.0...v0.35.0

## 0.34.0 (2026-02-19)

## What's Changed
* feat: sp-4731 populated preview page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/212


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.33.0...v0.34.0

## 0.33.0 (2026-02-18)

## What's Changed
* feat(be): sp-4883 soil data export job - functions by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/207
* feat(be): :construction: add getSoilDataCount function by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/213
* feat: sp-4893 - filtering soil parameters styles fixes by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/215


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.32.0...v0.33.0

## 0.32.0 (2026-02-18)

## What's Changed
* feat(be):  sp-4883 soil data export by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/203
* feat: adding pg-boss as a job manager by @svaccari in https://github.com/varda-ag/soilhive-core/pull/194
* feat: sp-4893 - group soil properties by categories by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/210
* feat: procedures and unit_conversions fields update by @d-rom in https://github.com/varda-ag/soilhive-core/pull/208
* feat: sp-4814 - generic error by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/211


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.31.0...v0.32.0

## 0.31.0 (2026-02-13)

## What's Changed
* feat: sp-4887 - searching by name in datasets list by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/200
* feat: sp-4892 - filter properties by selected data type by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/202
* feat(data): adding soil-property-categories endpoints by @svaccari in https://github.com/varda-ag/soilhive-core/pull/204


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.30.0...v0.31.0

## 0.30.0 (2026-02-11)

## What's Changed
* feat(be): :sparkles: sp-4755 add get endpoints for dataset file mappings by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/198


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.29.0...v0.30.0

## 0.29.0 (2026-02-11)

## What's Changed
* chore: update dockerfile for soilhive frontend by @Butterneck in https://github.com/varda-ag/soilhive-core/pull/187
* chore: moving post soil-data endpoint by @svaccari in https://github.com/varda-ag/soilhive-core/pull/190
* chore(be): sp-4755 cumulative fixes for data management portal by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/195
* feat: sp-4830 logic to grey out non available selected filters by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/197


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.28.0...v0.29.0

## 0.28.0 (2026-02-10)

## What's Changed
* fix(ci): frontend path on nodejs workflow by @Butterneck in https://github.com/varda-ag/soilhive-core/pull/188
* test: post soil-data tests, added sanitize keys in rawRecordToDataModel by @d-rom in https://github.com/varda-ag/soilhive-core/pull/191
* feat(be): dataset file mapping api by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/192
* feat: sp-4830 logic to grey out non available selected filters by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/186


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.27.3...v0.28.0

## 0.27.3 (2026-02-09)

## What's Changed
* fix(data): replacing IDs with slugs by @svaccari in https://github.com/varda-ag/soilhive-core/pull/184


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.27.2...v0.27.3

## 0.27.2 (2026-02-09)

## What's Changed
* fix(data): replacing IDs with slugs by @svaccari in https://github.com/varda-ag/soilhive-core/pull/182


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.27.1...v0.27.2

## 0.27.1 (2026-02-09)

## What's Changed
* fix: build fix by @svaccari in https://github.com/varda-ag/soilhive-core/pull/179


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.27.0...v0.27.1

## 0.27.0 (2026-02-07)

## What's Changed
* feat: sp-4761 file to DB by @d-rom in https://github.com/varda-ag/soilhive-core/pull/167
* chore: 🎨 added MIT license, moved module_example folder by @svaccari in https://github.com/varda-ag/soilhive-core/pull/174
* chore(ci): pin varda workflows version by @Butterneck in https://github.com/varda-ag/soilhive-core/pull/177
* refactor(data): 🎨 replacing slugs with IDs by @svaccari in https://github.com/varda-ag/soilhive-core/pull/178
* feat(be): :sparkles: SP-4755 data mappings endpoint by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/176


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.26.1...v0.27.0

## 0.26.1 (2026-02-05)

## What's Changed
* fix(be): :truck: harmonized slug utils file by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/170
* refactor: :bug: fixing test dependency from .env file, adding slug to… by @svaccari in https://github.com/varda-ag/soilhive-core/pull/172


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.26.0...v0.26.1

## 0.26.0 (2026-02-05)

## What's Changed
* feat: sp-4839 POST /soil-data endpoint (cleaned record to data model) by @d-rom in https://github.com/varda-ag/soilhive-core/pull/154


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.25.2...v0.26.0

## 0.25.2 (2026-02-05)

## What's Changed
* fix(BE): fix dataset redirect path by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/166


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.25.1...v0.25.2

## 0.25.1 (2026-02-04)

## What's Changed
* fix: sp-4804 fixed zoom level only visible for mobile instead of hidden by @cristbello in https://github.com/varda-ag/soilhive-core/pull/164


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.25.0...v0.25.1

## 0.25.0 (2026-02-04)

## What's Changed
* fix: adding BACKEND_BASE_URL to docker compose by @svaccari in https://github.com/varda-ag/soilhive-core/pull/159
* feat: sp-4804 various visual changes to availability map and preview page map by @cristbello in https://github.com/varda-ag/soilhive-core/pull/162
* feat: sp-4804 mobile bottom menu is now shown even when a selection is active by @cristbello in https://github.com/varda-ag/soilhive-core/pull/163


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.24.0...v0.25.0

## 0.24.0 (2026-02-03)

## What's Changed
* feat: :zap: caching backend requests for 10 minutes, showing loading … by @svaccari in https://github.com/varda-ag/soilhive-core/pull/148
* fix: sp-4827 - soil properties expanding functionality by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/152
* feat: :sparkles: adding skeleton loader by @svaccari in https://github.com/varda-ag/soilhive-core/pull/155
* feat: sp-4796 - filters counter by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/156
* feat: sp-4735 added filtering support to preview page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/157
* chore(soilhive-backend): improve dockerfile by @Butterneck in https://github.com/varda-ag/soilhive-core/pull/158


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.23.0...v0.24.0

## 0.23.0 (2026-02-02)

## What's Changed
* feat(data): :sparkles: metadata extraction from vector files by @svaccari in https://github.com/varda-ag/soilhive-core/pull/128
* fix(DB): :card_file_box: SP-4757 change typeorm naming strategy by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/150
* fix(BE): 🩹 SP-4757 fix GET and DELETE dataset behavior by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/151


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.22.0...v0.23.0

## 0.22.0 (2026-01-30)

## What's Changed
* feat(BE): ✨ SP-4757 implement dataset POST/PATCH/DELETE methods by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/144
* feat: sp-4821 changed preview page's header description by @cristbello in https://github.com/varda-ag/soilhive-core/pull/147


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.21.0...v0.22.0

## 0.21.0 (2026-01-30)

## What's Changed
* feat: sp-4823 - remove unsupported ui elements by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/142
* feat: sp-4807 - datasets filtering by time and type by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/141
* feat: sp-4821 implemented tablet support for preview page and its sub-components by @cristbello in https://github.com/varda-ag/soilhive-core/pull/145


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.20.0...v0.21.0

## 0.20.0 (2026-01-28)

## What's Changed
* feat: sp-4734 preview table: enabled table-only scrolling support... by @cristbello in https://github.com/varda-ag/soilhive-core/pull/139


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.19.0...v0.20.0

## 0.19.0 (2026-01-28)

## What's Changed
* feat(BE): :sparkles: SP-4757 dataset service create/update by @VardAlb in https://github.com/varda-ag/soilhive-core/pull/132
* feat: sp-4734 implemented preview page table section by @cristbello in https://github.com/varda-ag/soilhive-core/pull/127
* feat: :bug: added proper cursor sorting logic by @svaccari in https://github.com/varda-ag/soilhive-core/pull/137


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.18.1...v0.19.0

## 0.18.1 (2026-01-27)

## What's Changed
* fix: dedupedDatasetLayerRows properties access by @d-rom in https://github.com/varda-ag/soilhive-core/pull/135


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.18.0...v0.18.1

## 0.18.0 (2026-01-27)

## What's Changed
* feat(data): raw record to data model by @d-rom in https://github.com/varda-ag/soilhive-core/pull/129


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.17.1...v0.18.0

## 0.17.1 (2026-01-27)

## What's Changed
* fix: sp-4832 fix for availability map: changing page after drawing a shape shows a blank page by @cristbello in https://github.com/varda-ag/soilhive-core/pull/131


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.17.0...v0.17.1

## 0.17.0 (2026-01-27)

## What's Changed
* feat:SP-4762 Ingestion data mapping logic by @d-rom in https://github.com/varda-ag/soilhive-core/pull/114
* feat(data): ✨ retrieving soil data by @svaccari in https://github.com/varda-ag/soilhive-core/pull/125
* fix(data): adding filtered dataset data_type to be used in UI filtering by @svaccari in https://github.com/varda-ag/soilhive-core/pull/130


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.16.0...v0.17.0

## 0.16.0 (2026-01-23)

## What's Changed
* chore(ci): remove release-please bootstrap config by @Butterneck in https://github.com/varda-ag/soilhive-core/pull/121
* refactor: :art: Endpoint renaming by @svaccari in https://github.com/varda-ag/soilhive-core/pull/118
* feat: SP-4806 - FilteringSidebarDatascope filters UI part by @oleksiivarda in https://github.com/varda-ag/soilhive-core/pull/116
* refactor: filter refactor by @svaccari in https://github.com/varda-ag/soilhive-core/pull/123


**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.15.19...v0.16.0

## 0.15.19 (2026-01-23)

**Full Changelog**: https://github.com/varda-ag/soilhive-core/compare/v0.15.18...v0.15.19

## [0.15.18](https://github.com/varda-ag/soilhive-core/compare/v0.15.17...v0.15.18) (2026-01-22)


### Bug Fixes

* **UI:** :bug: SP-4786 fix collapse for nested checkbox ([#117](https://github.com/varda-ag/soilhive-core/issues/117)) ([1e8f93b](https://github.com/varda-ag/soilhive-core/commit/1e8f93bf79215019accf8f5978c8d74b2a4c7d41))
* update reference on docker-cleanup workflow ([8dd4795](https://github.com/varda-ag/soilhive-core/commit/8dd4795fda1f681ebd6b097a1b46bd24b104fbc8))

## [0.15.17](https://github.com/varda-ag/soilhive-core/compare/v0.15.16...v0.15.17) (2026-01-22)


### Bug Fixes

* :bug: Using simplified geometry in BE requests ([#115](https://github.com/varda-ag/soilhive-core/issues/115)) ([b66eb5d](https://github.com/varda-ag/soilhive-core/commit/b66eb5d9f8fcbcc5e91e18bd26dd0793d8115380))

## [0.15.16](https://github.com/varda-ag/soilhive-core/compare/v0.15.15...v0.15.16) (2026-01-22)

## [0.15.15](https://github.com/varda-ag/soilhive-core/compare/v0.15.14...v0.15.15) (2026-01-21)

## [0.15.14](https://github.com/varda-ag/soilhive-core/compare/v0.15.13...v0.15.14) (2026-01-21)

## [0.15.13](https://github.com/varda-ag/soilhive-core/compare/v0.15.12...v0.15.13) (2026-01-21)

## [0.15.12](https://github.com/varda-ag/soilhive-core/compare/v0.15.11...v0.15.12) (2026-01-20)

## [0.15.11](https://github.com/varda-ag/soilhive-core/compare/v0.15.10...v0.15.11) (2026-01-20)


### Bug Fixes

* SP-4785 Fixed header shadow and preview backgrounds and shadows ([#109](https://github.com/varda-ag/soilhive-core/issues/109)) ([15d5b3b](https://github.com/varda-ag/soilhive-core/commit/15d5b3b4a4b669143362a297f4348113f8d71307))

## [0.15.10](https://github.com/varda-ag/soilhive-core/compare/v0.15.9...v0.15.10) (2026-01-20)

## [0.15.9](https://github.com/varda-ag/soilhive-core/compare/v0.15.8...v0.15.9) (2026-01-20)


### Performance Improvements

* :art: Fixing selection complexity and concurrent update ([#107](https://github.com/varda-ag/soilhive-core/issues/107)) ([032a7ed](https://github.com/varda-ag/soilhive-core/commit/032a7edfa6357d41b6386a53134d9048a1fe6eb1))

## [0.15.8](https://github.com/varda-ag/soilhive-core/compare/v0.15.7...v0.15.8) (2026-01-19)

## [0.15.7](https://github.com/varda-ag/soilhive-core/compare/v0.15.6...v0.15.7) (2026-01-16)

## [0.15.6](https://github.com/varda-ag/soilhive-core/compare/v0.15.5...v0.15.6) (2026-01-16)

## [0.15.5](https://github.com/varda-ag/soilhive-core/compare/v0.15.4...v0.15.5) (2026-01-16)

## [0.15.4](https://github.com/varda-ag/soilhive-core/compare/v0.15.3...v0.15.4) (2026-01-16)

## [0.15.3](https://github.com/varda-ag/soilhive-core/compare/v0.15.2...v0.15.3) (2026-01-15)

## [0.15.2](https://github.com/varda-ag/soilhive-core/compare/v0.15.1...v0.15.2) (2026-01-15)


### Bug Fixes

* SP-4717 Fixed alignment of button's content inside availability toolbar for mobile ([#101](https://github.com/varda-ag/soilhive-core/issues/101)) ([baf9343](https://github.com/varda-ag/soilhive-core/commit/baf934374892f91899db7652a63cc92e62828430))

## [0.15.1](https://github.com/varda-ag/soilhive-core/compare/v0.15.0...v0.15.1) (2026-01-15)

## [0.15.0](https://github.com/varda-ag/soilhive-core/compare/v0.14.0...v0.15.0) (2026-01-15)


### Features

* :art: Updating soil_properties filter payload ([#100](https://github.com/varda-ag/soilhive-core/issues/100)) ([baa7782](https://github.com/varda-ag/soilhive-core/commit/baa7782108c1a00496448036aed73efc925f0fe5))

## [0.14.0](https://github.com/varda-ag/soilhive-core/compare/v0.13.1...v0.14.0) (2026-01-13)


### Features

* SP-4701 - nested checkbox component ([#88](https://github.com/varda-ag/soilhive-core/issues/88)) ([99e9b11](https://github.com/varda-ag/soilhive-core/commit/99e9b11dae14a99c4dc3e3869d2ec7aedbd5dcc2))

## [0.13.1](https://github.com/varda-ag/soilhive-core/compare/v0.13.0...v0.13.1) (2026-01-13)

## [0.13.0](https://github.com/varda-ag/soilhive-core/compare/v0.12.2...v0.13.0) (2026-01-13)


### Features

* **data:** :zap: Adding synthetic data using CLI ([#95](https://github.com/varda-ag/soilhive-core/issues/95)) ([28773fe](https://github.com/varda-ag/soilhive-core/commit/28773fe28f110e6334707bcbe45a94cab1128ee7))

## [0.12.2](https://github.com/varda-ag/soilhive-core/compare/v0.12.1...v0.12.2) (2026-01-12)

## [0.12.1](https://github.com/varda-ag/soilhive-core/compare/v0.12.0...v0.12.1) (2026-01-12)

## [0.12.0](https://github.com/varda-ag/soilhive-core/compare/v0.11.1...v0.12.0) (2026-01-12)


### Features

* SP-4717 Map Toolbar component added support for mobile size ([#92](https://github.com/varda-ag/soilhive-core/issues/92)) ([2059a21](https://github.com/varda-ag/soilhive-core/commit/2059a21a352dc687aed4ff8a85842cafa81ff935))

## [0.11.1](https://github.com/varda-ag/soilhive-core/compare/v0.11.0...v0.11.1) (2026-01-12)

## [0.11.0](https://github.com/varda-ag/soilhive-core/compare/v0.10.7...v0.11.0) (2026-01-08)


### Features

* **map:** :adhesive_bandage: prevent filter updates during map movent when geometry is selected ([#90](https://github.com/varda-ag/soilhive-core/issues/90)) ([72c40df](https://github.com/varda-ag/soilhive-core/commit/72c40dfd0bf9c05342d6f7ec86c9ca0da9c9337b))

## [0.10.7](https://github.com/varda-ag/soilhive-core/compare/v0.10.6...v0.10.7) (2026-01-08)


### Bug Fixes

* SP-4737 Used a quicker way to check the validity of the GeoJSON upload so that the app doesn't freeze when the file is big ([#89](https://github.com/varda-ag/soilhive-core/issues/89)) ([4bcfef7](https://github.com/varda-ag/soilhive-core/commit/4bcfef730391dc5f81637fd98e8b5d8ad22248df))

## [0.10.6](https://github.com/varda-ag/soilhive-core/compare/v0.10.5...v0.10.6) (2025-12-24)

## [0.10.5](https://github.com/varda-ag/soilhive-core/compare/v0.10.4...v0.10.5) (2025-12-24)

## [0.10.4](https://github.com/varda-ag/soilhive-core/compare/v0.10.3...v0.10.4) (2025-12-24)

## [0.10.3](https://github.com/varda-ag/soilhive-core/compare/v0.10.2...v0.10.3) (2025-12-23)

## [0.10.2](https://github.com/varda-ag/soilhive-core/compare/v0.10.1...v0.10.2) (2025-12-22)

## [0.10.1](https://github.com/varda-ag/soilhive-core/compare/v0.10.0...v0.10.1) (2025-12-22)

## [0.10.0](https://github.com/varda-ag/soilhive-core/compare/v0.9.4...v0.10.0) (2025-12-22)


### Features

* SP-4703 - filtering panel unit tests ([#83](https://github.com/varda-ag/soilhive-core/issues/83)) ([71b3888](https://github.com/varda-ag/soilhive-core/commit/71b38888ac93f53030665b060b5fcd6b5151d968))

## [0.9.4](https://github.com/varda-ag/soilhive-core/compare/v0.9.3...v0.9.4) (2025-12-19)

## [0.9.3](https://github.com/varda-ag/soilhive-core/compare/v0.9.2...v0.9.3) (2025-12-19)

## [0.9.2](https://github.com/varda-ag/soilhive-core/compare/v0.9.1...v0.9.2) (2025-12-19)

## [0.9.1](https://github.com/varda-ag/soilhive-core/compare/v0.9.0...v0.9.1) (2025-12-19)

## [0.9.0](https://github.com/varda-ag/soilhive-core/compare/v0.8.2...v0.9.0) (2025-12-19)


### Features

* SP-4703 - filtering panel part 1 ([#76](https://github.com/varda-ag/soilhive-core/issues/76)) ([8e4ee28](https://github.com/varda-ag/soilhive-core/commit/8e4ee286aeeeeebd3ff280de34167060e2dcea64))

## [0.8.2](https://github.com/varda-ag/soilhive-core/compare/v0.8.1...v0.8.2) (2025-12-19)

## [0.8.1](https://github.com/varda-ag/soilhive-core/compare/v0.8.0...v0.8.1) (2025-12-19)

## [0.8.0](https://github.com/varda-ag/soilhive-core/compare/v0.7.1...v0.8.0) (2025-12-18)


### Features

* **data:** :sparkles: Added sampling date filtering ([#74](https://github.com/varda-ag/soilhive-core/issues/74)) ([cb25ed2](https://github.com/varda-ag/soilhive-core/commit/cb25ed273da51e577c9c600d9be6cc62c4feb73f))

## [0.7.1](https://github.com/varda-ag/soilhive-core/compare/v0.7.0...v0.7.1) (2025-12-18)

## [0.7.0](https://github.com/varda-ag/soilhive-core/compare/v0.6.1...v0.7.0) (2025-12-18)


### Features

* **data:** :construction: Supporting some data filters ([#71](https://github.com/varda-ag/soilhive-core/issues/71)) ([ec31699](https://github.com/varda-ag/soilhive-core/commit/ec316999b137872bd7784c69e40b9b0fe31473da))

## [0.6.1](https://github.com/varda-ag/soilhive-core/compare/v0.6.0...v0.6.1) (2025-12-18)

## [0.6.0](https://github.com/varda-ag/soilhive-core/compare/v0.5.1...v0.6.0) (2025-12-18)


### Features

* **UI - datasets:** SP-4718 update dataset panel according to backend reply ([c4f7b98](https://github.com/varda-ag/soilhive-core/commit/c4f7b988399d812bc768f0b72a12bdc72f2e3472))

## [0.5.1](https://github.com/varda-ag/soilhive-core/compare/v0.5.0...v0.5.1) (2025-12-18)

## [0.5.0](https://github.com/varda-ag/soilhive-core/compare/v0.4.4...v0.5.0) (2025-12-18)


### Features

* SP-4663 Disabled map wrapping and restricted min and max zoom levels ([#68](https://github.com/varda-ag/soilhive-core/issues/68)) ([6ee69af](https://github.com/varda-ag/soilhive-core/commit/6ee69afc3cfdf252d34572e5e1dd99813f4b3d72))

## [0.4.4](https://github.com/varda-ag/soilhive-core/compare/v0.4.3...v0.4.4) (2025-12-17)

## [0.4.3](https://github.com/varda-ag/soilhive-core/compare/v0.4.2...v0.4.3) (2025-12-16)

## [0.4.2](https://github.com/varda-ag/soilhive-core/compare/v0.4.1...v0.4.2) (2025-12-15)


### Bug Fixes

* :rocket: Fixing type and extension schema location ([#63](https://github.com/varda-ag/soilhive-core/issues/63)) ([66e0a8e](https://github.com/varda-ag/soilhive-core/commit/66e0a8e7f34d8ea96904ade3a2180c4ad1695484))

## [0.4.1](https://github.com/varda-ag/soilhive-core/compare/v0.4.0...v0.4.1) (2025-12-15)


### Bug Fixes

* :rocket: Fixing global-bundle location, OpenAPI servers ([#61](https://github.com/varda-ag/soilhive-core/issues/61)) ([cd9b725](https://github.com/varda-ag/soilhive-core/commit/cd9b725bfaa555fba0c8c2480eadc6b77f5e065f))

## [0.4.0](https://github.com/varda-ag/soilhive-core/compare/v0.3.2...v0.4.0) (2025-12-15)


### Features

* SP-4713 - css variables-for-mobile-tablet-breakpoints ([#62](https://github.com/varda-ag/soilhive-core/issues/62)) ([eacc074](https://github.com/varda-ag/soilhive-core/commit/eacc074b64a55eae9afd7b5b510e51cf7fb3c64a))

## [0.3.2](https://github.com/varda-ag/soilhive-core/compare/v0.3.1...v0.3.2) (2025-12-15)

## [0.3.1](https://github.com/varda-ag/soilhive-core/compare/v0.3.0...v0.3.1) (2025-12-12)

## [0.3.0](https://github.com/varda-ag/soilhive-core/compare/v0.2.6...v0.3.0) (2025-12-12)


### Features

* SP-4674 - datasets sidebar mobile layout and unit tests ([#56](https://github.com/varda-ag/soilhive-core/issues/56)) ([14f295b](https://github.com/varda-ag/soilhive-core/commit/14f295ba2f893f1188392c05f039cb4f3227a8b5))

## [0.2.6](https://github.com/varda-ag/soilhive-core/compare/v0.2.5...v0.2.6) (2025-12-12)

## [0.2.5](https://github.com/varda-ag/soilhive-core/compare/v0.2.4...v0.2.5) (2025-12-12)

## [0.2.4](https://github.com/varda-ag/soilhive-core/compare/v0.2.3...v0.2.4) (2025-12-12)


### Bug Fixes

* :bug: Fixing 404 on page reload using nginx config ([#55](https://github.com/varda-ag/soilhive-core/issues/55)) ([72e21ef](https://github.com/varda-ag/soilhive-core/commit/72e21efa607fe66477420d658d09e54e39924c01))

## [0.2.3](https://github.com/varda-ag/soilhive-core/compare/v0.2.2...v0.2.3) (2025-12-12)

## [0.2.2](https://github.com/varda-ag/soilhive-core/compare/v0.2.1...v0.2.2) (2025-12-12)

## [0.2.1](https://github.com/varda-ag/soilhive-core/compare/v0.2.0...v0.2.1) (2025-12-11)

## [0.2.0](https://github.com/varda-ag/soilhive-core/compare/v0.1.1...v0.2.0) (2025-12-10)

### Features

- **ci:** add docker image cleanup on any failure ([ac4e5a4](https://github.com/varda-ag/soilhive-core/commit/ac4e5a44d214aa1aea1db10a324eed78a57e08f6))

## [0.1.1](https://github.com/varda-ag/soilhive-core/compare/v0.1.0...v0.1.1) (2025-12-10)

### Bug Fixes

- **soilhive-core-frontend:** docker build ([#45](https://github.com/varda-ag/soilhive-core/issues/45)) ([2d302b8](https://github.com/varda-ag/soilhive-core/commit/2d302b81c2a932e8f98862eda1079b781858e57f))

## 0.1.0 (2025-12-10)

### Features

- add ci pipeline ([ffaa484](https://github.com/varda-ag/soilhive-core/commit/ffaa484fafb9a6f16e6778fc0c080a53e24a9f34))
- SP-4637 - white labeling and api-client initial setup ([#9](https://github.com/varda-ag/soilhive-core/issues/9)) ([c57f6d0](https://github.com/varda-ag/soilhive-core/commit/c57f6d0a1898a29f69391006ab8c711fc443e742))

### Bug Fixes

- **ci:** use correct token to push changelog ([7a0be23](https://github.com/varda-ag/soilhive-core/commit/7a0be23416bf7f163e62dee584d75cd751b08774))
- **ci:** use npm on soilhive-core-backend ([0dd039c](https://github.com/varda-ag/soilhive-core/commit/0dd039ce9be3361db3cedfd9ae37fbc31e70f887))
- remove node 16 from ci pipeline ([94af9c9](https://github.com/varda-ag/soilhive-core/commit/94af9c960ee6a73a8e25ad28c040e84cef7c23c7))
