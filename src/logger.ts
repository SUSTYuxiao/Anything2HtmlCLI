// =====================================================================
// src/logger.ts —— 唯一 stderr 出口
// 协议: .trellis/spec/backend/logging-guidelines.md
// 红线: stdout 永远只承载数据 (HTML / JSON 错误对象), stderr 承载所有
// 给人看的字符。
// =====================================================================

type Flags = { quiet: boolean; verbose: boolean };

// ─── module-local state ──────────────────────────────────────────────
let flags: Flags = { quiet: false, verbose: false };

export function configureLogger(f: Flags): void {
  flags = f;
}

// ─── TTY / color detection (PRD Q-MVP-6) ─────────────────────────────
// 进度仅在 stdout & stderr 同为 TTY 且非 quiet 时启用。
// 任一条件假即彻底静默——覆盖 pipe / -o 重定向 / CI 环境。
const isTTY = (): boolean =>
  Boolean(process.stdout.isTTY) && Boolean(process.stderr.isTTY);

const useColor = (): boolean =>
  Boolean(process.stderr.isTTY) && !process.env["NO_COLOR"];

// ─── 极简 ANSI (不引 chalk / picocolors) ─────────────────────────────
const yellow = (s: string): string => (useColor() ? `\x1b[33m${s}\x1b[0m` : s);
const red = (s: string): string => (useColor() ? `\x1b[31m${s}\x1b[0m` : s);
const dim = (s: string): string => (useColor() ? `\x1b[2m${s}\x1b[0m` : s);

// ─── public API: 4 个方法,刻意不分 debug/warn ───────────────────────
export const log = {
  // info: TTY 且非 quiet 时打
  info(msg: string): void {
    if (!isTTY() || flags.quiet) return;
    process.stderr.write(dim(`[a2h] ${msg}`) + "\n");
  },

  // verbose: 仅 --verbose 开启 + TTY + 非 quiet
  // 排错用; quiet 仍优先级最高
  verbose(msg: string): void {
    if (!flags.verbose || !isTTY() || flags.quiet) return;
    process.stderr.write(dim(`[a2h] ${msg}`) + "\n");
  },

  // progress: \r 覆盖同一行,仅 TTY
  progress(msg: string): void {
    if (!isTTY() || flags.quiet) return;
    process.stderr.write(`\r${dim(`[a2h] ${msg}`)}`);
  },

  // progressTick: 时间心跳, 每次 invoke 心跳触发追加一个点 (不换行).
  // 与 progress 区别: progress 是覆盖同一行的"streaming X chars"; tick 是
  // 累加的"·"——两者不会同时使用 (PR3 invokeAgent 用 tick, PR2 stream chars
  // 路径已废弃, 见 commands/render.ts).
  progressTick(): void {
    if (!isTTY() || flags.quiet) return;
    process.stderr.write(dim("·"));
  },

  // done: 收束 progress, 换行落定为静态记录
  done(msg: string): void {
    if (!isTTY() || flags.quiet) return;
    process.stderr.write(`\n${yellow(`[a2h] ${msg}`)}\n`);
  },

  // error: 始终打 stderr, 独立于 quiet/TTY (运维信号不能被屏蔽)
  error(msg: string): void {
    process.stderr.write(red(`⚠️  ${msg}`) + "\n");
  },
};
