# Usage analytics

The frontend can report how visitors use the map, the Data Explorer and the Download Summary to Google Analytics 4 (GA4), through a Google Tag Manager (GTM) container. It is off unless `GTM_CONTAINER_ID` is set (see [setup.md](setup.md)). The reasons for this design are in [ADR 0079](../adr/0079-usage-analytics-go-through-the-gtm-data-layer-after-consent.md).

## Consent comes first

- GTM is put on the page only after the visitor accepts the "analytics" cookies in the consent banner (`components/CookieConsentProvider.tsx`). The banner only offers that category when `GTM_CONTAINER_ID` is set.
- `trackEvent` (`utilities/analytics.ts`) does nothing until GTM is on the page. An action taken before the consent is never sent after it.
- GTM is loaded once per page, even though the consent library reports a stored consent on every load.
- A visitor who withdraws the consent gets the page reloaded without GTM, so tracking stops right away.

## What the app sends

Two kinds of events reach the GTM `dataLayer`:

1. **Events pushed by the code**, where the meaning lives in the app's state: which way an area was picked, which filter value changed, whether an Export really started.
2. **Clicks**, which GTM catches by itself on elements that carry a `data-analytics` attribute.

The event names follow the ones the earlier SoilHive platform sent, where the action is the same (`location_search` with `method`, `download_data_request`, `format`, `click_on_*_button`, `*_filter_change`).

### Events pushed by the code

Each push empties the parameters of the previous event first, then pushes the new one:

```js
dataLayer.push({ analytics: null });
dataLayer.push({ event: 'location_search', analytics: { method: 'shape_draw' } });
```

Text values are cut to 100 characters, the most GA4 keeps.

| Event                    | Parameters (under `analytics`)                                                                                                                                                                                                                                                                                                              | Sent when                                                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `location_search`        | `method`: `text_search`, `shape_draw`, `shape_upload` or `map_cell`. `place_type`: the kind of place picked in the search box (Nominatim's `addresstype`, Mapbox's `feature_type`, or `continent`). `country`: the place's name, only when it is a country.                                                                                 | The visitor picks a search result, finishes drawing a polygon, uploads a GeoJSON file (from the dialog or by dropping it on the map) or clicks an H3 cell. Moving the map, or a selection a sign-in brought back, sends nothing. |
| `map_filter_change`      | `filter_name`: `data_type`, `data_access`, `sampling_years`, `soil_property` or `raster`. `filter_value`: the value, e.g. `raster`, `2010-2020`, a soil property's name, `Soil Groups: Acrisols`. `filter_action`: `add` or `remove`, or `clear_all` alone.                                                                                 | One event per value ticked or unticked in the map's Filters panel, a pill removed, or Clear all. Ticking a soil property category sends one event per property in it.                                                            |
| `download_data_request`  | `format` (e.g. `csv`, `csv+tiff`), `data_scenario` (`vector`, `raster`, `mixed`), `download_source` (`map` or `explore`), `dataset_count`, `selection_type` (`continent`, `country` for any other place found with the search, `drawn-polygon` for a drawn or uploaded shape, `h3-cell`), `filters_applied` (`yes` or `no`), `filter_count` | The Download Summary's "Download data" started an Export. Nothing is sent when the visitor is asked to sign in first, or when the Export is refused.                                                                             |
| `dataset_name_search`    | `dataset_name_search_text`, `result_count`                                                                                                                                                                                                                                                                                                  | The text in the datasets list's "Search by name" box has stopped changing for 1 second and has at least 2 characters. Text a sign-in brought back sends nothing.                                                                 |
| `explore_filter_change`  | `filter_name`: `dataset`, `soil_property`, `depth` or `date_range`. `filter_value`: the dataset or soil property name, the depth (`15-30cm`), the months (`2020-01 to 2020-06`), or `none` when cleared.                                                                                                                                    | The visitor changes a filter in the Data Explorer. The months are sent when the calendar closes, and only if they changed.                                                                                                       |
| `explore_pagination`     | `page_number` (counted from 1), `total_pages`                                                                                                                                                                                                                                                                                               | The visitor moves to another page of the Data Explorer's Preview table.                                                                                                                                                          |
| `download_format_select` | `format`: the option picked, e.g. `gpkg`, `csv+tiff` (the same values as `download_data_request`)                                                                                                                                                                                                                                           | The visitor picks another format in the Download Summary's format list.                                                                                                                                                          |

