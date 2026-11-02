/**
 * Dynamic Streaming Output Sampler & Noise Truncator
 * Prevents massive command stdout dumps (>10 KB or >50 lines) from blowing the context window.
 */

export function compactStreamOutput(rawOutput, options = {}) {
  if (!rawOutput || typeof rawOutput !== 'string') return '';

  const maxHead = options.maxHead ?? 15;
  const maxTail = options.maxTail ?? 15;
  const maxErrors = options.maxErrors ?? 12;
  const maxByteCap = options.maxByteCap ?? 10240; // 10 KB

  const lines = rawOutput.split(/\r?\n/);
  if (lines.length <= maxHead + maxTail && Buffer.byteLength(rawOutput) <= maxByteCap) {
    return rawOutput;
  }

  const headLines = lines.slice(0, maxHead);
  const tailLines = lines.slice(-maxTail);
  const middleLines = lines.slice(maxHead, -maxTail);

  // Extract critical error lines from middle
  const ERROR_PATTERN = /\b(?:error|fail|failed|exception|panic|fatal|assert|at\s+[\w\.\/]+:\d+)\b/i;
  const criticalErrors = [];
  const seenErrors = new Set();

  for (const line of middleLines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (ERROR_PATTERN.test(trimmed)) {
      const signature = trimmed.slice(0, 120);
      if (!seenErrors.has(signature)) {
        seenErrors.add(signature);
        criticalErrors.push(`  ${trimmed.slice(0, 200)}`);
        if (criticalErrors.length >= maxErrors) break;
      }
    }
  }

  const omittedCount = middleLines.length - criticalErrors.length;
  const outputParts = [...headLines];

  if (criticalErrors.length > 0) {
    outputParts.push(
      '',
      `--- [CRITICAL DIAGNOSTICS (${criticalErrors.length} sampled from omitted lines)] ---`,
      ...criticalErrors
    );
  }

  outputParts.push(
    '',
    `... [Folded ${omittedCount} lines of repetitive stdout noise. Use targeted flags to narrow] ...`,
    '',
    ...tailLines
  );

  return outputParts.join('\n');
}
