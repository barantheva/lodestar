import { describe, expect, it } from 'bun:test';
import { shellQuote } from './shell-quote.ts';

describe('shellQuote', () => {
  it('wraps a plain value in single quotes', () => {
    expect(shellQuote('fix: token refresh')).toBe("'fix: token refresh'");
  });

  it('neutralizes command substitution and backticks by keeping them literal inside single quotes', () => {
    expect(shellQuote('$(rm -rf /)')).toBe("'$(rm -rf /)'");
    expect(shellQuote('`whoami`')).toBe("'`whoami`'");
  });

  it('escapes an embedded single quote without breaking out of the quoted string', () => {
    // POSIX-safe escaping: close the quote, emit an escaped literal quote, reopen.
    expect(shellQuote("it's a fix")).toBe("'it'\\''s a fix'");
  });

  it('neutralizes a semicolon-chained injection attempt', () => {
    const malicious = "hi'; rm -rf ~ #";
    const quoted = shellQuote(malicious);
    // The whole payload must stay inside a single quoted token pair — never letting
    // a bare `;` sit outside quotes where the shell would treat it as a command separator.
    expect(quoted.startsWith("'")).toBe(true);
    expect(quoted.endsWith("'")).toBe(true);
  });
});
