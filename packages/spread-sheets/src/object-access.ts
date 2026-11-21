/**
 * Central seams for the few intentionally unchecked property accesses in the
 * core (TASK 80). Instead of scattering `x as unknown as Record<string, unknown>`
 * through the codebase, dynamic access goes through these helpers so the one
 * unsafe step is isolated, named and reviewable.
 */

/** Unchecked dynamic property view of any value (JSON-ish config objects). */
export const asRecord = (value: unknown): Record<string, unknown> => value as Record<string, unknown>;
