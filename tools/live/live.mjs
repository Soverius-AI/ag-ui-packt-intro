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
 *   // @live 3 begin: POST a RunAgentInput, read the SSE stream
 *   …the code you type on stage…
 *   // @live 3 stub: return;          optional placeholder while the step is open
 *   // @live 3 end
 *
 * A reset turns every step into  // ▶ step 3: …  placeholder  // ◀ step 3  so you type between the arrows.
 * The complete solution is saved in tools/live/.solution/ on every reset, from the files that are still complete.
 * The step branches are generated from the same markers: see steps.mjs.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANCHOR, MARKER, byStep, hasRegions, isOpen, regions, strip } from './markers.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOLUTION = join(ROOT, 'tools', 'live', '.solution');
const SOURCES = ['apps/agent/src', 'apps/web/src'];

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
  for (const file of sourceFiles()) {
    const text = read(file);
    if (!hasRegions(text) || isOpen(text)) continue;
    const snapshot = solutionOf(file);
    if (existsSync(snapshot) && regions(text, rel(file)).length < regions(read(snapshot), rel(snapshot)).length) {
      console.warn(`! ${rel(file)} has fewer steps than its saved solution; keeping the saved one`);
      continue;
    }
    write(snapshot, text);
  }
  const snapshots = walk(SOLUTION);
  if (!snapshots.length) throw new Error(`No @live steps found in ${SOURCES.join(' or ')}.`);
  for (const snapshot of snapshots) write(workingOf(snapshot), strip(read(snapshot), rel(snapshot)));
  console.log(`Reset to the starting point. The solution is saved in ${rel(SOLUTION)}/.\n`);
  status();
}

function solve(steps) {
  const snapshots = walk(SOLUTION);
  if (!snapshots.length) throw new Error('Nothing to solve: the code is complete. Run reset first.');
  const wanted = !steps.length || steps.includes('all') ? null : new Set(steps);
  const found = new Set();

  for (const snapshot of snapshots) {
    const solution = read(snapshot).split('\n');
    const chosen = regions(solution.join('\n'), rel(snapshot)).filter((region) => !wanted || wanted.has(region.id));
    if (!chosen.length) continue;

    const working = workingOf(snapshot);
    const lines = read(working).split('\n');
    const out = [];
    const nth = new Map();
    const placed = new Map();

    for (let i = 0; i < lines.length; i++) {
      const marker = MARKER.exec(lines[i]);
      if (marker?.[3] === 'begin') count(nth, marker[2]);

      const open = ANCHOR.exec(lines[i]);
      if (open?.[1] === '▶') {
        const id = open[2];
        const index = count(nth, id) - 1;
        const region = (!wanted || wanted.has(id)) && chosen.filter((candidate) => candidate.id === id)[index];
        const close = lines.findIndex((line, j) => j > i && ANCHOR.exec(line)?.[1] === '◀' && ANCHOR.exec(line)?.[2] === id);
        if (region && close > i) {
          out.push(...solution.slice(region.start, region.end + 1));
          count(placed, id);
          i = close;
          continue;
        }
      }
      out.push(lines[i]);
    }
    write(working, out.join('\n'));

    for (const id of new Set(chosen.map((region) => region.id))) {
      found.add(id);
      const expected = chosen.filter((region) => region.id === id).length;
      const already = lines.filter((line) => MARKER.exec(line)?.[3] === 'begin' && MARKER.exec(line)?.[2] === id).length;
      const done = (placed.get(id) ?? 0) + already;
      if (placed.get(id)) console.log(`✓ step ${id}  ${rel(working)}`);
      else if (already === expected) console.log(`· step ${id}  ${rel(working)} (already solved)`);
      if (done < expected) console.warn(`! step ${id}  ${rel(working)}: no ▶ arrow left. If you typed it by hand, compare with: pnpm live show ${id}`);
    }
  }
  for (const id of wanted ?? []) if (!found.has(id)) console.warn(`! there is no step ${id}`);
}

function done() {
  const snapshots = walk(SOLUTION);
  if (!snapshots.length) throw new Error('No saved solution: the code is already complete.');
  for (const snapshot of snapshots) write(workingOf(snapshot), read(snapshot));
  console.log(`Restored the complete solution (${snapshots.length} files).`);
}

function status() {
  const steps = new Map();
  for (const source of solutionSources()) {
    const working = source.startsWith(SOLUTION) ? workingOf(source) : source;
    const open = new Set(
      read(working)
        .split('\n')
        .map((line) => ANCHOR.exec(line))
        .filter((match) => match?.[1] === '▶')
        .map((match) => match[2]),
    );
    for (const region of regions(read(source), rel(source))) {
      const step = steps.get(region.id) ?? { title: '', files: new Set(), open: false };
      step.title ||= region.title;
      step.files.add(rel(working));
      step.open ||= open.has(region.id);
      steps.set(region.id, step);
    }
  }
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
      regions(read(source), rel(source))
        .filter((region) => steps.includes(region.id))
        .map((region) => ({
          id: region.id,
          path: rel(source.startsWith(SOLUTION) ? workingOf(source) : source),
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

/** Complete working files win (they may be newer than the saved solution); the saved copy is used for files that are reset. */
function solutionSources() {
  const complete = sourceFiles().filter((file) => {
    const text = read(file);
    return hasRegions(text) && !isOpen(text);
  });
  const saved = walk(SOLUTION).filter((snapshot) => !complete.includes(workingOf(snapshot)));
  return [...complete, ...saved].sort((a, b) => rel(workingPath(a)).localeCompare(rel(workingPath(b))));
}

function workingPath(source) {
  return source.startsWith(SOLUTION) ? workingOf(source) : source;
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
