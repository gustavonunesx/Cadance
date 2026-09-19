import { describe, it, expect } from 'vitest';
import {
  PERIODS,
  weekdayOf,
  addDays,
  daysBetween,
  effectiveCapacity,
} from '@/lib/scheduler/capacity';
import type { AvailabilitySlot } from '@/lib/scheduler/types';

const availability: AvailabilitySlot[] = [];
for (let weekday = 0; weekday < 7; weekday++) {
  availability.push({ weekday, period: 'manha', hours: 1, isPeak: false });
  availability.push({ weekday, period: 'tarde', hours: 2, isPeak: false });
  availability.push({ weekday, period: 'noite', hours: 3, isPeak: false });
}

describe('PERIODS', () => {
  it('é a ordem cronológica fixa manha, tarde, noite', () => {
    expect(PERIODS).toEqual(['manha', 'tarde', 'noite']);
  });
});

describe('weekdayOf', () => {
  it('2026-08-19 é uma quarta-feira (3)', () => {
    expect(weekdayOf('2026-08-19')).toBe(3);
  });

  it('2026-08-23 é um domingo (0)', () => {
    expect(weekdayOf('2026-08-23')).toBe(0);
  });
});

describe('addDays', () => {
  it('avança um dia', () => {
    expect(addDays('2026-08-19', 1)).toBe('2026-08-20');
  });

  it('atravessa a virada de mês', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
  });

  it('atravessa a virada de ano', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('soma o horizonte inteiro sem deriva', () => {
    expect(addDays('2026-01-01', 365)).toBe('2027-01-01');
  });
});

describe('daysBetween', () => {
  it('conta dias inteiros para frente', () => {
    expect(daysBetween('2026-08-19', '2026-08-21')).toBe(2);
  });

  it('é zero no mesmo dia', () => {
    expect(daysBetween('2026-08-19', '2026-08-19')).toBe(0);
  });

  it('é negativo quando a data final já passou', () => {
    expect(daysBetween('2026-08-19', '2026-08-10')).toBe(-9);
  });
});

describe('effectiveCapacity', () => {
  it('aplica o buffer de 20% (2h de tarde => 96 min)', () => {
    expect(effectiveCapacity('2026-08-19', 'tarde', availability, 0.2)).toBe(96);
  });

  it('calcula manhã e noite do exemplo do spec (48 e 144)', () => {
    expect(effectiveCapacity('2026-08-19', 'manha', availability, 0.2)).toBe(48);
    expect(effectiveCapacity('2026-08-19', 'noite', availability, 0.2)).toBe(144);
  });

  it('arredonda para baixo (0.5h com buffer 20% => 24 min, não 24.0)', () => {
    const meiaHora: AvailabilitySlot[] = [
      { weekday: 3, period: 'manha', hours: 0.55, isPeak: false },
    ];
    // 0.55 * 60 * 0.8 = 26.4 -> 26
    expect(effectiveCapacity('2026-08-19', 'manha', meiaHora, 0.2)).toBe(26);
  });

  it('devolve 0 quando não há slot para aquele dia/período', () => {
    expect(effectiveCapacity('2026-08-19', 'noite', [], 0.2)).toBe(0);
  });
});
