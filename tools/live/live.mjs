/**
 * Live-coding helper for the talk. Run it from the repository root:
 *
 *   pnpm live:reset        remove every step: the starting point on stage
 *   pnpm live:solve 3      put step 3 back (the fallback when typing goes wrong)
 *   pnpm live:solve 6 7    several steps at once ("all" for every step)
 *   pnpm live:status       which steps are still open
 *   pnpm live show 3       print the code of step 3
 *   pnpm live:done         restore the complete solution
 *   pnpm live sheet <file> refresh the code blocks of a speaker script (<!-- code:N --> markers)
 *
 * Solution code marks each step (inside Angular templates use <!-- … -->):
 *
 *   // @live 3 begin: POST a RunAgentInput, read the events with @ag-ui/client
 *   …the code you type on stage…
 *   // @live 3 stub: return;          optional placeholder while the step is open
 *   // @live 3 end
 *
 * A reset turns every step into  // ▶ step 3: …  placeholder  // ◀ step 3  so you type between the arrows.
 * The complete solution is saved in tools/live/.solution/ on every reset, from the files that are still complete.
 * The step branches are generated from the same markers: see steps.mjs.
 *
 * A step branch has the arrows but no @live markers. There the steps are read from main (or origin/main), and reset,
 * solve and done keep the arrows and write the placeholder or the code between them, the way the step branches have it:
 * after  pnpm live:solve 4  on 04-copilotkit-start,  git diff --stat 04-copilotkit-solution  shows nothing.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHOR, MARKER, byStep, hasRegions, isOpen, regions, strip } from './markers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOLUTION = join(ROOT, 'tools', 'live', '.solution');
const SOURCES = ['apps/agent/src', 'apps/web/src'];
const MAIN = ['main', 'origin/main'];
let branch; // the files of a step branch, found once per command (see branchSources)

const [command = 'status', ...args] = process.argv.slice(2);

try {
  if (command === 'reset') reset();
  else if (command === 'solve') solve(args);
  else if (command === 'done') done();
  else if (command === 'status') status();
  else if (command === 'show') show(args);
  else if (command === 'sheet') sheet(args[0]);
  else throw new Error(`Unknown command "${command}". Use reset, solve <steps>, done, status, show <steps> or sheet <file>.`);
} catch (error) {
  console.error(`✗ ${error.message}`);
  process.exit(1);
}

function reset() {
  const branch = branchSources().map((source) => source.working);
  for (const file of sourceFiles()) {
    const text = read(file);
    if (branch.includes(file) || !hasRegions(text) || isOpen(text)) continue;
    const snapshot = solutionOf(file);
    if (existsSync(snapshot) && regions(text, rel(file)).length < regions(read(snapshot), rel(snapshot)).length) {
      console.warn(`! ${rel(file)} has fewer steps than its saved solution; keeping the saved one`);
      continue;
    }
    write(snapshot, text);
  }
  const sources = openSources();
  if (!sources.length) throw new Error(`No @live steps found in ${SOURCES.join(' or ')}.`);
  for (const source of sources) {
    write(source.working, source.ref ? between(read(source.working), source, (region) => region.stubs) : strip(source.text, source.label));
  }
  const ref = sources.find((source) => source.ref)?.ref;
  console.log(`Reset to the starting point. ${ref ? `The code of the steps is read from ${ref}.` : `The solution is saved in ${rel(SOLUTION)}/.`}\n`);
  status();
}

function solve(steps) {
  const sources = openSources();
  if (!sources.length) throw new Error('Nothing to solve: the code is complete. Run reset first.');
  const wanted = !steps.length || steps.includes('all') ? null : new Set(steps);
  const found = new Set();

  for (const source of sources) {
    const chosen = source.regions.filter((region) => !wanted || wanted.has(region.id));
    if (!chosen.length) continue;

    const solution = source.text.split('\n');
    const lines = read(source.working).split('\n');
    const out = [];
    const placed = new Map();
    const already = new Map();
    for (const line of lines) {
      const marker = MARKER.exec(line);
      if (marker?.[3] === 'begin') count(already, marker[2]);
    }

    let from = 0;
    for (const pair of arrows(lines, source.regions)) {
      if (!pair.region || (wanted && !wanted.has(pair.id))) continue;
      if (source.ref && pair.typed) {
        count(already, pair.id);
        continue;
      }
      // A step branch keeps its arrows around the code; with a saved solution the step gets its @live markers back.
      const code = source.ref ? [lines[pair.open], ...pair.region.body, lines[pair.close]] : solution.slice(pair.region.start, pair.region.end + 1);
      out.push(...lines.slice(from, pair.open), ...code);
      count(placed, pair.id);
      from = pair.close + 1;
    }
    out.push(...lines.slice(from));
    if (placed.size) write(source.working, out.join('\n'));

    for (const id of new Set(chosen.map((region) => region.id))) {
      found.add(id);
      const expected = chosen.filter((region) => region.id === id).length;
      const done = (placed.get(id) ?? 0) + (already.get(id) ?? 0);
      if (placed.get(id)) console.log(`✓ step ${id}  ${rel(source.working)}`);
      else if (already.get(id) === expected) console.log(`· step ${id}  ${rel(source.working)} (already solved)`);
      if (done < expected) console.warn(`! step ${id}  ${rel(source.working)}: no ▶ arrow left. If you typed it by hand, compare with: pnpm live show ${id}`);
    }
  }
  for (const id of wanted ?? []) if (!found.has(id)) console.warn(`! there is no step ${id}`);
}

function done() {
  const sources = openSources();
  if (!sources.length) throw new Error('No saved solution: the code is already complete.');
  for (const source of sources) {
    write(source.working, source.ref ? between(read(source.working), source, (region) => region.body) : source.text);
  }
  console.log(`Restored the complete solution (${sources.length} files).`);
}

function status() {
  const steps = new Map();
  for (const source of solutionSources()) {
    const pairs = arrows(read(source.working).split('\n'), source.regions);
    const open = new Set(pairs.filter((pair) => !pair.typed).map((pair) => pair.id));
    for (const region of source.regions) {
      const step = steps.get(region.id) ?? { title: '', files: new Set(), open: false };
      step.title ||= region.title;
      step.files.add(rel(source.working));
      step.open ||= open.has(region.id);
      steps.set(region.id, step);
    }
  }
  if (!steps.size) throw new Error(`No @live steps found in ${SOURCES.join(' or ')}.`);
  for (const [id, step] of [...steps].sort(([a], [b]) => byStep(a, b))) {
    console.log(`${step.open ? '○ open  ' : '● solved'}  step ${id.padEnd(3)} ${step.title}`);
    console.log(`            ${[...step.files].join(', ')}`);
  }
}

function show(steps) {
  if (!steps.length) throw new Error('Which step? For example: pnpm live show 3');
  for (const block of codeOf(steps)) console.log(`\n── step ${block.id} · ${block.path}\n${block.code}`);
}

function sheet(file) {
  if (!file) throw new Error('Which speaker script? For example: pnpm live sheet path/to/script.md');
  const SHEET = resolve(file);
  if (!existsSync(SHEET)) throw new Error(`${SHEET} does not exist, so there is no sheet to refresh.`);
  const text = read(SHEET);
  const updated = text.replace(/<!-- code:(\w+) -->[\s\S]*?<!-- \/code:\1 -->/g, (_, id) => {
    const blocks = codeOf([id]).map((block) => `\`${block.path}\`\n\n\`\`\`${block.language}\n${block.code}\n\`\`\``);
    return `<!-- code:${id} -->\n${blocks.join('\n\n')}\n<!-- /code:${id} -->`;
  });
  write(SHEET, updated);
  console.log(`Updated the code blocks in ${rel(SHEET)}.`);
}

// ── helpers ────────────────────────────────────────────────────────────────────

function codeOf(steps) {
  return solutionSources()
    .flatMap((source) =>
      source.regions
        .filter((region) => steps.includes(region.id))
        .map((region) => ({
          id: region.id,
          path: rel(source.working),
          language: region.html ? 'html' : 'ts',
          code: dedent(region.body),
        })),
    )
    .sort((a, b) => byStep(a.id, b.id));
}

function dedent(lines) {
  const trimmed = [...lines];
  while (trimmed.length && !trimmed[0].trim()) trimmed.shift();
  while (trimmed.length && !trimmed.at(-1).trim()) trimmed.pop();
  const indent = Math.min(...trimmed.filter((line) => line.trim()).map((line) => line.match(/^\s*/)[0].length));
  return trimmed.map((line) => line.slice(indent)).join('\n');
}

