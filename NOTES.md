# Notes — gta6-twitch-ccu-forecast-01

## What was built

`main.ts`: a per-hour OLS regression of `log(viewers_h / viewers_1)` on
`log(viewers_1)`, fit on the rolling-midnight, non-early-access comparables
in the case file, with normal quantiles spread by the residual spread
(× 0.9). Fallbacks: all clean comparables when fewer than 6 rolling-clean
ones exist; persistence when fewer than 3 references exist at all.

## Why this shape

- The practice answers (recovered from SullyGnome's public hourly averages,
  the same source the kit quotes; hour-1 values match the kit's `known`
  exactly) all share one shape: a dip in hours 2–4, a jump at hour 5
  (05:00Z, US East unlock), a midday lull, then a rise from hour 15 to a
  peak at hours 17–21 and a slow fall. But the growth factor varies 1.7×–
  9.7× across the four launches, and it falls as hour 1 grows — the
  regression captures exactly that.
- A plain median-ratio forecast scores 0.4056 on practice, worse than the
  baseline (0.3871): the median mixes simultaneous-global launches (tiny
  hour 1, huge growth) with rolling ones. Conditioning on unlock type is
  what makes the model work: median-ratio on rolling launches only scores
  0.2514; the regression on rolling launches scores 0.1648.
- The pre-release baseline (median viewers in the 48 h before release day)
  was tested as an alternative scale anchor and failed badly (0.82 on
  practice): pre-release category levels are sparse and noisy and do not
  predict launch-day scale. Hour-1 channel count and pre-release level add
  nothing to the residuals (correlations ≤ 0.34), so they are not used.

## Sensitivity (practice mean / rolling leave-one-out mean)

- Regression, rolling-clean (chosen): 0.1648 / 0.2161
- Regression, all clean: 0.2325 / 0.2161
- Regression, rolling, slope shrunk ×0.8: 0.1720 / 0.2171
- Regression, rolling, Theil–Sen slope: 0.1685 / 0.2178
- Regression, rolling, median-smoothed: 0.1661 / 0.2159
- Blend 70% regression + 30% median-ratio: 0.1935 / 0.2288
- Spread multiplier 0.7 / 0.85 / 1.0 / 1.15 / 1.3: practice 0.1615 /
  0.1616 / 0.1648 / 0.1696 / 0.1762; LOO 0.2212 / 0.2173 / 0.2161 /
  0.2170 / 0.2199. The plateau 0.85–1.0 is flat; 0.9 sits in its middle.
- Final guarded model (log-p1 clamp, median clamp, spread floor/cap):
  practice 0.1636, rolling-LOO 0.2173 — the guards cost nothing on
  in-range data and only bind out of range.

## Robustness checks on the shipped program

- Two runs on the practice inputs write byte-identical output; ~0.12 s
  per case (cap 8 s). Outputs are valid (23 rows, hours 2–24, five
  finite non-decreasing quantiles in (0, 1e9], < 65,536 bytes total).
- TypeScript output matches the independent Python reference
  implementation of the same model exactly (max difference 0.00).
- Edge cases: hour-1 print 2,000,000 (beyond the observed 875k max) is
  predicted as if it were 875k (median ratio at hour 21: 0.90×, not the
  raw extrapolation's 0.60×); hour-1 print 1,000 is clamped to the bottom
  of the observed range; no comparables falls back to persistence; only
  simultaneous comparables falls back to the all-clean regression. All
  produce valid output.

## What could still go wrong on the final

- GTA VI is the biggest launch in the set by a wide margin; if its hour-1
  print lands far above 875k, the clamp means the forecast behaves like
  the biggest observed launches (Elden Ring / Cyberpunk: roughly flat,
  peak ≈ hour 1). If GTA VI instead keeps growing after a huge hour 1,
  the median will sit low — the widened spread is the only compensation.
- The final's hour 1 is a mean of minute reads, the practice's a SullyGnome
  hourly average; the two measures should agree to a few percent, well
  inside the spread.
- The house model forecast (one-shot superbot) is the unknown bar: this
  entry beats the house baseline by a wide margin on every validation set,
  but whether it beats the house model on the final is unknowable in
  advance. The model is the best validated one available; no further
  tuning was done on the 4 practice cases beyond choosing the plateau
  midpoint for the spread.
