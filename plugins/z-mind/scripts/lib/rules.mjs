/**
 * Engineering Invariants Dictionary for Z-Mind
 */
export const ENGINEERING_RULES = {
  R_CORE: {
    title: "Universal Core & SOLID",
    tag: "core",
    summary: "Single Responsibility, High Cohesion, Low Coupling, Standard English naming, Deep Modules over shallow wrappers, Deletion Test for interfaces."
  },
  R_TDD: {
    title: "Test-Driven Development",
    tag: "tdd",
    summary: "Reproduction test first before modifying production code. Red-Green-Refactor cycle. 100% test contract preservation."
  },
  R_PERF: {
    title: "High Performance & Zero-Waste Allocation",
    tag: "perf",
    summary: "Span<T>, Memory<T>, ArrayPool<T>, zero GC allocations in tight loops, parameterized database queries, non-blocking async execution."
  },
  R_NEV: {
    title: "Net Engineering Value in Refactoring",
    tag: "refactor",
    summary: "Prohibit wrapper hell, single-implementation interfaces, and LOC inflation >30%. Enforce 4-axis Pareto improvement or trigger rollback."
  },
  R_PROOF: {
    title: "Zero-Trust Empirical Proof",
    tag: "proof",
    summary: "Forbid unverified self-praise ('clean', 'optimal'). Require Level 3+ empirical proof: compiler exit code 0, test assertion counts, profiler logs."
  },
  R_REUSE: {
    title: "Asset-First Discovery & Zero Redundancy",
    tag: "reuse",
    summary: "Survey existing codebase helpers (Helpers/, Utils/, Common/) before implementing custom utility logic. Redundant code is an immediate regression."
  },
  R_GIT: {
    title: "Git & Conventional Commits Discipline",
    tag: "git",
    summary: "Atomic commits only (1 feature/fix = 1 commit). Format: <type>(<scope>): <subject>. Stage files in scope only; avoid sweeping git add -A."
  },
  R_TEAM: {
    title: "Multi-Agent Teamwork & File Ownership",
    tag: "team",
    summary: "Subagent teams must maintain zero-collision file ownership contracts. Parallel research/execution partitions with adversarial review gates."
  }
};

export function queryRules(topic = "all") {
  const q = String(topic || "all").trim().toLowerCase();
  if (q === "all" || q === "") {
    return Object.entries(ENGINEERING_RULES).map(([code, r]) => ({ code, ...r }));
  }

  return Object.entries(ENGINEERING_RULES)
    .filter(([code, r]) => 
      code.toLowerCase().includes(q) || 
      r.tag.toLowerCase().includes(q) || 
      r.title.toLowerCase().includes(q) ||
      r.summary.toLowerCase().includes(q)
    )
    .map(([code, r]) => ({ code, ...r }));
}

export function auditPlan(text) {
  if (!text) return { passed: false, warnings: ["No text provided for audit."] };

  const warnings = [];
  const checks = [];

  // 1. Conventional Commits check if text looks like a commit
  if (text.includes("commit") || text.split("\n")[0].includes(":")) {
    const firstLine = text.trim().split("\n")[0];
    const isConventional = /^(feat|fix|refactor|test|docs|chore|perf|ci|style)(\([a-zA-Z0-9_\-\.\/]+\))?:\s.+/.test(firstLine);
    checks.push({ check: "Conventional Commit Format", passed: isConventional });
    if (!isConventional && firstLine.length < 100) {
      warnings.push(`Commit title '${firstLine}' does not match Conventional Commits '<type>(<scope>): <subject>'.`);
    }
  }

  // 2. Bugfix without reproduction test
  if (/bug|fix|error|fail|crash/i.test(text) && !/test|reproduce|assertion/i.test(text)) {
    warnings.push("Bugfix plan does not explicitly mention writing a deterministic reproduction test first (R_TDD).");
    checks.push({ check: "TDD Reproduction Gate", passed: false });
  } else {
    checks.push({ check: "TDD Reproduction Gate", passed: true });
  }

  // 3. Subjective self-praise check (R_PROOF)
  if (/perfect|optimal|flawless|completely clean/i.test(text)) {
    warnings.push("Plan uses subjective self-praise ('optimal', 'perfect'). Replace with Level 3+ empirical metrics (R_PROOF).");
    checks.push({ check: "Zero-Trust Empirical Proof", passed: false });
  } else {
    checks.push({ check: "Zero-Trust Empirical Proof", passed: true });
  }

  return {
    passed: warnings.length === 0,
    checks,
    warnings,
    summary: warnings.length === 0 ? "Plan adheres to Z-Mind engineering invariants." : `Audit found ${warnings.length} invariant warning(s).`
  };
}
