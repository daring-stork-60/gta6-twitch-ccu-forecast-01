[![make.fun](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/competitions/gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/daring-stork-60/gta6-twitch-ccu-forecast-01/rank.svg)](https://make.fun/competitions/gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/daring-stork-60/gta6-twitch-ccu-forecast-01/reward.svg)](https://make.fun/competitions/gta6-twitch-ccu-forecast-01)

# GTA VI launch-day Twitch viewers — hourly forecast

Entry for [Forecast GTA VI's launch-day Twitch viewers hour by hour](https://make.fun/competitions/gta6-twitch-ccu-forecast-01) on make.fun.

`main.ts` (Node 22, standard library only) reads one case file per run and
forecasts hours 2–24 of the release day as five quantiles each, anchored on
hour 1's print.

## The idea

On a rolling-midnight console launch, hour 1 (00:00–01:00 UTC) only covers
the regions that have already unlocked — New Zealand through Europe — while
the Americas unlock at 05:00Z and 08:00Z, so the day's curve grows after
hour 1. How much it grows depends on how big hour 1 already is: a launch
whose hour 1 is already huge has its audience spread across the early
timezones and grows little; a launch with a small hour 1 still has its
audience asleep in the Americas and grows a lot.

Across the kit's 38 comparable launches this is a tight linear law in log
space: for each hour h, `log(viewers_h / viewers_1)` is roughly linear in
`log(viewers_1)`, with R² near 0.9 late in the day once simultaneous-global
launches (whose hour 1 falls before their unlock) are set aside. So the
program fits, per hour, an ordinary least-squares line of the log ratio on
log hour-1 across the rolling-midnight, non-early-access comparables, and
spreads the quantiles by the residuals' own spread (× 0.9, the middle of the
validated plateau). The category's pre-release level and hour-1 channel count
carry no signal once hour 1 is known, so they are not used.

Guards: the log hour-1 used for prediction is clamped to the comparables'
observed range (no extrapolation past the biggest launch on record), the
median log ratio is clamped to the plausible band seen across rolling
launches, and the spread is floored at 0.25 and capped at 0.60 log units.
With no usable comparables it falls back to persistence (the house baseline
shape). Everything is pure arithmetic over sorted arrays: two runs write
byte-identical output, in ~0.1 s per case.

## Verification (practice cases, scored locally against the launches' own
SullyGnome hourly counts — the server grades the practice, this kit ships
no local scorer)

| case | launch | loss | house baseline |
| ---- | ------ | ---- | -------------- |
| p00 | Marvel's Wolverine | 0.1945 | 0.7437 |
| p01 | Red Dead Redemption 2 | 0.1107 | 0.2868 |
| p02 | God of War Ragnarök | 0.1228 | 0.2146 |
| p03 | Marvel's Spider-Man 2 | 0.2262 | 0.3033 |
| **mean** | | **0.1636** | **0.3871** |

Leave-one-out over the 16 rolling-midnight launches (train on the other 15,
test on the held-out one): mean loss 0.217, median 0.156, worst 0.854 —
against the baseline's 0.364 / 0.274 / 1.273 on the same set. Typical miss
14–41% per practice case, 90% coverage 0.78–1.00. See NOTES.md for the full
method, sensitivity checks, and robustness notes.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Reads every `<id>.in` in the input directory and writes `<id>.out` for each.
