'use strict';
// No subprocess or business imports: classify a completed TAP result without treating skips as success.
function assessResult({ exitCode, log, allowedSkips = 0, allowLegacySkip = false }) {
  const counts = Object.fromEntries([...log.matchAll(/^# (tests|pass|fail|cancelled|skipped|todo) (\d+)\r?$/gm)].map((m) => [m[1], Number(m[2])]));
  const skippedLines = log.split(/\r?\n/).filter((line) => /# SKIP\b/.test(line));
  const skipsValid = counts.skipped === 0 || (allowLegacySkip && counts.skipped === 1 && skippedLines.length === 1 &&
    skippedLines[0].includes('未提供显式脱敏旧库样本，未执行结构等价比较'));
  const complete = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].every((key) => Number.isInteger(counts[key]));
  return { exit_code: exitCode, counts, ok: exitCode === 0 && complete && counts.tests > 0 && counts.pass > 0 &&
    counts.fail === 0 && counts.cancelled === 0 && counts.todo === 0 && counts.skipped <= allowedSkips && skipsValid &&
    counts.tests === counts.pass + counts.skipped };
}
module.exports = { assessResult };
