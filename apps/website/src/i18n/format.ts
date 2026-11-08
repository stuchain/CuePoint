/** Fills `{name}` placeholders. A placeholder with no value throws, so a typo fails the build and not the page. */
export function fmt(template: string, values: Readonly<Record<string, string | number>> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_match, name: string) => {
    const value = values[name];
    if (value === undefined) throw new Error(`fmt: no value for {${name}} in "${template}"`);
    return String(value);
  });
}

/** The placeholder names a template uses, sorted and without repeats: what a translation must keep. */
export function placeholdersOf(template: string): string[] {
  return [...new Set([...template.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
}
