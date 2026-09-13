/**
 * The live-coding step branches, generated from the @live markers on main.
 *
 *   pnpm steps:generate               one commit per step on top of the first commit, and the step branches on them
 *   pnpm steps:verify                 check every step branch: diff, typecheck + build, /hello smoke test
 *   pnpm steps:verify --diff-only     only the diff check (no install, build or agent)
 *
 * The start of a step is the same commit as the solution of the step before:
 *
 *   01-backend-start       Step 0 · Starting point                              every step open
 *   01-backend-solution    Step 1 · Backend with the AG-UI libraries            = 03-sse-client-start
 *   03-sse-client-solution Step 3 · Angular client without CopilotKit           = 04-copilotkit-start
 *   04-copilotkit-solution Step 4 · CopilotKit for Angular                      = 05-protobuf-start
 *   05-protobuf-solution   Step 5 · The same chat over protobuf (with 5s)       = 06-see-start
 *   06-see-solution        Step 6 · SEE: activity while the tool runs           = 07-ask-start
 *   07-ask-solution        Step 7 · ASK: the agent proposes, the human decides  = 08-decide-start
 *   08-decide-solution     Step 8 · DECIDE: an interrupt ends the run           = 09-delegate-start
 *   09-delegate-solution   Step 9 · DELEGATE: one subagent per provider
 *
 * An open step looks the way `pnpm live:reset` leaves it: // ▶ step N: title, the stub lines, // ◀ step N.
 * A solved step keeps its arrows with the code between them, the way the speaker types it.
 *
 * generate  Reads the committed tree of main, never the working tree, and refuses to run while main has uncommitted
 *           changes. Builds the commits in a temporary detached worktree and force-updates only the step branches,
 *           never main. The commits reuse main's commit date, so the same main always gives the same commits.
 * verify    (a) git diff <step>-start <step>-solution changes only lines between that step's arrows, and the added
 *               lines are the step's @live code on main.
 *           (b) pnpm install --frozen-lockfile and nx run-many -t typecheck build on every commit (one temporary worktree).
 *           (c) From step 1 on, the agent runs on PORT 18930 and scripts/smoke.ts checks /hello over SSE and protobuf.
 *           Prints a PASS/FAIL table and exits non-zero on any failure. Logs go to tmp/steps-verify/.
 *
 * If a run is interrupted, `git worktree prune` removes the leftover temporary worktree.
 */