`filters_applied` and `filter_count` are read from the Filter the Export is made from (`domain/countAppliedFilterCriteria.ts`). That is the map's Filter: the Data Explorer hands the map's Filter on to the Download Summary, so the Data Explorer's own filters do not count. Ticking all the data types, or none, is no filter.

Place names are personal data when they are addresses, so only countries are sent by name.

`explore_pagination` and `download_format_select` are plain clicks, but GTM could only catch them on PrimeReact's class names and labels, which an upgrade can change without any test failing. So the code sends them, and their tests fail if they stop.

### Clicks GTM catches

An element with `data-analytics="<event name>"` is sent as that event when clicked, with `click_value` taken from `data-analytics-value`, or `on`/`off` for a checkbox. The shared `Button` takes `dataAnalytics` and `dataAnalyticsValue` props, and `ToggleButton` takes `dataAnalytics`, which goes on its checkbox so a click on the label counts once. The names live in `ANALYTICS_CLICKS` (`configuration/analytics.ts`).

| Event                       | `click_value`                               | Element                                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dai_toggle`                | `on` or `off`, the state it was switched to | The Coverage map widget's toggle                                                                                                                                                                        |
| `click_on_map_style_button` | none                                        | The map style switcher button                                                                                                                                                                           |
| `map_style_change`          | The style's name                            | Each style in the "Select a map style" dialog                                                                                                                                                           |
| `click_on_explore_button`   | none                                        | "Explore" in the datasets sidebar                                                                                                                                                                       |
| `click_on_download_button`  | `map`, `explore` or `summary`               | The Download button of the datasets sidebar, the Data Explorer or the Download Summary. It counts clicks, including those that then ask the visitor to sign in; `download_data_request` counts Exports. |

Visits to each page come from GA4's own `page_view`, with "Page changes based on browser history events" on in the data stream's enhanced measurement.

## Setting up the GTM container

[analytics-gtm-container.json](analytics-gtm-container.json) holds everything below. Import it into a new workspace of your container (Admin → Import container → Merge, rename conflicting items), then check it in Preview before publishing. If the import fails, build it by hand from this list.

**Built-in variables:** Event, Click Element.

**Variables**

- Data Layer Variables, version 2, one per parameter above, named `DLV - analytics.<parameter>` and reading `analytics.<parameter>`.
- `GA measurement ID`: not in the import file. The tags read the container's own variable of that name, usually the one its Google tag uses; if your container has none, add a Constant with your `G-` ID under that exact name before importing.
- Custom JavaScript:
  - `Analytics Click Name`: the `data-analytics` attribute of `{{Click Element}}.closest('[data-analytics]')`.
  - `Analytics Click Value`: for that element, `on`/`off` when it is a checkbox, otherwise its `data-analytics-value`.

**Triggers**

- `CE - SoilHive usage events`: Custom Event, event name matches the regex `^(location_search|map_filter_change|download_data_request|dataset_name_search|explore_filter_change|explore_pagination|download_format_select)$`.
- `Click - data-analytics`: Click, All Elements, when Click Element matches the CSS selector `[data-analytics], [data-analytics] *`.

**Tags** (GA4 Event, measurement ID `{{GA measurement ID}}`)

- `GA4 - SoilHive usage events`: event name `{{Event}}`, every parameter of the code events mapped to its Data Layer Variable. Fires on `CE - SoilHive usage events`.
- `GA4 - Clicks`: event name `{{Analytics Click Name}}`, `click_value` = `{{Analytics Click Value}}`. Fires on `Click - data-analytics`.

## Setting up GA4

- **Custom dimensions** (event scope): `method`, `place_type`, `country`, `filter_name`, `filter_value`, `filter_action`, `format`, `data_scenario`, `download_source`, `selection_type`, `filters_applied`, `dataset_name_search_text`, `click_value`, `page_number`.
- **Custom metrics**: `dataset_count`, `filter_count`, `result_count`, `total_pages`.

GA4 only shows a parameter in reports once it is registered as a dimension or metric, and only for events received after that.

## Checking it locally

1. Run the frontend with `GTM_CONTAINER_ID` set. The container's own ID lets GTM Preview connect; any `GTM-` value is enough to inspect the `dataLayer`.
2. Accept analytics in the cookie banner.
3. Do the actions above and read `window.dataLayer` in the browser console. Each action adds the expected event once.
4. Check that nothing is pushed before accepting. The app has no link to the cookie preferences yet, so withdrawing the consent is covered by `tests/components/CookieConsentProvider.test.tsx`.
5. With GTM Preview (Tag Assistant) connected, check that each tag fires once with its parameters, and that the events reach GA4's DebugView.
