/** Small type guards for JSON from outside the process (APIs, files, AI responses). */

export const isRecord = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** `v` when it is a string, otherwise undefined. */
export const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** The elements of `v` that are strings; [] when `v` is not an array. */
export const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** The elements of `v` that are plain objects; [] when `v` is not an array. */
export const records = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isRecord) : []);

export const isStringArray = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');

export const oneOf = <T extends string>(values: readonly T[], v: unknown): v is T => typeof v === 'string' && (values as readonly string[]).includes(v);
