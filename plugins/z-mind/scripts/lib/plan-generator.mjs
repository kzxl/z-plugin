/**
 * Z-Mind TDD & Architectural Plan Synthesizer
 * Generates disciplined, multi-phase execution plans adhering to canonical invariants:
 * R_TDD, R_NEV, R_REUSE, R_PROOF, and R_GIT.
 */

export function synthesizePlan(taskDescription, options = {}) {
  const task = taskDescription.trim();
  const isBugfix = /fix|bug|fail|error|crash|exception|deadlock|freeze/i.test(task);
  const isRefactor = /refactor|cleanup|clean|split|modularize|reorganize/i.test(task);
  const mode = isBugfix ? 'BUGFIX' : isRefactor ? 'REFACTOR' : 'FEATURE';

  const plan = {
    task,
    mode,
    invariantsEnforced: ['R_TDD', 'R_NEV', 'R_REUSE', 'R_PROOF', 'R_GIT'],
    phases: [
      {
        phase: 1,
        title: 'Sensory Sweep & Asset Reuse Check (R_REUSE)',
        steps: [
          'Run zbrain_fetch to retrieve historical gotchas and past regression atoms.',
          'Execute zgate_find_helpers to discover existing helper methods in Helpers/, Extensions/, and Common/.',
          'Map blast radius and file ownership boundaries.'
        ]
      },
      {
        phase: 2,
        title: isBugfix ? 'Reproduction Test Specification (R_TDD Red)' : 'Contract & Specification Test (R_TDD)',
        steps: [
          isBugfix
            ? 'Write an automated failing reproduction test that deterministically captures the bug/regression.'
            : 'Write specification tests defining the observable behavioral contract of the new feature/slice.',
          'Execute tests via z-token (compact test runner) to empirically confirm the failure before touching production code.'
        ]
      },
      {
        phase: 3,
        title: 'Seam Analysis & Interface Deletion Test (R_NEV)',
        steps: [
          'Design minimal module interfaces (Deep Modules, simple interface hiding complexity).',
          'Apply Interface Deletion Test: verify every proposed interface has multiple polymorphic implementations or an explicit mock seam.',
          'Enforce strict non-positive or neutral line growth (<= 0% net LOC bloat for refactorings).'
        ]
      },
      {
        phase: 4,
        title: 'Vertical Slice Implementation & Performance Gate (R_PERF)',
        steps: [
          'Implement the minimal production code to turn all tests green.',
          'Enforce parameterization, connection pooling, and row-level lock discipline (R_DB, R_ERP_GATE).',
          'Enforce async discipline: eliminate sync-over-async .Result/.Wait(), ensure ConfigureAwait(false) in non-UI code.'
        ]
      },
      {
        phase: 5,
        title: 'Empirical Verification, Review & Knowledge Harvest (R_PROOF, R_GIT)',
        steps: [
          'Execute full test suite and compiler build to establish Level 3+ empirical proof (exit code 0).',
          'Run zgate_review to audit diff against security, concurrency, and UI anti-slop rules.',
          'Create atomic git commit adhering to Conventional Commits format: <type>(<scope>): <subject>.',
          'Execute zbrain_harvest to distill and store verified atomic lesson into episodic memory.'
        ]
      }
    ]
  };

  const markdown = [
    `# 📋 Z-MIND TDD EXECUTION PLAN [${mode}]`,
    `**Target Task**: ${task}\n`,
    `> [!IMPORTANT]`,
    `> Governed by canonical invariants: \`R_TDD\` (Reproduction test first), \`R_NEV\` (Interface Deletion Test), \`R_REUSE\` (Zero redundant hand-rolled logic), \`R_PROOF\` (Level 3 empirical verification).\n`,
    ...plan.phases.map(p => [
      `### Phase ${p.phase}: ${p.title}`,
      ...p.steps.map(s => `- [ ] ${s}`),
      ''
    ].join('\n'))
  ].join('\n');

  return {
    raw: plan,
    markdown
  };
}
