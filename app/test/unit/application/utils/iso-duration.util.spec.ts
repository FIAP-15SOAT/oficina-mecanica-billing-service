import { parseIsoDurationMs } from '@application/utils/iso-duration.util';

describe('parseIsoDurationMs', () => {
  it.each([
    ['P1D', 86_400_000],
    ['PT30M', 1_800_000],
    ['P1DT2H', 93_600_000],
    ['PT45S', 45_000],
  ])('should parse days, hours, minutes and seconds (%s)', (duration, milliseconds) => {
    expect(parseIsoDurationMs(duration)).toBe(milliseconds);
  });

  it.each(['1D', 'P', 'PT', 'P1DT', 'PT0M', 'P1W'])(
    'should reject an invalid or zero duration (%s)',
    (duration) => {
      expect(() => parseIsoDurationMs(duration)).toThrow(
        `Duração ISO 8601 inválida: "${duration}"`,
      );
    },
  );
});
