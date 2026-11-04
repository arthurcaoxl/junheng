#!/usr/bin/env node
/**
 * 财务沙盘 CLI（Step 4）
 *
 * 用法：
 *   npx tsx cli.ts --input inputs/sample.json --out output/report.html
 *
 * 流程：读取 JSON → zod 校验 → generateReport 生成单文件 HTML → open 弹浏览器
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { SandboxInputSchema } from './src/schema';
import { generateReport } from './src/html-generator';

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv: string[]): { input: string; out: string } {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') args.input = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return {
    input: resolve(here, args.input ?? 'inputs/sample.json'),
    out: resolve(here, args.out ?? 'output/report.html'),
  };
}

async function main() {
  const { input: inputPath, out: outPath } = parseArgs(process.argv.slice(2));

  console.log(`[sandbox] 读取输入: ${inputPath}`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(inputPath, 'utf8'));
  } catch {
    console.error(`[sandbox] 无法读取或解析 JSON: ${inputPath}`);
    process.exit(1);
  }

  const parsed = SandboxInputSchema.safeParse(raw);
  if (!parsed.success) {
    console.error('[sandbox] 输入校验失败（zod）:');
    console.error(parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n'));
    process.exit(1);
  }
  const input = parsed.data;
  console.log('[sandbox] zod 校验通过');

  const html = generateReport(input);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, html);
  console.log(`[sandbox] 报告已生成: ${outPath} (${Buffer.byteLength(html, 'utf8')} bytes)`);

  console.log('[sandbox] 正在打开浏览器…');
  await open(`file://${outPath}`);
  console.log('[sandbox] 完成');
}

main().catch((err) => {
  console.error('[sandbox] 运行失败:', err);
  process.exit(1);
});
