# A Correlation fails fast over a total point budget

A Correlation samples each results row to `max_points` (1000), but that limits a row, not the reply: rows are datasets × units × periods × depths, so one reply can reach millions of points. Before computing statistics, the Run counts the points it would send (the sum over rows of the smaller of the row's pairs and `max_points`). It fails when that count is above `DATA_REQUESTS_MAX_CORRELATION_POINTS` (default 500,000, about 8 MB of JSON). This is the same fail-fast rule as ADR 0038 and 0040.

On QA (November 2026), the largest real request was the whole database for clay × silt with 1-year windows: 327k points. A regional filter sent at most 45k.

## Considered options

- **Sample to a total budget (shrink `max_points` per row):** rejected. A row would then show a different number of points depending on how many other rows the request has.
- **No total limit, only the row budget:** rejected. The reply size would have no bound.

## Consequences

- The limit protects the server, the `data_requests` row and the GET. It does not limit one chart: a chart that combines N datasets or units can have N × `max_points` points, and the widget decides how to show them.
