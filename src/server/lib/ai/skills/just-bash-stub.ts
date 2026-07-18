/**
 * Build-time stub for `just-bash` (optional peer dep of `agents/skills`).
 *
 * The SDK's skill-script runner statically imports just-bash (~4 MB
 * minified simulated-bash environment) but only touches it inside
 * `runBashScript`. Our `run_skill_script` tool routes bash scripts to the
 * real sandbox container and only uses the loader runner for
 * function-style JS — so the bash simulator is dead weight in the worker
 * bundle (and most of a free-plan fork's 3 MB gzip budget).
 *
 * Both vite.config.ts and vitest.config.ts alias `just-bash` here. A fork
 * that wants loader-executed bash skill scripts instead: remove the alias
 * and `pnpm add just-bash`.
 */
const REMOVED =
  'just-bash is stubbed out of this build (bash skill scripts run in the sandbox container instead). ' +
  'To enable loader-based bash: remove the just-bash alias from vite.config.ts/vitest.config.ts and `pnpm add just-bash`.'

export class Bash {
  constructor() {
    throw new Error(REMOVED)
  }
}

export function defineCommand(): never {
  throw new Error(REMOVED)
}
