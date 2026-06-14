# Home Maintenance Manager v0.5.0

Runtime setup polish release.

## Added

- Runtime source method selection:
  - Entity is ON
  - Numeric value is above threshold
  - Entity is in specific state(s)
- Dynamic runtime help based on selected entity domain and unit of measurement.
- Threshold helper for numeric runtime sources.
- Source history analysis from Home Assistant history API.
- Recommended starting threshold.
- Visual histogram of recent source values.
- Estimated runtime simulation from analyzed history.
- One-click **Use recommended threshold**.

## Notes

Use **Runtime hours** for sensors like W/RPM/% when you want to count hours above a threshold. Use **Metered usage** for cumulative sensors like kWh, gallons, miles, grams, pages, or cycles.
