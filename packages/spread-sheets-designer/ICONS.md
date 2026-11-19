The SVG artwork in `src/icons.tsx` is authored for OpenSheets from elementary
paths, rectangles, circles and text. It uses no third-party icon assets or
vendor artwork. The 32-unit coordinate system supports 16px and 32px rendering
at device pixel ratios 1 and 2 (the trial ribbon uses 24px for its large icons).

Office command meanings and general colour conventions are used as visual
references. No raster images, sprites or traced paths from the trial are used.

The M6b continuation strengthens the accent colours and outlined containers,
redraws the compact Home group symbols and clipboard, and repairs open paths
that previously had a fill but no stroke. Unit coverage checks that action
marks are stroked and all configured icons render without embedded raster data.
The browser suite captures the ribbon at DPR 1 and 2; icons retain their existing
exclusion rule. A passing non-icon gate is not evidence of perceptual icon parity.
