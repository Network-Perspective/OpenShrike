export function createCommandUri(command: string, args: unknown[] = []): string {
  return `command:${command}?${encodeURIComponent(JSON.stringify(args))}`;
}
