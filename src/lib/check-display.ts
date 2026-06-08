export function formatCheckIdDisplay(checkId: string): string {
  const parts = checkId
    .split('-')
    .map(part => part.trim())
    .filter(Boolean);
  const numericIndex = parts.findIndex(part => /^\d+$/u.test(part));
  const visibleParts = numericIndex >= 0
    ? parts.slice(0, numericIndex + 1)
    : parts.slice(0, Math.min(parts.length, 3));

  return visibleParts.join('-').toUpperCase();
}
