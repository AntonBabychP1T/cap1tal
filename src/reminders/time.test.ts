import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REMINDER_TIME,
  formatTimeOfDay,
  parseTimeOfDay,
  sameTimeOfDay,
} from './time';

/** The parse's answer as a time, or `undefined` when it refused — shorter than a switch per case. */
function timeOf(typed: string) {
  const parsed = parseTimeOfDay(typed);
  return parsed.kind === 'time' ? parsed.time : undefined;
}

function refusalOf(typed: string): string | undefined {
  const parsed = parseTimeOfDay(typed);
  return parsed.kind === 'refused' ? parsed.message : undefined;
}

describe('the time the нагадування is set for', () => {
  it('Scenario: A new time is taken', () => {
    expect(timeOf('09:30')).toEqual({ hour: 9, minute: 30 });
    // The owner typing one digit for the hour means the same time as two.
    expect(timeOf('9:30')).toEqual({ hour: 9, minute: 30 });
    expect(timeOf('21:00')).toEqual({ hour: 21, minute: 0 });
    // The edges of the day, so neither bound is off by one.
    expect(timeOf('00:00')).toEqual({ hour: 0, minute: 0 });
    expect(timeOf('23:59')).toEqual({ hour: 23, minute: 59 });
  });

  it('takes a time with spaces around it, since a keyboard adds them', () => {
    expect(timeOf(' 21:00 ')).toEqual({ hour: 21, minute: 0 });
  });

  it('Scenario: A value that is not a time changes nothing', () => {
    // Each refusal is a value, never an exception: the field shows it and the set time stands.
    expect(timeOf('25:70')).toBeUndefined();
    expect(timeOf('abc')).toBeUndefined();
    expect(timeOf('12:60')).toBeUndefined();
    // And each says what is expected rather than merely that something is wrong.
    expect(refusalOf('25:70')).toContain('24 години');
    expect(refusalOf('12:60')).toContain('60 хвилин');
    expect(refusalOf('abc')).toContain('21:00');
  });

  it('refuses the shapes a time field invites and a regexp could let through', () => {
    for (const typed of ['9', '930', '9:3', '09:300', '-1:00', '9:30:00', '09,30', '١٢:٣٠']) {
      expect(timeOf(typed), typed).toBeUndefined();
    }
  });

  it('Scenario: An empty time changes nothing', () => {
    expect(timeOf('')).toBeUndefined();
    expect(timeOf('   ')).toBeUndefined();
    // Not the same mistake as a malformed one, and it does not say the empty field is «не час».
    expect(refusalOf('')).toContain('порожнє');
  });
});

describe('a time as the section shows it', () => {
  it('always writes two digits, so 9:30 reads as 09:30', () => {
    expect(formatTimeOfDay({ hour: 9, minute: 30 })).toBe('09:30');
    expect(formatTimeOfDay({ hour: 21, minute: 0 })).toBe('21:00');
    expect(formatTimeOfDay({ hour: 0, minute: 5 })).toBe('00:05');
  });

  it('round-trips whatever the parse accepted', () => {
    for (const typed of ['00:00', '9:30', '21:00', '23:59']) {
      const time = timeOf(typed);
      expect(time, typed).toBeDefined();
      expect(timeOf(formatTimeOfDay(time!))).toEqual(time);
    }
  });
});

describe('the time the section starts from', () => {
  it('is 21:00, and it is a suggestion rather than a stored answer', () => {
    expect(DEFAULT_REMINDER_TIME).toEqual({ hour: 21, minute: 0 });
    expect(formatTimeOfDay(DEFAULT_REMINDER_TIME)).toBe('21:00');
  });
});

describe('comparing two times', () => {
  it('is the only question anything asks of a pair of them', () => {
    expect(sameTimeOfDay({ hour: 21, minute: 0 }, { hour: 21, minute: 0 })).toBe(true);
    expect(sameTimeOfDay({ hour: 21, minute: 0 }, { hour: 21, minute: 1 })).toBe(false);
    expect(sameTimeOfDay({ hour: 21, minute: 0 }, { hour: 9, minute: 0 })).toBe(false);
  });
});
