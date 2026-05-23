/**
 * Pure resolver: given a connection template + the target service's env vars
 * and endpoint info, returns the fully-resolved key/value pairs.
 *
 * No I/O — callers are responsible for supplying already-loaded env maps
 * and endpoint coordinates.
 */

export function resolveConnectionTemplate(
  vars: { key: string; template: string }[],
  serviceEnv: Record<string, string>,
  host: string,
  port: number,
): { key: string; value: string }[] {
  return vars.map(({ key, template }) => {
    const unresolved: string[] = [];
    const value = template.replace(/\{\{(\w+)\}\}/g, (match, name) => {
      if (name === 'host') return host;
      if (name === 'port') return String(port);
      if (name in serviceEnv) return serviceEnv[name];
      unresolved.push(match);
      return match;
    });
    if (unresolved.length > 0) {
      throw new Error(
        `Connection template variable "${key}" references unresolvable placeholders: ${unresolved.join(', ')}`
      );
    }
    return { key, value };
  });
}
