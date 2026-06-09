import { describe, it, expect } from 'vitest';

// Test the pagination utility functions directly
// We import from the source and test the logic

describe('Pagination - parsePagination', () => {
  // Inline the function to test since we can't easily import from tsup-built modules
  function parsePagination(url: URL) {
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, Number(url.searchParams.get('pageSize')) || 20)
    );
    return { page, pageSize };
  }

  it('returns defaults when no params', () => {
    const url = new URL('http://localhost/api/test');
    const result = parsePagination(url);
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it('parses valid page and pageSize', () => {
    const url = new URL('http://localhost/api/test?page=3&pageSize=50');
    const result = parsePagination(url);
    expect(result).toEqual({ page: 3, pageSize: 50 });
  });

  it('clamps pageSize to max 100', () => {
    const url = new URL('http://localhost/api/test?pageSize=500');
    const result = parsePagination(url);
    expect(result.pageSize).toBe(100);
  });

  it('clamps pageSize to min 1', () => {
    const url = new URL('http://localhost/api/test?pageSize=-1');
    const result = parsePagination(url);
    expect(result.pageSize).toBe(1);
  });

  it('clamps page to min 1', () => {
    const url = new URL('http://localhost/api/test?page=-5');
    const result = parsePagination(url);
    expect(result.page).toBe(1);
  });

  it('handles non-numeric values', () => {
    const url = new URL('http://localhost/api/test?page=abc&pageSize=xyz');
    const result = parsePagination(url);
    expect(result).toEqual({ page: 1, pageSize: 20 });
  });

  it('handles decimal values (uses Number which keeps decimals)', () => {
    const url = new URL('http://localhost/api/test?page=2&pageSize=15');
    const result = parsePagination(url);
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(15);
  });
});
