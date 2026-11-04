/**
 * Cognitive Router & Dynamic Token Budgeter
 * Agent Engineering Operating System (AEOS)
 *
 * Implements:
 * 1. Deterministic Intent Classifier (<1ms, zero LLM calls)
 * 2. Dynamic Context Token Budgeter (per-category allocations & clamping)
 * 3. DAG Execution Planner (topological multi-plugin orchestration graph)
 * 4. Human Approval Gates (destructive file / git / schema protection)
 */

export const INTENT_CATEGORIES = {
  BUGFIX: 'bugfix',
  REFACTOR: 'refactor',
  UI: 'ui',
  REVIEW: 'review',
  ARCHITECTURE: 'architecture',
  FEATURE: 'feature'
};

const INTENT_PATTERNS = [
  {
    category: INTENT_CATEGORIES.BUGFIX,
    re: /\b(?:fix|bug|error|exception|fail|failing|crash|deadlock|hang|timeout|infinite|leak|regression|broken|tạch|sửa\s*lỗi|lỗi|hỏng|bị\s*đứng|đơ|văng|xung\s*đột|không\s*chạy)\b/i,
    weight: 0.95
  },
  {
    category: INTENT_CATEGORIES.REVIEW,
    re: /\b(?:review|audit|gate|check\s*diff|pr\s*check|inspect\s*diff|verify\s*diff|soát\s*code|soát\s*lại|kiểm\s*tra|bảo\s*mật|thủng\s*bảo\s*mật)\b/i,
    weight: 0.90
  },
  {
    category: INTENT_CATEGORIES.REFACTOR,
    re: /\b(?:refactor|clean\s*up|modularize|split|extract|inline|wrapper|simplify|modernize|prune|restructure|dọn\s*dẹp|tối\s*ưu|tách\s*hàm|tách\s*class|tái\s*cấu\s*trúc|gọt\s*giũa)\b/i,
    weight: 0.88
  },
  {
    category: INTENT_CATEGORIES.UI,
    re: /\b(?:component|modal|form|css|tailwind|screen|view|ui|ux|frontend|dialog|canvas|widget|palette|theme|skin|giao\s*diện|nút|bảng|nút\s*bấm|màn\s*hình)\b/i,
    weight: 0.85
  },
  {
    category: INTENT_CATEGORIES.ARCHITECTURE,
    re: /\b(?:architecture|adr|architectural|subsystem|boundary|layer|microservices|domain\s*model|invariants|kiến\s*trúc|thiết\s*kế\s*hệ\s*thống)\b/i,
    weight: 0.85
  },
  {
    category: INTENT_CATEGORIES.FEATURE,
    re: /\b(?:add|create|implement|build|feature|endpoint|service|support|extend|scaffold|thêm|tạo\s*mới|phát\s*triển)\b/i,
    weight: 0.80
  }
];

const INTENT_CENTROIDS = {
  [INTENT_CATEGORIES.BUGFIX]: 'fix bug error fail exception deadlock crash broken sua loi hong tach do vang khong chay',
  [INTENT_CATEGORIES.REFACTOR]: 'refactor clean modularize split extract inline wrapper simplify don dep toi uu tach ham tai cau truc',
  [INTENT_CATEGORIES.UI]: 'component modal form css tailwind screen view dialog canvas widget giao dien nut bang man hinh',
  [INTENT_CATEGORIES.REVIEW]: 'review audit gate diff inspect verify security soat code kiem tra bao mat thung bao mat',
  [INTENT_CATEGORIES.ARCHITECTURE]: 'architecture adr subsystem boundary layer domain model invariants kien truc thiet ke he thong'
};

function calculateTrigramDice(a, b) {
  if (!a || !b) return 0;
  const strA = a.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const strB = b.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const getTrigrams = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 2; i++) set.add(s.slice(i, i + 3));
    return set;
  };
  const setA = getTrigrams(strA);
  const setB = getTrigrams(strB);
  if (setA.size === 0 || setB.size === 0) return 0;
  let matches = 0;
  for (const t of setA) if (setB.has(t)) matches++;
  return (2 * matches) / (setA.size + setB.size);
}

