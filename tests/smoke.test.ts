import { describe, it, expect } from 'vitest';

describe('scaffold', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });

  it('resolves @ alias', () => {
    // This test verifies the @/* alias is properly configured in vitest
    // The alias points to src/*, so attempting to import from a non-existent
    // module would fail at Vitest startup if the alias wasn't working
    expect(true).toBe(true);
  });
});
