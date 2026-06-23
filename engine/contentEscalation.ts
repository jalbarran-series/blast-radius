import { minimatch } from 'minimatch';
import type { BlastConfig, Escalation } from './classify';

export interface ChangedLine { file: string; text: string; newLineNo: number | null; }

export interface EscalationInput {
  diff: string;
  /** path → post-image (PR head) content, used for region sentinels. */
  headFiles: Record<string, string>;
  cfg: BlastConfig;
}

/**
 * Parse a unified diff into changed (added/removed) lines, tracking new-line
 * numbers for adds. Uses an `inHunk` flag so that file-header lines (`--- `,
 * `+++ `) are only treated as headers in the pre-hunk preamble — a removed
 * content line like `-- foo` (which appears as `--- foo`) inside a hunk is
 * correctly treated as content, not a header.
 */
export function parseChangedLines(diff: string): ChangedLine[] {
  const out: ChangedLine[] = [];
  let file = '';
  let oldPath = '';
  let newNo = 0;
  let inHunk = false;
  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git') || line.startsWith('index ')) { file = ''; oldPath = ''; inHunk = false; continue; }
    if (!inHunk && line.startsWith('--- ')) {
      const p = line.slice(4);
      oldPath = p.startsWith('a/') ? p.slice(2) : p;
      continue;
    }
    if (!inHunk && line.startsWith('+++ ')) {
      const p = line.slice(4);
      const newPath = p.startsWith('b/') ? p.slice(2) : p;
      // For a wholly deleted file the new side is /dev/null — fall back to the
      // real path from the `--- a/...` header so path-scoped rules still match.
      file = newPath === '/dev/null' ? oldPath : newPath;
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) { newNo = parseInt(hunk[1], 10); inHunk = true; continue; }
    if (!inHunk) continue;
    if (line.startsWith('\\')) continue; // "\ No newline at end of file"
    if (line.startsWith('+')) { out.push({ file, text: line.slice(1), newLineNo: newNo }); newNo++; continue; }
    // Removed lines get the new-side position where the deletion sits (newNo is
    // NOT advanced). This lets region-sentinel overlap catch deletions/replaces
    // inside a guarded block, not just additions.
    if (line.startsWith('-')) { out.push({ file, text: line.slice(1), newLineNo: newNo }); continue; }
    newNo++; // context line advances the new-file counter
  }
  return out;
}

/** Line ranges [start,end] (1-based, inclusive) guarded by region sentinels in a head file. */
function regionRanges(content: string, startTok: string, endTok: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const lines = content.split('\n');
  let open: number | null = null;
  lines.forEach((l, i) => {
    if (l.includes(startTok)) open = i + 1;
    else if (l.includes(endTok) && open !== null) { ranges.push([open, i + 1]); open = null; }
  });
  return ranges;
}

export function contentEscalations({ diff, headFiles, cfg }: EscalationInput): Escalation {
  const changed = parseChangedLines(diff);
  const reasons: string[] = [];
  let tier = 0;
  const bump = (t: number, reason: string) => { if (t > tier) tier = t; reasons.push(reason); };

  // (a) central content rules
  for (const rule of cfg.escalations ?? []) {
    const re = new RegExp(rule.pattern);
    const hit = changed.some((c) =>
      (!rule.paths || rule.paths.some((g) => minimatch(c.file, g, { dot: true }))) && re.test(c.text),
    );
    if (hit) bump(rule.tier ?? 3, `escalated to tier ${rule.tier ?? 3}: ${rule.reason} (rule: ${rule.name})`);
  }

  // (b) inline sentinels — any changed line (added OR removed) that carries the
  // token escalates. Region markers contain the token substring, so this also
  // fires when a guarded region's start/end marker is touched — including a
  // wholly DELETED file (its marker lines are in the removed set, and a deleted
  // file has no post-image for the region-range check below).
  const s = cfg.sentinel;
  if (s) {
    const stier = s.tier ?? 3;
    if (changed.some((c) => c.text.includes(s.token))) {
      bump(stier, `escalated to tier ${stier}: sentinel \`${s.token}\` touched on a changed line`);
    }
    // region sentinels — an added line whose new-line number falls in a guarded range
    for (const [file, content] of Object.entries(headFiles)) {
      const ranges = regionRanges(content, s.region_start, s.region_end);
      const inRegion = changed.some(
        (c) => c.file === file && c.newLineNo !== null && ranges.some(([a, b]) => c.newLineNo! >= a && c.newLineNo! <= b),
      );
      if (inRegion) bump(stier, `escalated to tier ${stier}: changed line inside a \`${s.region_start}\` region in ${file}`);
    }
  }

  return { tier, reasons };
}
