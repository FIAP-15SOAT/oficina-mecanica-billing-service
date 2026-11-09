const ISO_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

const UNIT_MILLISECONDS = [86_400_000, 3_600_000, 60_000, 1_000];

export function parseIsoDurationMs(duration: string): number {
  const match = ISO_DURATION.exec(duration);

  const milliseconds = match
    ? UNIT_MILLISECONDS.reduce(
        (total, unit, index) => total + Number(match[index + 1] ?? 0) * unit,
        0,
      )
    : 0;

  if (!(milliseconds > 0)) {
    throw new Error(`Duração ISO 8601 inválida: "${duration}"`);
  }

  return milliseconds;
}
