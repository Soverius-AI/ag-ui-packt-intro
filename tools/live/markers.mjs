/**
 * The @live step markers, shared by live.mjs (reset and solve in the working tree) and steps.mjs (the step branches),
 * so both write the arrows byte for byte the same way.
 *
 *   // @live 3 begin: POST a RunAgentInput, read the events with @ag-ui/client
 *   …the code you type on stage…
 *   // @live 3 stub: return;          optional placeholder while the step is open
 *   // @live 3 end
 *
 * Inside Angular templates the markers are HTML comments: <!-- @live 8 begin: … -->.
 */

export const MARKER = /^(\s*)(?:\/\/|<!--)\s*@live\s+(\w+)\s+(begin|stub|end)\b:?\s?(.*?)\s*(?:-->)?\s*$/;
export const ANCHOR = /^\s*(?:\/\/|<!--)\s*(▶|◀) step (\w+)\b/;

/** Every @live region of a file: its id, title, first and last line, indentation, stub lines and code lines. */
export function regions(text, label) {
  const found = [];
  let open;
  text.split('\n').forEach((line, index) => {
    const match = MARKER.exec(line);
    if (!match) {
      open?.body.push(line);
      return;
    }
    const [, indent, id, kind, rest] = match;
    if (kind === 'begin') {
      if (open) throw new Error(`${label}:${index + 1}: step ${id} begins inside step ${open.id}`);
      open = { id, title: rest, start: index, end: -1, indent, html: line.includes('<!--'), stubs: [], body: [] };
    } else if (!open || open.id !== id) {
      throw new Error(`${label}:${index + 1}: "${kind}" of step ${id} is outside its region`);
    } else if (kind === 'stub') {
      open.stubs.push(indent + rest);
    } else {
      open.end = index;
      found.push(open);
      open = undefined;
    }
  });
  if (open) throw new Error(`${label}: step ${open.id} is never closed`);
  return found;
}

/**
 * Turns every region into  // ▶ step N: title  …  // ◀ step N.
 * Between the arrows go the stub lines (the step is open) or the code (the step was typed), as `solved(id)` decides.
 */
export function render(text, label, solved = () => false) {
  const lines = text.split('\n');
  const out = [];
  let index = 0;
  for (const region of regions(text, label)) {
    const comment = (body) => region.indent + (region.html ? `<!-- ${body} -->` : `// ${body}`);
    out.push(...lines.slice(index, region.start));
    out.push(
      comment(`▶ step ${region.id}${region.title ? `: ${region.title}` : ''}`),
      ...(solved(region.id) ? region.body : region.stubs),
      comment(`◀ step ${region.id}`),
    );
    index = region.end + 1;
  }
  out.push(...lines.slice(index));
  return out.join('\n');
}

/** What `live reset` writes: every step open. */
export function strip(text, label) {
  return render(text, label);
}

export function hasRegions(text) {
  return /@live\s+\w+\s+begin/.test(text);
}

export function isOpen(text) {
  return /^\s*(?:\/\/|<!--)\s*[▶◀] step \w+/m.test(text);
}

export function byStep(a, b) {
  return parseInt(a, 10) - parseInt(b, 10) || a.localeCompare(b);
}