import { spawn, spawnSync } from 'node:child_process';
import { appendFileSync, closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { ANCHOR, byStep, hasRegions, regions, render } from './markers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MAIN = 'main';
const SOURCES = ['apps/agent/src', 'apps/web/src'];
const LOGS = join(ROOT, 'tmp', 'steps-verify');
const SMOKE_PORT = 18930;

/** One commit per entry, in order. `branch` names the step pair that ends at this commit; its start is the commit before. */
const STEPS = [
  { step: 0, title: 'Starting point' },
  { step: 1, title: 'Backend with the AG-UI libraries', branch: '01-backend' },
  { step: 3, title: 'Angular client without CopilotKit', branch: '03-sse-client' },
  { step: 4, title: 'CopilotKit for Angular', branch: '04-copilotkit' },
  { step: 5, title: 'The same chat over protobuf', branch: '05-protobuf' },
  { step: 6, title: 'SEE: activity while the tool runs', branch: '06-see' },
  { step: 7, title: 'ASK: the agent proposes, the human decides', branch: '07-ask' },
  { step: 8, title: 'DECIDE: an interrupt ends the run', branch: '08-decide' },
  { step: 9, title: 'DELEGATE: one subagent per provider', branch: '09-delegate' },
];

const [command, ...args] = process.argv.slice(2);

try {
  if (command === 'generate') generate();
  else if (command === 'verify') process.exitCode = await verify(args);
  else throw new Error(`Unknown command "${command ?? ''}". Use generate, or verify [--diff-only].`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

// ── generate ───────────────────────────────────────────────────────────────────

function generate() {
  const checkedOut = checkedOutBranches();
  const mainCheckout = checkedOut.get(MAIN);
  if (mainCheckout) {
    const changes = git(['status', '--porcelain'], mainCheckout);
    if (changes) throw new Error(`${MAIN} has uncommitted changes in ${mainCheckout}. The step branches are built from its last commit, so commit or stash first:\n${changes}`);
  }
  for (const branch of stepBranches()) {
    if (checkedOut.has(branch)) throw new Error(`${branch} is checked out in ${checkedOut.get(branch)}. Switch that checkout to ${MAIN} first.`);
  }

  const main = git(['rev-parse', '--verify', `${MAIN}^{commit}`]);
  const roots = git(['rev-list', '--max-parents=0', main]).split('\n');
  if (roots.length !== 1) throw new Error(`${MAIN} has ${roots.length} root commits, expected exactly one.`);
  const date = git(['show', '-s', '--format=%cI', main]);
  const files = markedFiles(main);

  const worktree = mkdtempSync(join(tmpdir(), 'ag-ui-steps-'));
  const commits = [];
  try {
    git(['worktree', 'add', '--quiet', '--detach', worktree, roots[0]]);
    for (const step of STEPS) {
      git(['read-tree', '--reset', '-u', main], worktree);
      for (const file of files) {
        writeFileSync(join(worktree, file.path), render(file.text, file.path, (id) => stepOf(id) <= step.step));
      }
      git(['add', '--all'], worktree);
      git(['commit', '--quiet', '--no-verify', '--file', '-'], worktree, {
        input: commitMessage(step, files),
        env: { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
      });
      commits.push(git(['rev-parse', 'HEAD'], worktree));
    }
  } finally {
    removeWorktree(worktree);
  }

  const updates = [];
  for (let i = 1; i < STEPS.length; i++) {
    updates.push([`${STEPS[i].branch}-start`, commits[i - 1]], [`${STEPS[i].branch}-solution`, commits[i]]);
  }
  for (const [branch, commit] of updates) {
    const before = resolveBranch(branch);
    git(['branch', '--force', branch, commit]);
    updates.find((update) => update[0] === branch).push(before === commit ? 'unchanged' : before ? 'updated' : 'created');
  }

  console.log(`Generated ${STEPS.length} step commits from ${MAIN} (${main.slice(0, 7)}) on top of ${roots[0].slice(0, 7)}:\n`);
  STEPS.forEach((step, i) => {
    const names = updates.filter(([, commit]) => commit === commits[i]).map(([branch, , state]) => `${branch} (${state})`);
    console.log(`  ${commits[i].slice(0, 7)}  Step ${step.step} · ${step.title}\n           ${names.join(', ')}`);
  });
}

function commitMessage(step, files) {
  const lines = [];
  if (step.step === 0) {
    lines.push('Every step is open, the way `pnpm live:reset` leaves it: the arrows', 'and the placeholder lines between them.', '', 'Files with steps:');
    for (const file of files) lines.push(`- ${file.path} (step ${ids(file.regions).join(', ')})`);
  } else {
    lines.push(`Step ${step.step} is typed between its arrows in:`);
    for (const file of files) {
      const here = ids(file.regions.filter((region) => stepOf(region.id) === step.step));
      if (here.length) lines.push(`- ${file.path}${here.some((id) => id !== String(step.step)) ? ` (step ${here.join(', ')})` : ''}`);
    }
  }
  return `Step ${step.step} · ${step.title}\n\n${lines.join('\n')}\n\nGenerated from ${MAIN} by tools/live/steps.mjs.\n`;
}

// ── verify ─────────────────────────────────────────────────────────────────────

async function verify(flags) {
  const diffOnly = flags.includes('--diff-only');
  const main = git(['rev-parse', '--verify', `${MAIN}^{commit}`]);
  const root = git(['rev-list', '--max-parents=0', main]).split('\n')[0];
  const files = markedFiles(main);

  const states = STEPS.map((step, i) => {
    const branch = i === 0 ? `${STEPS[1].branch}-start` : `${step.branch}-solution`;
    return { step, branch, commit: resolveBranch(branch), build: diffOnly ? 'skip' : 'FAIL', smoke: diffOnly || i === 0 ? 'skip' : 'FAIL' };
  });

  const pairs = STEPS.slice(1).map((step, index) => {
    const i = index + 1;
    const start = resolveBranch(`${step.branch}-start`);
    const solution = resolveBranch(`${step.branch}-solution`);
    const problems = [];
    if (!start) problems.push(`${step.branch}-start does not exist`);
    if (!solution) problems.push(`${step.branch}-solution does not exist`);
    if (start && solution) {
      const expectedParent = i === 1 ? root : states[i - 1].commit;
      if (i === 1 && git(['rev-list', '--parents', '-n', '1', start]).split(' ')[1] !== expectedParent) {
        problems.push(`${step.branch}-start does not sit on the first commit ${root.slice(0, 7)}`);
      }
      if (i > 1 && start !== expectedParent) problems.push(`${step.branch}-start is not ${states[i - 1].branch}`);
      if (git(['rev-list', '--parents', '-n', '1', solution]).split(' ')[1] !== start) problems.push(`${step.branch}-solution is not one commit on top of ${step.branch}-start`);
      problems.push(...diffProblems(step, start, solution, files));
    }
    return { step, problems };
  });

  if (!diffOnly) {
    mkdirSync(LOGS, { recursive: true });
    const worktree = mkdtempSync(join(tmpdir(), 'ag-ui-steps-verify-'));
    try {
      git(['worktree', 'add', '--quiet', '--detach', worktree, root]);
      for (const state of states) {
        if (!state.commit) continue;
        const log = join(LOGS, `${state.branch}.log`);
        writeFileSync(log, `${state.branch} ${state.commit}\n`);
        console.log(`… ${state.branch}: install, typecheck, build${state.smoke === 'skip' ? '' : ', smoke'}`);
        git(['checkout', '--quiet', '--force', '--detach', state.commit], worktree);
        const built =
          run(worktree, 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], log) &&
          run(worktree, 'pnpm', ['exec', 'nx', 'run-many', '-t', 'typecheck', 'build', '--output-style=static'], log, { NX_DAEMON: 'false', NX_TUI: 'false' });
        state.build = built ? 'PASS' : 'FAIL';
        if (state.smoke !== 'skip') state.smoke = (await smoke(worktree, log)) ? 'PASS' : 'FAIL';
      }
    } finally {
      removeWorktree(worktree);
    }
  }

  const rows = pairs.map(({ step, problems }, index) => [
    `${step.branch}-start → ${step.branch}-solution`,
    problems.length ? 'FAIL' : 'PASS',
    states[index].build,
    states[index + 1].build,
    states[index].smoke,
    states[index + 1].smoke,
  ]);
  const header = ['Step pair', 'diff', 'build start', 'build solution', 'smoke start', 'smoke solution'];
  const widths = header.map((title, column) => Math.max(title.length, ...rows.map((row) => row[column].length)));
  const line = (cells) => cells.map((cell, column) => cell.padEnd(widths[column])).join('  ').trimEnd();
  console.log(`\n${line(header)}\n${line(widths.map((width) => '─'.repeat(width)))}`);
  for (const row of rows) console.log(line(row));
  console.log(`\nbuild = pnpm install --frozen-lockfile + nx run-many -t typecheck build · smoke = /hello and /hello --proto on :${SMOKE_PORT}`);

  for (const { step, problems } of pairs) for (const problem of problems) console.log(`✗ ${step.branch}: ${problem}`);
  const failedLogs = states.filter((state) => state.commit && (state.build === 'FAIL' || state.smoke === 'FAIL'));
  for (const state of failedLogs) console.log(`✗ ${state.branch}: see ${relative(ROOT, join(LOGS, `${state.branch}.log`))}`);
  for (const state of states) if (!state.commit) console.log(`✗ ${state.branch} does not exist`);

  const failed = rows.some((row) => row.includes('FAIL'));
  console.log(failed ? '\n✗ FAIL' : '\n✓ PASS');
  return failed ? 1 : 0;
}

/** (a) Only lines between this step's arrows change, and they turn the placeholder into the step's @live code on main. */
function diffProblems(step, start, solution, files) {
  const problems = [];
  const expected = new Map();
  for (const file of files) {
    const here = file.regions.filter((region) => stepOf(region.id) === step.step);
    if (here.length) expected.set(file.path, { added: here.flatMap((region) => region.body), removed: here.flatMap((region) => region.stubs) });
  }

  const diff = git(['diff', '--no-color', '--no-ext-diff', '--no-renames', '--unified=0', '--src-prefix=a/', '--dst-prefix=b/', start, solution], ROOT, { raw: true });
  const changed = parseDiff(diff);
  for (const [path, hunks] of changed) {
    const want = expected.get(path);
    if (!want) {
      problems.push(`${path} changes, but step ${step.step} has no code in it`);
      continue;
    }
    const before = arrowSpans(git(['cat-file', 'blob', `${start}:${path}`], ROOT, { raw: true }), step.step);
    const after = arrowSpans(git(['cat-file', 'blob', `${solution}:${path}`], ROOT, { raw: true }), step.step);
    for (const hunk of hunks) {
      if (!within(hunk.oldStart, hunk.oldCount, before) || !within(hunk.newStart, hunk.newCount, after)) {
        problems.push(`${path}:${hunk.newStart} changes lines outside the arrows of step ${step.step}`);
      }
    }
    if (hunks.flatMap((hunk) => hunk.added).join('\n') !== want.added.join('\n')) problems.push(`${path}: the added lines are not the step ${step.step} code on ${MAIN}`);
    if (hunks.flatMap((hunk) => hunk.removed).join('\n') !== want.removed.join('\n')) problems.push(`${path}: the removed lines are not the step ${step.step} placeholder on ${MAIN}`);
  }
  for (const path of expected.keys()) if (!changed.has(path)) problems.push(`${path}: step ${step.step} is not typed in`);
  return problems;
}

function parseDiff(text) {
  const files = new Map();
  let hunks;
  let hunk;
  for (const line of text.split('\n')) {
    const file = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (file) {
      hunks = [];
      hunk = undefined;
      files.set(file[2], hunks);
      continue;
    }
    const header = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (header) {
      hunk = { oldStart: +header[1], oldCount: header[2] === undefined ? 1 : +header[2], newStart: +header[3], newCount: header[4] === undefined ? 1 : +header[4], added: [], removed: [] };
      hunks.push(hunk);
      continue;
    }
    if (!hunk) continue;
    if (line.startsWith('+')) hunk.added.push(line.slice(1));
    else if (line.startsWith('-')) hunk.removed.push(line.slice(1));
  }
  return files;
}

/** The 1-based line numbers of every ▶/◀ pair of a step (5s belongs to step 5). */
function arrowSpans(text, number) {
  const lines = text.split('\n');
  const spans = [];
  lines.forEach((line, index) => {
    const open = ANCHOR.exec(line);
    if (open?.[1] !== '▶' || stepOf(open[2]) !== number) return;
    const close = lines.findIndex((other, j) => j > index && ANCHOR.exec(other)?.[1] === '◀' && ANCHOR.exec(other)?.[2] === open[2]);
    if (close > index) spans.push({ open: index + 1, close: close + 1 });
  });
  return spans;
}

/** A hunk with lines must lie strictly between the arrows; an empty side (count 0) sits after line `start`. */
function within(start, count, spans) {
  return spans.some(({ open, close }) => (count > 0 ? open < start && start + count - 1 < close : open <= start && start < close));
}

/** (c) Start the agent from the worktree on SMOKE_PORT, run the smoke test over SSE and protobuf, stop the agent. */
async function smoke(worktree, log) {
  if (await listening(SMOKE_PORT)) {
    appendFileSync(log, `\n✗ port ${SMOKE_PORT} is already in use\n`);
    return false;
  }
  const cwd = join(worktree, 'apps', 'agent');
  appendFileSync(log, `\n$ PORT=${SMOKE_PORT} node src/server.ts\n`);
  const out = openSync(log, 'a');
  const agent = spawn(process.execPath, ['src/server.ts'], { cwd, env: { ...process.env, PORT: String(SMOKE_PORT) }, stdio: ['ignore', out, out] });
  const exited = new Promise((resolve) => agent.once('exit', resolve));
  let gone = false;
  exited.then(() => (gone = true));
  try {
    const deadline = Date.now() + 20_000;
    while (!(await listening(SMOKE_PORT))) {
      if (gone || Date.now() > deadline) return false;
      await sleep(200);
    }
    for (const extra of [[], ['--proto']]) {
      const ok = run(cwd, process.execPath, ['scripts/smoke.ts', '/hello', ...extra], log, { AGENT_URL: `http://localhost:${SMOKE_PORT}` });
      if (!ok) return false;
    }
    return true;
  } finally {
    if (!gone) agent.kill();
    await exited;
    closeSync(out);
  }
}

function listening(port) {
  return new Promise((resolve) => {
    const socket = createConnection({ port, host: 'localhost' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

// ── helpers ────────────────────────────────────────────────────────────────────

/** The files on `rev` with @live regions, read from the commit (not the working tree). */
function markedFiles(rev) {
  const known = new Set(STEPS.filter((step) => step.step > 0).map((step) => step.step));
  const paths = git(['ls-tree', '-r', '-z', '--name-only', rev, '--', ...SOURCES], ROOT, { raw: true })
    .split('\0')
    .filter((path) => /\.(ts|html|css)$/.test(path))
    .sort();
  const files = [];
  for (const path of paths) {
    const text = git(['cat-file', 'blob', `${rev}:${path}`], ROOT, { raw: true });
    if (!hasRegions(text)) continue;
    const found = regions(text, path);
    for (const region of found) {
      if (!known.has(stepOf(region.id))) throw new Error(`${path}: step ${region.id} has no step branch. Known steps: ${[...known].join(', ')}.`);
    }
    files.push({ path, text, regions: found });
  }
  if (!files.length) throw new Error(`No @live steps found in ${SOURCES.join(' or ')} on ${rev}.`);
  return files;
}

function stepOf(id) {
  return parseInt(id, 10);
}

function ids(found) {
  return [...new Set(found.map((region) => region.id))].sort(byStep);
}

function stepBranches() {
  return STEPS.slice(1).flatMap((step) => [`${step.branch}-start`, `${step.branch}-solution`]);
}

function resolveBranch(branch) {
  const result = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}^{commit}`], { cwd: ROOT, encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** Branch name → path of the checkout that has it, for every worktree of this repository. */
function checkedOutBranches() {
  const found = new Map();
  let path;
  for (const line of git(['worktree', 'list', '--porcelain']).split('\n')) {
    if (line.startsWith('worktree ')) path = line.slice('worktree '.length);
    else if (line.startsWith('branch refs/heads/')) found.set(line.slice('branch refs/heads/'.length), path);
  }
  return found;
}

function removeWorktree(path) {
  spawnSync('git', ['worktree', 'remove', '--force', path], { cwd: ROOT, stdio: 'ignore' });
  rmSync(path, { recursive: true, force: true });
  spawnSync('git', ['worktree', 'prune'], { cwd: ROOT, stdio: 'ignore' });
}

function git(gitArgs, cwd = ROOT, { input, env, raw = false } = {}) {
  const result = spawnSync('git', gitArgs, { cwd, input, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`git ${gitArgs.join(' ')} failed:\n${result.stderr || result.stdout}`);
  return raw ? result.stdout : result.stdout.trimEnd();
}

/** Runs a command with its output appended to the log; true when it exits with 0. */
function run(cwd, file, commandArgs, log, env = {}) {
  appendFileSync(log, `\n$ ${file === process.execPath ? 'node' : file} ${commandArgs.join(' ')}\n`);
  const out = openSync(log, 'a');
  try {
    return spawnSync(file, commandArgs, { cwd, env: { ...process.env, ...env }, stdio: ['ignore', out, out] }).status === 0;
  } finally {
    closeSync(out);
  }
}
