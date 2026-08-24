/**
 * Tiny className joiner (no `clsx`/`tailwind-merge` dependency added).
 * Accepts strings, falsy values (skipped), and objects mapping class
 * names to booleans (included when the value is truthy).
 */
export type ClassValue =
  string | number | null | undefined | false | Record<string, boolean | undefined | null>;

export function cn(...inputs: ClassValue[]): string {
  const classes: string[] = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === "string" || typeof input === "number") {
      classes.push(String(input));
    } else {
      for (const [key, value] of Object.entries(input)) {
        if (value) classes.push(key);
      }
    }
  }
  return classes.join(" ");
}
