// BR-09: Orchestration Engine — execution order, dependency handling, retry logic

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// BR-09.3: Retry a step with exponential backoff
async function withRetry(fn, stepName, maxRetries = DEFAULT_MAX_RETRIES) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`[Orchestration] Running step "${stepName}" (attempt ${attempt}/${maxRetries})`);
      const result = await fn();
      console.log(`[Orchestration] Step "${stepName}" succeeded`);
      return result;
    } catch (err) {
      lastError = err;
      console.warn(`[Orchestration] Step "${stepName}" failed (attempt ${attempt}): ${err.message}`);
      if (attempt < maxRetries) {
        const delay = DEFAULT_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
        console.log(`[Orchestration] Retrying "${stepName}" in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }
  throw new Error(`Step "${stepName}" failed after ${maxRetries} attempts: ${lastError.message}`);
}

// BR-09.1 + BR-09.2: Execute steps in order, respecting dependencies
export class Orchestrator {
  constructor() {
    this.steps = [];
    this.results = {};
    this.errors = [];
    this.executionLog = [];
  }

  // Register a step with optional dependencies
  addStep(name, fn, { dependsOn = [], required = true, maxRetries = DEFAULT_MAX_RETRIES } = {}) {
    this.steps.push({ name, fn, dependsOn, required, maxRetries });
    return this;
  }

  // BR-09.1: Execute all steps in dependency-resolved order
  async execute() {
    const order = this._resolveDependencyOrder();
    console.log("[Orchestration] Execution order:", order.map((s) => s.name).join(" → "));

    for (const step of order) {
      // BR-09.2: Check all dependencies have succeeded
      const failedDeps = step.dependsOn.filter(
        (dep) => this.errors.find((e) => e.step === dep)
      );

      if (failedDeps.length > 0) {
        const msg = `Skipping "${step.name}": dependencies failed: ${failedDeps.join(", ")}`;
        console.warn("[Orchestration]", msg);
        this.errors.push({ step: step.name, error: msg, skipped: true });
        this.executionLog.push({ step: step.name, status: "skipped", reason: msg, timestamp: new Date().toISOString() });
        continue;
      }

      const start = Date.now();
      try {
        // Pass results of dependencies into the step function
        const depResults = step.dependsOn.reduce((acc, dep) => {
          acc[dep] = this.results[dep];
          return acc;
        }, {});

        const result = await withRetry(
          () => step.fn(depResults, this.results),
          step.name,
          step.maxRetries
        );

        this.results[step.name] = result;
        this.executionLog.push({
          step: step.name,
          status: "success",
          duration_ms: Date.now() - start,
          timestamp: new Date().toISOString(),
        });
      } catch (err) {
        this.errors.push({ step: step.name, error: err.message });
        this.executionLog.push({
          step: step.name,
          status: "failed",
          error: err.message,
          duration_ms: Date.now() - start,
          timestamp: new Date().toISOString(),
        });

        if (step.required) {
          throw new Error(`Required step "${step.name}" failed: ${err.message}`);
        } else {
          console.warn(`[Orchestration] Optional step "${step.name}" failed, continuing...`);
        }
      }
    }

    return {
      results: this.results,
      errors: this.errors,
      executionLog: this.executionLog,
      success: this.errors.filter((e) => !e.skipped).length === 0,
    };
  }

  // Topological sort to resolve dependency order
  _resolveDependencyOrder() {
    const nameToStep = new Map(this.steps.map((s) => [s.name, s]));
    const visited = new Set();
    const ordered = [];

    const visit = (step) => {
      if (visited.has(step.name)) return;
      visited.add(step.name);

      for (const dep of step.dependsOn) {
        const depStep = nameToStep.get(dep);
        if (!depStep) throw new Error(`Unknown dependency "${dep}" for step "${step.name}"`);
        visit(depStep);
      }

      ordered.push(step);
    };

    for (const step of this.steps) {
      visit(step);
    }

    return ordered;
  }
}

// Factory: build the standard catalog item orchestrator
export function buildCatalogOrchestrator(ast, services) {
  const {
    createCatalogItemFn,
    createVariablesFn,
    createFlowFn,
    createApprovalFn,
    createBusinessRuleFn,
    createClientScriptFn,
    createATFTestFn,
    executeATFFn,
    generateUpdateSetFn,
  } = services;

  const orch = new Orchestrator();

  orch
    .addStep("catalogItem", () => createCatalogItemFn(ast), { required: true })
    .addStep("variables", (deps) => createVariablesFn(ast, deps.catalogItem?.sys_id), {
      dependsOn: ["catalogItem"],
      required: true,
    })
    .addStep("flow", (deps) => createFlowFn(ast, deps.catalogItem?.sys_id), {
      dependsOn: ["catalogItem"],
      required: true,
    })
    .addStep("approval", (deps) => createApprovalFn(ast, deps.flow?.sys_id), {
      dependsOn: ["flow"],
      required: false,
    })
    .addStep("businessRule", (deps) => createBusinessRuleFn(ast, deps.catalogItem?.sys_id), {
      dependsOn: ["catalogItem"],
      required: false,
      maxRetries: 2,
    })
    .addStep("clientScript", (deps) => createClientScriptFn(ast, deps.catalogItem?.sys_id), {
      dependsOn: ["catalogItem"],
      required: false,
      maxRetries: 2,
    })
    .addStep("testCase", (deps) => createATFTestFn(ast, deps.catalogItem?.sys_id), {
      dependsOn: ["catalogItem", "variables"],
      required: false,
    })
    .addStep("testResult", (deps) => executeATFFn(deps.testCase?.sys_id), {
      dependsOn: ["testCase"],
      required: false,
    })
    .addStep("updateSet", (deps, allResults) => generateUpdateSetFn(ast, allResults), {
      dependsOn: ["catalogItem", "variables", "flow"],
      required: true,
    });

  return orch;
}
