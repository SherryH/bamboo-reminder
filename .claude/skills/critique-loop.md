---
name: critique-loop
description: >
  Auto-critiqued planning. Explores codebase, writes a plan,
  spawns 2 critic agents in parallel, iterates until convergence.
  Use instead of plan mode for higher-quality plans.
---

# Critique Loop Skill

## Overview

This skill replaces Claude Code's plan mode with an automated plan-critique-converge
cycle. It produces higher-quality plans through adversarial review by two specialized
critic agents.

## Invocation

```
/critique-loop <task description>
```

Or with an existing plan:
```
/critique-loop --resume docs/plans/YYYY-MM-DD-<topic>-design.md
```

## Phase 1: EXPLORE & PLAN

**Mode**: Read-only. DO NOT write any implementation code.

**Tools allowed**: Read, Glob, Grep, WebSearch, WebFetch

**Instructions**:
1. Explore the codebase to understand existing structure, patterns, and constraints
2. Research any external dependencies or APIs needed
3. Write a plan document to `docs/plans/YYYY-MM-DD-<topic>-design.md`
4. The plan must include: architecture, tech stack, data flow, project structure,
   environment variables, and future extension points
5. Keep the plan focused — apply YAGNI ruthlessly

**Output**: Plan file written to disk.

## Phase 2: CRITIQUE

**Spawn two Task agents in parallel** using `subagent_type: general-purpose`.

### Critic A: Devil's Advocate

**Prompt template**:
```
You are a Devil's Advocate code reviewer. Your job is to find what's MISSING
or could BREAK in this plan.

Check for:
- Gaps: missing error handling, no fallback for API failures, unhandled edge cases
- Assumptions: what does the plan assume that isn't validated?
- Security: API keys exposed? Auth missing? Data privacy concerns?
- Scalability: what breaks with 10x usage?
- Dependencies: external service risks, deprecation, version issues

Rate each issue:
- CRITICAL: Plan will fail without addressing this
- MAJOR: Significant risk or gap
- MINOR: Nice to have, not blocking

TASK DESCRIPTION:
{task_description}

PLAN:
{plan_content}

Respond with a structured list of issues, each with severity and a one-line fix suggestion.
```

### Critic B: Pragmatist

**Prompt template**:
```
You are a Pragmatist code reviewer. Your job is to find what's UNNECESSARY
or OVER-ENGINEERED in this plan.

Check for:
- YAGNI violations: features that aren't needed for v1
- Complexity: simpler alternatives that achieve the same goal
- Scope creep: work that belongs in future versions
- Simpler alternatives: easier tech choices, fewer moving parts
- Effort vs value: high-effort items with low impact

Rate each issue:
- REMOVE: shouldn't be in the plan at all
- SIMPLIFY: right idea, over-engineered approach
- DEFER: good idea but not for v1
- NIT: minor style/wording issue

TASK DESCRIPTION:
{task_description}

PLAN:
{plan_content}

Respond with a structured list of issues, each with severity and a one-line suggestion.
```

**Both agents run in parallel** via two Task tool calls in the same message.

## Phase 3: REVISE

1. Read both critic responses
2. For each issue rated CRITICAL or REMOVE: must address
3. For each MAJOR or SIMPLIFY: should address
4. For MINOR, DEFER, NIT: note but don't necessarily change
5. Update the plan file using Edit tool
6. Log changes in a "Change Log" section at the bottom of the plan

## Phase 4: CONVERGE OR LOOP

**Convergence rule**:
```
CONVERGED if ALL of:
  - Zero CRITICAL issues from Devil's Advocate
  - Zero REMOVE issues from Pragmatist
  - Combined MAJOR + SIMPLIFY count <= 2
```

**If NOT converged AND round < 3**: Go back to Phase 2 with updated plan.

**If converged OR round >= 3**: Proceed to Phase 5.

**Max rounds**: 3 (hard stop to prevent infinite loops).

## Phase 5: PRESENT & DECIDE

Display a summary to the user:

```
══ Critique Loop Complete ══════════════════
Rounds: {round_count} ({converged|forced stop})
Plan: {plan_file_path}

── Change Log ──
v1 → v2: {summary of changes}
v2 → v3: {summary of changes}

── Remaining Minor Issues ──
• {any unaddressed minor/nit issues}

── Ready to implement? (y/n) ──
```

**On yes**: Transition to implementation mode with full write tools.
Use the converged plan as the implementation spec.

**On no**: User can manually edit the plan file.
Re-run with `/critique-loop --resume <plan-file>` for another critique pass.

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| Max rounds | 3 | Hard stop for convergence |
| Critic model | same as parent | Can use `model: haiku` for faster/cheaper critics |
| Plan location | `docs/plans/` | Where plan files are written |

## Integration with SuperClaude

- **Replaces**: Built-in plan mode for tasks that benefit from adversarial review
- **Complements**: `critique-plan` skill (this automates what critique-plan does manually)
- **Works with**: All existing flags (`--think`, `--uc`, persona flags)
- **Triggers**: Use for any non-trivial implementation task