/**
 * The complete code of every file with steps. Complete working files win (they may be newer than the saved solution);
 * the saved copy is used for files that are reset, and main for the files of a step branch.
 */
function solutionSources() {
  const branch = branchSources();
  const complete = sourceFiles()
    .filter((file) => !branch.some((source) => source.working === file))
    .map((file) => source(file, read(file)))
    .filter((source) => hasRegions(source.text) && !isOpen(source.text));
  const saved = savedSources().filter((snapshot) => !complete.some((source) => source.working === snapshot.working));
  return [...complete, ...saved, ...branch].sort((a, b) => rel(a.working).localeCompare(rel(b.working)));
}

/** What reset, solve and done work on: the saved solution, or the files of a step branch. */
function openSources() {
  return [...savedSources(), ...branchSources()];
}

/** The saved solution, except for the files of a step branch (a leftover from a reset on main would put @live markers there). */
function savedSources() {
  const branch = branchSources();
  return walk(SOLUTION)
    .filter((snapshot) => !branch.some((source) => source.working === workingOf(snapshot)))
    .map((snapshot) => source(workingOf(snapshot), read(snapshot), rel(snapshot)));
}

/** The files HEAD has with arrows instead of @live markers (a step branch), each with its @live markers read from main. */
function branchSources() {
  if (branch) return branch;
  branch = [];
  const hits = git(['grep', '-l', '-F', '▶ step ', 'HEAD', '--', ...SOURCES]) ?? '';
  for (const path of hits.split('\n').filter(Boolean).map((hit) => hit.slice('HEAD:'.length))) {
    if (!/\.(ts|html|css)$/.test(path) || !isOpen(git(['show', `HEAD:${path}`]) ?? '')) continue;
    const { ref, text } = fromMain(path);
    branch.push(source(join(ROOT, path), text, `${ref}:${path}`, ref));
  }
  return branch;
}

