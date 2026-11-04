import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('../cli.ts', import.meta.url), 'utf8');

describe('CLI 报告输出', () => {
  it('按 UTF-8 字节数而非 UTF-16 字符数报告 HTML 大小', () => {
    expect(source).toContain("Buffer.byteLength(html, 'utf8')");
    expect(source).not.toContain('(${html.length} bytes)');
  });
});
