// =====================================================================
// src/logger.ts —— 唯一 stderr 出口
// 协议: .trellis/spec/backend/logging-guidelines.md
// 红线: stdout 永远只承载数据 (HTML / JSON 错误对象), stderr 承载所有
// 给人看的字符。
//
// TTY 检测分流原则 (per logging-guidelines.md "进度协议"):
//   走 stderr 的输出 (info / verbose / progress / progressTick / done)
//   只看 process.stderr.isTTY —— 不看 stdout.isTTY。
//   理由: 心跳走 stderr, stdout 是数据通道 (常被 `> out.html` 重定向),
//   双通道独立判定; 若把 stdout.isTTY 拖进 stderr 反馈通道判定, 会在
//   `a2h render in.md > out.html` 场景下错误地干掉 stderr 心跳.
// =====================================================================

type Flags = { quiet: boolean; verbose: boolean };

// ─── module-local state ──────────────────────────────────────────────
let flags: Flags = { quiet: false, verbose: false };

export function configureLogger(f: Flags): void {
  flags = f;
}

// ─── DI seam: 测试可覆盖的 TTY 检测与 stderr 写入 ────────────────────
// 与 src/commands/render.ts 的 isTTY DI 同风格. 生产路径走默认实现,
// 测试通过 _testing 接口注入 mock — 不依赖真实 process.stderr 状态.
let stderrIsTtyOverride: boolean | undefined = undefined;
let stderrCapture: ((s: string) => void) | undefined = undefined;

const stderrIsTty = (): boolean =>
  stderrIsTtyOverride !== undefined
    ? stderrIsTtyOverride
    : process.stderr.isTTY === true;

const writeStderr = (s: string): void => {
  if (stderrCapture) stderrCapture(s);
  else process.stderr.write(s);
};

// ─── 心跳可见性: 仅 stderr.isTTY + !quiet ────────────────────────────
// 走 stderr 的人读输出 (progress / progressTick / info / verbose / done)
// 共用此判定. error 例外: 始终打, 仅颜色受 stderr.isTTY 影响.
const stderrVisible = (): boolean => stderrIsTty() && !flags.quiet;

const useColor = (): boolean => stderrIsTty() && !process.env["NO_COLOR"];

// ─── 极简 ANSI (不引 chalk / picocolors) ─────────────────────────────
const yellow = (s: string): string => (useColor() ? `\x1b[33m${s}\x1b[0m` : s);
const red = (s: string): string => (useColor() ? `\x1b[31m${s}\x1b[0m` : s);
const dim = (s: string): string => (useColor() ? `\x1b[2m${s}\x1b[0m` : s);

// ─── public API: 4 个方法,刻意不分 debug/warn ───────────────────────
export const log = {
  // info: stderr TTY 且非 quiet 时打
  info(msg: string): void {
    if (!stderrVisible()) return;
    writeStderr(dim(`[a2h] ${msg}`) + "\n");
  },

  // verbose: 仅 --verbose + stderr TTY + !quiet
  // 排错用; quiet 仍优先级最高
  verbose(msg: string): void {
    if (!flags.verbose || !stderrVisible()) return;
    writeStderr(dim(`[a2h] ${msg}`) + "\n");
  },

  // progress: \r 覆盖同一行, 仅 stderr TTY
  progress(msg: string): void {
    if (!stderrVisible()) return;
    writeStderr(`\r${dim(`[a2h] ${msg}`)}`);
  },

  // progressTick: 时间心跳, 每次 invoke 心跳触发追加一个点 (不换行).
  // 与 progress 区别: progress 是覆盖同一行的"streaming X chars"; tick 是
  // 累加的"·"——两者不会同时使用 (PR3 invokeAgent 用 tick, PR2 stream chars
  // 路径已废弃, 见 commands/render.ts).
  progressTick(): void {
    if (!stderrVisible()) return;
    writeStderr(dim("·"));
  },

  // done: 收束 progress, 换行落定为静态记录
  done(msg: string): void {
    if (!stderrVisible()) return;
    writeStderr(`\n${yellow(`[a2h] ${msg}`)}\n`);
  },

  // error: 始终打 stderr, 独立于 quiet/TTY (运维信号不能被屏蔽)
  // 颜色仍由 stderr.isTTY + NO_COLOR 决定.
  error(msg: string): void {
    writeStderr(red(`⚠️  ${msg}`) + "\n");
  },
};

// ─── 测试钩子 (生产代码不调用) ───────────────────────────────────────
// 与 commands/render.ts 的 RunRenderDeps.isTTY 同 DI 风格; 测试不污染
// 生产路径 (生产时 override 始终为 undefined → fallback 到 process.stderr).
export const _testing = {
  setStderrIsTty(v: boolean | undefined): void {
    stderrIsTtyOverride = v;
  },
  setStderrCapture(fn: ((s: string) => void) | undefined): void {
    stderrCapture = fn;
  },
  resetFlags(): void {
    flags = { quiet: false, verbose: false };
  },
};