/** The file on the first of MAIN that has its @live markers. */
function fromMain(path) {
  for (const ref of MAIN) {
    const text = git(['show', `${ref}:${path}`]);
    if (text && hasRegions(text)) return { ref, text };
  }
  throw new Error(`${path} has arrows, but neither ${MAIN.join(' nor ')} has its @live markers. Run: git fetch origin main`);
}

/** A file with steps: where it is written, its complete code, and `ref` when that code comes from main (a step branch). */
function source(working, text, label = rel(working), ref = undefined) {
  let found;
  return {
    working,
    text,
    label,
    ref,
    get regions() {
      return (found ??= regions(text, label));
    },
  };
}

/**
 * Every ▶ … ◀ pair of a working file with the region it stands for: the nth beginning of a step (arrow or @live marker)
 * is the nth region of that step. A pair is typed when the lines between its arrows are the code of its region.
 */
function arrows(lines, found) {
  const nth = new Map();
  const pairs = [];
  lines.forEach((line, index) => {
    const marker = MARKER.exec(line);
    if (marker?.[3] === 'begin') count(nth, marker[2]);
    const open = ANCHOR.exec(line);
    if (open?.[1] !== '▶') return;
    const id = open[2];
    const region = found.filter((candidate) => candidate.id === id)[count(nth, id) - 1];
    const close = lines.findIndex((other, j) => j > index && ANCHOR.exec(other)?.[1] === '◀' && ANCHOR.exec(other)?.[2] === id);
    if (close < 0) return;
    const inner = lines.slice(index + 1, close);
    const typed = !!region && inner.length === region.body.length && inner.every((other, j) => other.trimEnd() === region.body[j].trimEnd());
    pairs.push({ id, region, open: index, close, typed });
  });
  return pairs;
}

/** The text with new lines between the arrows of every step, keeping the arrows. */
function between(text, source, fill) {
  const lines = text.split('\n');
  const out = [];
  let from = 0;
  for (const pair of arrows(lines, source.regions)) {
    if (!pair.region) continue;
    out.push(...lines.slice(from, pair.open + 1), ...fill(pair.region));
    from = pair.close;
  }
  out.push(...lines.slice(from));
  return out.join('\n');
}

/** The output of a git command, or null when it fails (no repository, unknown ref, missing file, no match). */
function git(gitArgs) {
  const result = spawnSync('git', gitArgs, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return result.status === 0 ? result.stdout : null;
}

function sourceFiles() {
  return SOURCES.flatMap((dir) => walk(join(ROOT, dir)));
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return ['node_modules', 'dist', '.angular'].includes(entry.name) ? [] : walk(path);
      return /\.(ts|html|css)$/.test(entry.name) ? [path] : [];
    });
}

function count(map, key) {
  const next = (map.get(key) ?? 0) + 1;
  map.set(key, next);
  return next;
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function write(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function rel(path) {
  return relative(ROOT, path);
}

function solutionOf(file) {
  return join(SOLUTION, relative(ROOT, file));
}

function workingOf(snapshot) {
  return join(ROOT, relative(SOLUTION, snapshot));
}
