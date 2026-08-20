#!/bin/sh
# =============================================================================
# Entrypoint for the soilhive-core-perf image (docs/adr/0029).
#
# A scheduled Perf Run is a measurement followed by a comparison: a latency
# number with nothing to compare it against is not a regression signal.
#
# Two things here are deliberate and easy to "fix" wrongly:
#
#   1. The diff runs even when the run failed. `runner && diff` would skip the
#      comparison in exactly the case it is most informative, since a run with
#      failed rows is what produces the diff's `newlyFailing` rows. Failed rows
#      still write a result file; an *aborted* run (a precondition failure)
#      writes nothing, and the two are indistinguishable by exit code — so the
#      presence of a result file, not the exit code, is what decides whether
#      there is anything to compare.
#   2. The compiled output is invoked directly rather than through npm. Neither
#      npm script works in this image: `npm run perf` builds first (no tsc under
#      --omit=dev) and `npm run perf:diff` uses ts-node (also absent). Changes
#      to those scripts therefore do not reach this container.
#
# The run's exit code wins when both fail, because the measurement is the
# primary act; the logs say which step failed.
#
# No `set -e`: the exit codes are the point and have to be captured, not
# inherited.
# =============================================================================
set -u

node dist/scripts/perf/runner.js
run_rc=$?

if [ -n "$(find perf-results -maxdepth 1 -name '*.json' -print -quit 2>/dev/null)" ]; then
  node dist/scripts/perf/diff.js --after-run
  diff_rc=$?
else
  echo "perf: the run wrote no result file, so there is nothing to compare" >&2
  diff_rc=0
fi

if [ "$run_rc" -ne 0 ]; then
  echo "perf: run exited ${run_rc}, diff exited ${diff_rc}" >&2
  exit "$run_rc"
fi

if [ "$diff_rc" -ne 0 ]; then
  echo "perf: run succeeded, diff exited ${diff_rc}" >&2
fi

exit "$diff_rc"