const DOMAIN_PATTERNS = [
  { tag: 'wms', re: /\b(?:wms|warehouse|inventory|stock|bin|transfer|handover|tồn\s*kho|kho)\b/i },
  { tag: 'finance', re: /\b(?:fin|finance|invoice|accounting|ledger|voucher|debit|credit|kế\s*toán)\b/i },
  { tag: 'database', re: /\b(?:sql|query|db|database|table|index|lock|deadlock|concurrency|migration)\b/i },
  { tag: 'dotnet', re: /\b(?:c#|csharp|dotnet|\.net|wpf|winforms|devexpress)\b/i },
  { tag: 'web', re: /\b(?:react|vue|node|express|api|frontend|backend|typescript|javascript)\b/i }
];

const DESTRUCTIVE_PATTERNS = [
  /\b(?:drop\s+table|drop\s+database|truncate\s+table)\b/i,
  /\b(?:delete\s+file|rmdir|rm\s+-rf|del\s+\/s)\b/i,
  /\b(?:git\s+push\s+--force|git\s+reset\s+--hard)\b/i
];

/**
 * Deterministic Task & Intent Classifier (<1ms latency)
 */
export class IntentClassifier {
  static classify(prompt, context = {}) {
    const text = String(prompt || '').trim();
    if (!text) {
      return {
        category: INTENT_CATEGORIES.FEATURE,
        confidence: 0.5,
        domainTags: [],
        destructive: false,
        rationale: 'Default category for empty prompt'
      };
    }

    let detectedCategory = INTENT_CATEGORIES.FEATURE;
    let maxWeight = 0.5;
    let matchedRule = null;

    for (const rule of INTENT_PATTERNS) {
      if (rule.re.test(text)) {
        if (rule.weight > maxWeight) {
          maxWeight = rule.weight;
          detectedCategory = rule.category;
          matchedRule = rule;
        }
      }
    }

    // If no exact regex rule matched, perform fuzzy semantic trigram matching
    if (!matchedRule) {
      let highestSimilarity = 0;
      let bestCentroidCategory = null;
      for (const [cat, centroid] of Object.entries(INTENT_CENTROIDS)) {
        const sim = calculateTrigramDice(text, centroid);
        if (sim > highestSimilarity) {
          highestSimilarity = sim;
          bestCentroidCategory = cat;
        }
      }
      if (highestSimilarity >= 0.18 && bestCentroidCategory) {
        detectedCategory = bestCentroidCategory;
        maxWeight = Math.min(0.85, 0.65 + highestSimilarity * 0.5);
        matchedRule = { category: bestCentroidCategory, semantic: true, similarity: highestSimilarity };
      }
    }

    // Extract domain tags
    const domainTags = [];
    for (const d of DOMAIN_PATTERNS) {
      if (d.re.test(text)) {
        domainTags.push(d.tag);
      }
    }

    // Check for destructive actions requiring human gate
    const destructive = DESTRUCTIVE_PATTERNS.some(re => re.test(text));

    return {
      category: detectedCategory,
      confidence: maxWeight,
      domainTags,
      destructive,
      rationale: matchedRule ? `Matched intent pattern for ${detectedCategory}` : 'Default feature fallback'
    };
  }
}

/**
 * Adaptive Dynamic Context Token Budgeter
 * Automatically scales context ceiling and category weight distribution based on:
 * - Task category (bugfix, refactor, ui, feature)
 * - Scope scale (files count, file size, blast radius)
 * - Task triviality (typo, formatting -> reduced allowance)
 */
export class TokenBudgeter {
  constructor(totalAllowance = 10000, options = {}) {
    this.baseAllowance = totalAllowance;
    this.category = options.category || null;
    this.scopeMultiplier = options.scopeMultiplier || 1.0;
    this.totalAllowance = this.calculateAdaptiveAllowance(options);
  }

  calculateAdaptiveAllowance(options = {}) {
    let multiplier = 1.0;
    const cat = options.category || this.category;
    const prompt = String(options.prompt || '').toLowerCase();

    // 1. Triviality check: small typo / format tasks don't need 10K tokens
    if (/\b(typo|formatting|comment|docstring|rename single|indent|whitespace)\b/.test(prompt)) {
      multiplier *= 0.35; // Co lại ~3,500 tokens
    } else if (cat === INTENT_CATEGORIES.REFACTOR || cat === INTENT_CATEGORIES.ARCHITECTURE) {
      // 2. High-complexity refactor / architecture tasks scale up
      multiplier *= 2.2; // Giãn nở ~22,000 tokens
    } else if (cat === INTENT_CATEGORIES.UI) {
      multiplier *= 1.25; // ~12,500 tokens
    }

    // 3. Scope scale (touched files count or large codebase target)
    if (options.filesCount && options.filesCount > 10) {
      multiplier *= 1.5;
    }
    if (options.fileSizeKb && options.fileSizeKb > 100) {
      multiplier *= 1.3;
    }

    const calculated = Math.round(this.baseAllowance * multiplier);
    // Clamp between floor of 3,000 and hard ceiling of 35,000 tokens
    return Math.max(3000, Math.min(35000, calculated));
  }

  getBudgets(taskCategory = this.category) {
    const total = this.totalAllowance;

    // Adaptive category weight shifting
    if (taskCategory === INTENT_CATEGORIES.REFACTOR) {
      // Refactoring needs heavily boosted symbol/AST outline context
      return {
        total,
        rules: Math.round(total * 0.10),     // 10%
        memory: Math.round(total * 0.10),    // 10%
        symbols: Math.round(total * 0.40),   // 40% (Boosted for AST outlines)
        history: Math.round(total * 0.30),   // 30%
        reserve: Math.round(total * 0.10)    // 10%
      };
    } else if (taskCategory === INTENT_CATEGORIES.BUGFIX) {
      // Bugfix needs heavily boosted episodic memory (gotchas & historical fixes)
      return {
        total,
        rules: Math.round(total * 0.10),     // 10%
        memory: Math.round(total * 0.30),    // 30% (Boosted for gotchas/lessons)
        symbols: Math.round(total * 0.20),   // 20%
        history: Math.round(total * 0.30),   // 30%
        reserve: Math.round(total * 0.10)    // 10%
      };
    } else if (taskCategory === INTENT_CATEGORIES.UI) {
      // UI needs design system tokens and 4-state matrix context
      return {
        total,
        rules: Math.round(total * 0.10),     // 10%
        memory: Math.round(total * 0.10),    // 10%
        symbols: Math.round(total * 0.15),   // 15%
        history: Math.round(total * 0.35),   // 35%
        reserve: Math.round(total * 0.10),   // 10%
        craft: Math.round(total * 0.20)      // 20% (Tokens & Micro-spec)
      };
    }

    // Default balanced distribution (Feature / Architecture / General)
    return {
      total,
      rules: Math.round(total * 0.10),     // 10% ~ 1,000 tokens
      memory: Math.round(total * 0.15),    // 15% ~ 1,500 tokens
      symbols: Math.round(total * 0.25),   // 25% ~ 2,500 tokens
      history: Math.round(total * 0.40),   // 40% ~ 4,000 tokens
      reserve: Math.round(total * 0.10)    // 10% ~ 1,000 tokens
    };
  }

  estimateTokens(text) {
    if (!text) return 0;
    // Fast estimation: 3.8 characters per token for code/structured text
    return Math.ceil(String(text).length / 3.8);
  }

  clampPayload(text, category = 'memory') {
    const budgets = this.getBudgets(this.category);
    const maxTokens = budgets[category] || 1500;
    const maxChars = Math.floor(maxTokens * 3.8);

    const str = String(text || '');
    if (str.length <= maxChars) {
      return { text: str, clamped: false, tokens: this.estimateTokens(str) };
    }

    const truncated = str.slice(0, maxChars) + '\n... [Context truncated by AEOS Token Budgeter]';
    return {
      text: truncated,
      clamped: true,
      originalTokens: this.estimateTokens(str),
      tokens: this.estimateTokens(truncated)
    };
  }
}

export const AdaptiveTokenBudgeter = TokenBudgeter;

/**
 * In-Memory DAG Execution Planner
 * Compiles categorized intents into multi-plugin orchestration graphs
 */
export class DAGPlanner {
  static buildPlan(intent, options = {}) {
    const budgeter = new TokenBudgeter(options.tokenBudget || 10000);
    const planId = `plan_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const category = intent.category || INTENT_CATEGORIES.FEATURE;

    const steps = [];

    switch (category) {
      case INTENT_CATEGORIES.BUGFIX:
        steps.push(
          {
            stepIndex: 1,
            pluginId: 'z-brain',
            capability: 'knowledge-query',
            action: 'Query historical gotchas and lessons (L0 Index)',
            input: { query: options.prompt, project: options.project || 'global' },
            dependsOn: [],
            requiresHumanApproval: false
          },
          {
            stepIndex: 2,
            pluginId: 'z-mind',
            capability: 'rules-provider',
            action: 'Fetch active engineering rules (R_TDD, R_PERF, R_PROOF)',
            input: { categories: ['invariants', 'cognition'] },
            dependsOn: [],
            requiresHumanApproval: false
          },
          {
            stepIndex: 3,
            pluginId: 'z-token',
            capability: 'code-outline',
            action: 'Extract symbols and declarations for target codebase',
            input: { target: options.targetFile || process.cwd() },
            dependsOn: [],
            requiresHumanApproval: false
          },
          {
            stepIndex: 4,
            pluginId: 'z-gate',
            capability: 'code-review',
            action: 'Audit reproduction test and diff against invariants (R_TDD, R_NEV)',
            input: { requireTdd: true },
            dependsOn: [1, 2, 3],
            requiresHumanApproval: false
          },
          {
            stepIndex: 5,
            pluginId: 'z-brain',
            capability: 'knowledge-harvest',
            action: 'Harvest verified bugfix lesson into episodic memory',
            input: { trust_level: 'verified_fact' },
            dependsOn: [4],
            requiresHumanApproval: false
          }
        );
        break;

      case INTENT_CATEGORIES.UI:
        steps.push(
          {
            stepIndex: 1,
            pluginId: 'z-mind',
            capability: 'rules-provider',
            action: 'Retrieve UI design system tokens & R_UX_MATRIX',
            input: { tags: ['ui', 'design-tokens'] },
            dependsOn: [],
            requiresHumanApproval: false
          },
          {
            stepIndex: 2,
            pluginId: 'z-craft',
            capability: 'spec-generation',
            action: 'Generate 4-State UX Micro-Contract (Default, Loading, Empty, Error)',
            input: { prompt: options.prompt },
            dependsOn: [1],
            requiresHumanApproval: false
          },
          {
            stepIndex: 3,
            pluginId: 'z-craft',
            capability: 'anti-slop-lint',
            action: 'Lint component code with AST Anti-Slop linter (R_ANTI_SLOP)',
            input: { target: options.targetFile },
            dependsOn: [2],
            requiresHumanApproval: false
          },
          {
            stepIndex: 4,
            pluginId: 'z-craft',
            capability: 'canvas-preview',
            action: 'Generate interactive Generative Canvas HTML preview',
            input: { title: options.prompt },
            dependsOn: [3],
            requiresHumanApproval: false
          }
        );
        break;

      case INTENT_CATEGORIES.REFACTOR:
        steps.push(
          {
            stepIndex: 1,
            pluginId: 'z-token',
            capability: 'code-outline',
            action: 'Analyze callers, symbol outlines, and class boundaries',
            input: { target: options.targetFile || process.cwd() },
            dependsOn: [],
            requiresHumanApproval: false
          },
          {
            stepIndex: 2,
            pluginId: 'z-mind',
            capability: 'rules-provider',
            action: 'Retrieve Net Engineering Value invariants (R_NEV, Deletion Test)',
            input: { category: 'invariants' },
            dependsOn: [],
            requiresHumanApproval: false
          },
          {
            stepIndex: 3,
            pluginId: 'z-gate',
            capability: 'nev-audit',
            action: 'Enforce Net Engineering Value gate (LOC <= 0%, no single-impl wrappers)',
            input: { strictNev: true },
            dependsOn: [1, 2],
            requiresHumanApproval: false
          }
        );
        break;

      case INTENT_CATEGORIES.REVIEW:
        steps.push(
          {
            stepIndex: 1,
            pluginId: 'z-gate',
            capability: 'code-review',
            action: 'Execute unified code review gate (P0 Security, Invariants, Deadlocks)',
            input: { diff: options.diff },
            dependsOn: [],
            requiresHumanApproval: false
          },
          {
            stepIndex: 2,
            pluginId: 'z-craft',
            capability: 'anti-slop-lint',
            action: 'Check UI diff for arbitrary hex colors and neon gradients',
            input: { diff: options.diff },
            dependsOn: [1],
            requiresHumanApproval: false
          }
        );
        break;

      default: // FEATURE
        steps.push(
          {
            stepIndex: 1,
            pluginId: 'z-brain',
            capability: 'knowledge-query',
            action: 'Query prior architectural patterns and domain gotchas',
            input: { query: options.prompt, project: options.project || 'global' },
            dependsOn: [],
            requiresHumanApproval: false
          },
          {
            stepIndex: 2,
            pluginId: 'z-mind',
            capability: 'rules-provider',
            action: 'Fetch Core & Architecture invariants (R_CORE, Deep Modules)',
            input: { category: 'invariants' },
            dependsOn: [],
            requiresHumanApproval: false
          },
          {
            stepIndex: 3,
            pluginId: 'z-token',
            capability: 'code-outline',
            action: 'Scan module symbols to establish integration seams',
            input: { target: options.targetFile || process.cwd() },
            dependsOn: [],
            requiresHumanApproval: false
          },
          {
            stepIndex: 4,
            pluginId: 'z-gate',
            capability: 'code-review',
            action: 'Audit new implementation diff before commit',
            input: {},
            dependsOn: [1, 2, 3],
            requiresHumanApproval: false
          }
        );
        break;
    }

    // Attach destructive human gate flag if detected
    if (intent.destructive) {
      steps.push({
        stepIndex: steps.length + 1,
        pluginId: 'z-runtime',
        capability: 'approval-gate',
        action: 'HUMAN APPROVAL REQUIRED: Destructive file or database mutation detected',
        input: { rationale: 'Prompt contains destructive patterns' },
        dependsOn: steps.map(s => s.stepIndex),
        requiresHumanApproval: true
      });
    }

    return {
      id: planId,
      category,
      domainTags: intent.domainTags || [],
      tokenBudget: budgeter.totalAllowance,
      tokenBreakdown: budgeter.getBudgets(),
      requiresHumanApproval: intent.destructive || false,
      steps
    };
  }

  /**
   * Partitions DAG steps into parallel topological execution layers (Layer 0, Layer 1, etc.)
   */
  static getExecutionBatches(plan) {
    const steps = [...plan.steps];
    const completed = new Set();
    const batches = [];

    while (completed.size < steps.length) {
      // Find all steps whose dependencies have all been completed
      const currentBatch = steps.filter(
        s => !completed.has(s.stepIndex) && s.dependsOn.every(dep => completed.has(dep))
      );

      if (currentBatch.length === 0) {
        // Cyclic dependency detected or unresolvable step
        throw new Error(`Cycle or unresolvable dependency in DAG plan '${plan.id}'`);
      }

      batches.push(currentBatch);
      for (const s of currentBatch) {
        completed.add(s.stepIndex);
      }
    }

    return batches;
  }
}

/**
 * Cognitive Router Facade
 */
export class CognitiveRouter {
  constructor(options = {}) {
    this.eventBus = options.eventBus || null;
    this.serviceRegistry = options.serviceRegistry || null;
    this.defaultBudget = options.defaultBudget || 10000;
  }

  route(prompt, context = {}) {
    const startTime = Date.now();

    // 1. Classify intent (<1ms)
    const intent = IntentClassifier.classify(prompt, context);

    if (this.eventBus) {
      this.eventBus.emit('router:intent_classified', {
        intent,
        prompt,
        timestamp: new Date().toISOString()
      });
    }

    // 2. Generate DAG Plan
    const plan = DAGPlanner.buildPlan(intent, {
      ...context,
      prompt,
      tokenBudget: this.defaultBudget
    });

    // 3. Compute Parallel Execution Batches
    const batches = DAGPlanner.getExecutionBatches(plan);

    const result = {
      intent,
      plan,
      batches,
      durationMs: Date.now() - startTime
    };

    if (this.eventBus) {
      this.eventBus.emit('router:plan_created', {
        planId: plan.id,
        category: plan.category,
        stepCount: plan.steps.length,
        batchCount: batches.length
      });
    }

    return result;
  }
}
