# Usage analytics go through the GTM data layer, and only after consent

**Status:** Accepted

To learn how visitors use the map, the Data Explorer and the Download Summary, the frontend reports their actions to Google Analytics 4 through the Google Tag Manager container it already loads when `GTM_CONTAINER_ID` is set. Where the meaning of an action lives in the app's state, the code pushes a named event onto the `dataLayer`: which way an area was picked, which filter value changed, whether an Export really started and with which format and filters. Where a click says all there is to say, the element carries a `data-analytics` attribute naming the event, and the container catches the click. The Preview table's paginator and the Download Summary's format list are plain clicks too, but they are PrimeReact's markup, so the code sends those events. Nothing is sent before the visitor accepts analytics cookies, GTM is loaded once per page, and withdrawing the consent reloads the page without it. The event names reuse those of the earlier SoilHive platform where the action is the same, so the same questions can be asked of the new reports. Only a country is sent by name, since another place found with the search can be an address. The event list and the container setup are in [docs/frontend/analytics.md](../frontend/analytics.md).

## Considered options

- **Every event pushed by the code, with one trigger in GTM**: rejected. Every click to count would need a release, while most of them say nothing more than "this button was clicked", which GTM can catch alone.
- **The Preview table's paginator and the format list caught by GTM on PrimeReact's class names and labels**: rejected. A PrimeReact upgrade could rename them and stop both events without any test failing, while an event sent by the code has a test that fails.
- **Every event built in GTM from CSS selectors and button text**: rejected. The class names carry a build hash, the texts are translated, and several pages share the same button names. Nor can GTM see how an area was picked, a filter's value, or whether an Export was refused or waited for a sign-in.
- **The code calling `gtag` directly**: rejected. The app would depend on one analytics vendor and its measurement ID, and changing what is sent would need a release.
- **Pushing events before the consent, for GTM to read once loaded**: rejected. Actions taken before the consent would be sent after it.
- **Counting a download on the Download button's click**: rejected for the Export count. A click can open the sign-in dialog or be refused over the Export Limits; `download_data_request` is sent only once the Export started. The click is still counted on its own.
- **Whether the download had filters, read from the map's state**: rejected. The Download Summary can be opened from a link or after a sign-in, with the map's state gone. The count comes from the stored Filter the Export is made from.

## Consequences

- A `data-analytics` value is an event name in Google Analytics: renaming one splits its history in the reports.
- The Data Explorer's own filters do not reach the Export, so `filters_applied` reports the map's filters only.
- Visitors who decline analytics cookies are not counted, so the numbers are a lower bound.
- The app has no link to change the cookie choice yet, so a visitor withdraws the consent only by clearing the consent cookie.
