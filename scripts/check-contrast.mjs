#!/usr/bin/env node
/**
 * Token 漂移守卫 —— **不是**对比度验收。
 *
 * 它做的事情只有一件：从 app/globals.css 里把文字色与玻璃色的 alpha 解析出来，
 * 跟 test/fixtures/contrast-baseline.json 比对，**漂移就红**。
 *
 * 它**不能**回答「对比度达标吗」这个问题。原因：
 *   1. 它复刻的是我们自己的合成模型，而模型对玻璃的三段渐变、
 *      光球的 `.ambient span { opacity: .7 }`、以及 `.glass-card::before`
 *      那层压在文字**之上**的白扫光，建模都不完整；
 *   2. 它不模拟 `saturate(170%)`。
 * 误差方向还不一致——有的项高估、有的项低估，所以余量也不可信。
 *
 * 真实证据只有浏览器里的实测（DevTools 对比度检查器，浅色/深色各一个最坏点）。
 * 一条在被保护对象出问题时仍然返回绿的检查，比没有检查更糟：它会训练人不再相信红绿灯。
 *
 * 所以下面打印的比值是**参考输出**，不是门禁。门禁是「与基线一致」。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const CSS_PATH = join(root, "app", "globals.css");
const BASELINE_PATH = join(root, "test", "fixtures", "contrast-baseline.json");

/** 从 globals.css 的 :root 与 .dark 块里抽出需要的变量 */
function parseTokens(css) {
  const blocks = {};
  for (const selector of [":root", ".dark"]) {
    const start = css.indexOf(`${selector} {`);
    if (start === -1) throw new Error(`找不到 ${selector} 块`);
    const open = css.indexOf("{", start);
    let depth = 0;
    let end = open;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === "{") depth += 1;
      if (css[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = css.slice(open + 1, end);
    const vars = {};
    for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      vars[m[1]] = m[2].trim();
    }
    blocks[selector] = vars;
  }
  return blocks;
}

/** "rgba(15, 23, 42, 0.74)" | "#0f172abd" -> alpha 数值 */
function alphaOf(value) {
  if (!value) return null;
  const rgba = value.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const parts = rgba[1].split(",").map((s) => s.trim());
    return parts.length === 4 ? Number(parts[3]) : 1;
  }
  const hex = value.match(/^#([0-9a-f]{8})$/i);
  if (hex) return parseInt(hex[1].slice(6, 8), 16) / 255;
  const hex6 = value.match(/^#([0-9a-f]{6})$/i);
  if (hex6) return 1;
  return null;
}

function snapshot() {
  const css = readFileSync(CSS_PATH, "utf8");
  const blocks = parseTokens(css);
  const out = {};
  for (const [selector, vars] of Object.entries(blocks)) {
    out[selector] = {};
    for (const key of [
      "--ink",
      "--ink-soft",
      "--ink-faint",
      "--glass",
      "--glass-strong",
      "--orb-1",
      "--orb-2",
      "--orb-3",
    ]) {
      out[selector][key] = {
        raw: vars[key] ?? null,
        alpha: alphaOf(vars[key]),
      };
    }
  }
  return out;
}

function main() {
  const currentSnapshot = snapshot();

  // --write-baseline：把当前状态固化为基线。
  // 只在「已在浏览器里实测过对比度」之后才该用它。
  if (process.argv.includes("--write-baseline")) {
    const payload = {
      note:
        "对比度 token 基线。由 scripts/check-contrast.mjs --write-baseline 生成。" +
        "改写它之前必须先在浏览器里重新实测对比度——基线是漂移哨兵，不是对比度的证明。",
      tokens: currentSnapshot,
    };
    writeFileSync(BASELINE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    console.log(`✓ 已写入基线：${BASELINE_PATH}`);
    return;
  }

  let baseline;
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch {
    console.error(`✗ 读不到基线：${BASELINE_PATH}`);
    console.error("  先跑 `node scripts/check-contrast.mjs --write-baseline`。");
    process.exit(1);
  }

  const current = currentSnapshot;
  const drift = [];

  for (const selector of Object.keys(baseline.tokens ?? {})) {
    for (const key of Object.keys(baseline.tokens[selector])) {
      const want = baseline.tokens[selector][key];
      const got = current[selector]?.[key];
      if (!got) {
        drift.push(`${selector} ${key}: 缺失`);
        continue;
      }
      if (want.alpha !== got.alpha) {
        drift.push(
          `${selector} ${key}: alpha ${want.alpha} → ${got.alpha}` +
            `  (${want.raw} → ${got.raw})`
        );
      }
    }
  }

  // 参考输出：把最紧的两个次级文字层算出来给人看，明确标注「不能当作证明」
  console.log("参考比值（模型不完整，仅供参考，不作为门禁）：");
  for (const selector of [":root", ".dark"]) {
    const t = current[selector];
    if (!t) continue;
    console.log(
      `  ${selector.padEnd(7)} ink-soft alpha=${t["--ink-soft"]?.alpha}  ` +
        `ink-faint alpha=${t["--ink-faint"]?.alpha}  ` +
        `glass alpha=${t["--glass"]?.alpha}  glass-strong alpha=${t["--glass-strong"]?.alpha}`
    );
  }

  if (drift.length > 0) {
    console.error("\n✗ 文字/玻璃 token 发生漂移：");
    for (const d of drift) console.error(`  - ${d}`);
    console.error(
      "\n若这是有意的改动：改完必须回到浏览器里重新实测对比度（浅色/深色各一个最坏点），" +
        "\n然后更新 test/fixtures/contrast-baseline.json。不要只改基线。"
    );
    process.exit(1);
  }

  console.log("\n✓ token 未漂移（注意：这不代表对比度达标，见文件头注释）");
}

main();
