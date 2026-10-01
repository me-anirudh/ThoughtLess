/**
 * Adversarial Test Suite for the Diff Engine
 * 
 * Tests the complete pipeline: DiffEngine.compare() → unified patch → applyUnifiedPatch()
 * Verifies the round-trip invariant: Old + Diff → Exact New
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { DiffEngine } from '@/lib/diff-engine';
import type { DiffInput, DiffResult } from '@/lib/diff-engine';

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** Stripped-down version of vcs-db's parseUnifiedPatch + applyUnifiedPatch
 *  for use in a Node.js test environment (no Dexie dependency). */

interface ParsedHunk {
    oldStart: number;
    oldCount: number;
    lines: { type: 'equal' | 'insert' | 'delete'; content: string }[];
}

function parseUnifiedPatch(patch: string): ParsedHunk[] {
    const hunks: ParsedHunk[] = [];
    const patchLines = patch.split('\n');
    let i = 0;

    while (i < patchLines.length && !patchLines[i].startsWith('@@')) i++;

    while (i < patchLines.length) {
        const line = patchLines[i];
        const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
        if (!hunkMatch) { i++; continue; }

        const hunk: ParsedHunk = {
            oldStart: parseInt(hunkMatch[1], 10),
            oldCount: hunkMatch[2] ? parseInt(hunkMatch[2], 10) : 1,
            lines: [],
        };
        i++;

        while (i < patchLines.length && !patchLines[i].startsWith('@@')) {
            const bodyLine = patchLines[i];
            if (bodyLine.startsWith('+')) {
                hunk.lines.push({ type: 'insert', content: bodyLine.slice(1) });
            } else if (bodyLine.startsWith('-')) {
                hunk.lines.push({ type: 'delete', content: bodyLine.slice(1) });
            } else if (bodyLine.startsWith(' ')) {
                hunk.lines.push({ type: 'equal', content: bodyLine.slice(1) });
            } else if (bodyLine === '') {
                // Empty line inside hunk = empty context line, BUT skip trailing
                const isTrailingEnd = (i === patchLines.length - 1);
                if (!isTrailingEnd) {
                    hunk.lines.push({ type: 'equal', content: '' });
                }
            }
            i++;
        }
        hunks.push(hunk);
    }
    return hunks;
}

function applyUnifiedPatch(baseText: string, patch: string): string {
    const hunks = parseUnifiedPatch(patch);
    if (hunks.length === 0) return baseText;

    const oldLines = baseText === '' ? [] : baseText.split('\n');
    const resultLines: string[] = [];
    let oldIdx = 0;

    for (const hunk of hunks) {
        const hunkStart = hunk.oldStart - 1;
        while (oldIdx < hunkStart) {
            resultLines.push(oldLines[oldIdx]);
            oldIdx++;
        }
        for (const line of hunk.lines) {
            if (line.type === 'equal') {
                resultLines.push(line.content);
                oldIdx++;
            } else if (line.type === 'delete') {
                oldIdx++;
            } else if (line.type === 'insert') {
                resultLines.push(line.content);
            }
        }
    }

    while (oldIdx < oldLines.length) {
        resultLines.push(oldLines[oldIdx]);
        oldIdx++;
    }

    return resultLines.join('\n');
}

/** Helper: run a diff and check round-trip */
function assertRoundTrip(oldContent: string, newContent: string, label?: string) {
    const engine = new DiffEngine();
    const result = engine.compare({ oldContent, newContent });

    // Check that the diff result has a valid structure
    expect(result).toBeDefined();
    expect(result.metadata).toBeDefined();
    expect(result.statistics).toBeDefined();

    if (oldContent === newContent) {
        // Identical files should be flagged
        expect(result.metadata.identical).toBe(true);
        return result;
    }

    // Non-identical files should produce a unified patch
    const unifiedPatch = result.patches?.unified;
    expect(unifiedPatch, `${label || 'Diff'}: Expected unified patch to be generated`).toBeTruthy();

    // Apply the patch to the old content
    const reconstructed = applyUnifiedPatch(oldContent, unifiedPatch!);
    expect(reconstructed, `${label || 'Round-trip'}: Old + Patch should produce New`).toBe(newContent);

    return result;
}

// --------------------------------------------------------------------------
// Test Suite
// --------------------------------------------------------------------------

describe('DiffEngine', () => {
    let engine: DiffEngine;

    beforeEach(() => {
        engine = new DiffEngine();
    });

    // 1. Empty → Empty
    it('handles empty → empty', () => {
        const result = assertRoundTrip('', '');
        expect(result.metadata.identical).toBe(true);
    });

    // 2. Empty → Non-empty
    it('handles empty → non-empty', () => {
        assertRoundTrip('', 'hello world');
    });

    it('handles empty → multi-line', () => {
        assertRoundTrip('', 'line 1\nline 2\nline 3');
    });

    // 3. Non-empty → Empty
    it('handles non-empty → empty', () => {
        assertRoundTrip('hello world', '');
    });

    it('handles multi-line → empty', () => {
        assertRoundTrip('line 1\nline 2\nline 3', '');
    });

    // 4. Identical files
    it('handles identical single-line files', () => {
        const result = assertRoundTrip('hello', 'hello');
        expect(result.metadata.identical).toBe(true);
    });

    it('handles identical multi-line files', () => {
        const content = 'line 1\nline 2\nline 3\nline 4\nline 5';
        const result = assertRoundTrip(content, content);
        expect(result.metadata.identical).toBe(true);
    });

    // 5. Single insertion
    it('handles single insertion at beginning', () => {
        assertRoundTrip('line 2\nline 3', 'line 1\nline 2\nline 3');
    });

    it('handles single insertion in middle', () => {
        assertRoundTrip('line 1\nline 3', 'line 1\nline 2\nline 3');
    });

    it('handles single insertion at end', () => {
        assertRoundTrip('line 1\nline 2', 'line 1\nline 2\nline 3');
    });

    // 6. Single deletion
    it('handles single deletion at beginning', () => {
        assertRoundTrip('line 1\nline 2\nline 3', 'line 2\nline 3');
    });

    it('handles single deletion in middle', () => {
        assertRoundTrip('line 1\nline 2\nline 3', 'line 1\nline 3');
    });

    it('handles single deletion at end', () => {
        assertRoundTrip('line 1\nline 2\nline 3', 'line 1\nline 2');
    });

    // 7. Single replacement
    it('handles single line replacement', () => {
        assertRoundTrip('line 1\nold line\nline 3', 'line 1\nnew line\nline 3');
    });

    // 8. Multiple independent changes
    it('handles multiple independent changes', () => {
        const old = 'a\nb\nc\nd\ne\nf\ng\nh\ni\nj';
        const newC = 'a\nB\nc\nd\ne\nF\ng\nh\ni\nJ';
        assertRoundTrip(old, newC);
    });

    // 9. Adjacent changes
    it('handles adjacent deletions', () => {
        assertRoundTrip('a\nb\nc\nd\ne', 'a\nd\ne');
    });

    it('handles adjacent insertions', () => {
        assertRoundTrip('a\nd\ne', 'a\nb\nc\nd\ne');
    });

    it('handles adjacent mixed changes', () => {
        assertRoundTrip('a\nb\nc', 'a\nX\nY\nZ\nc');
    });

    // 10. Changes at beginning/end
    it('handles changes at beginning', () => {
        assertRoundTrip('old\nline 2\nline 3', 'new\nline 2\nline 3');
    });

    it('handles changes at end', () => {
        assertRoundTrip('line 1\nline 2\nold', 'line 1\nline 2\nnew');
    });

    it('handles changes at both ends', () => {
        assertRoundTrip('old start\nmiddle\nold end', 'new start\nmiddle\nnew end');
    });

    // 11. Repeated lines/blocks
    it('handles files with repeated lines', () => {
        assertRoundTrip('a\na\na\nb\nb\nb', 'a\na\nc\nb\nb\nb');
    });

    it('handles files with many identical lines', () => {
        const old = Array(20).fill('same').join('\n');
        const newC = Array(20).fill('same').with(10, 'different').join('\n');
        assertRoundTrip(old, newC);
    });

    // 12. Large unchanged regions with small modifications
    it('handles large file with small change in middle', () => {
        const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
        const oldContent = lines.join('\n');
        lines[50] = 'MODIFIED LINE 50';
        const newContent = lines.join('\n');
        assertRoundTrip(oldContent, newContent);
    });

    // 13. Large-scale replacement
    it('handles complete file replacement', () => {
        const old = Array.from({ length: 20 }, (_, i) => `old line ${i}`).join('\n');
        const newC = Array.from({ length: 20 }, (_, i) => `new line ${i}`).join('\n');
        assertRoundTrip(old, newC);
    });

    // 14. Multi-line changes
    it('handles multi-line insertion', () => {
        assertRoundTrip('before\nafter', 'before\nnew 1\nnew 2\nnew 3\nafter');
    });

    it('handles multi-line deletion', () => {
        assertRoundTrip('before\ndel 1\ndel 2\ndel 3\nafter', 'before\nafter');
    });

    it('handles multi-line replacement', () => {
        assertRoundTrip(
            'before\nold 1\nold 2\nold 3\nafter',
            'before\nnew 1\nnew 2\nafter'
        );
    });

    // 15. Newline / CRLF vs LF
    // NOTE: The normalizer intentionally converts all line endings to LF.
    // This is by design — diffs operate on normalized content.
    // The original line ending style is recorded for potential restoration.
    it('handles CRLF input (normalized to LF)', () => {
        // CRLF gets normalized to LF by the normalizer, so round-trip
        // produces LF output. This is correct behavior.
        const old = 'line 1\r\nline 2\r\nline 3';
        const newC = 'line 1\r\nmodified\r\nline 3';
        const engine = new DiffEngine();
        const result = engine.compare({ oldContent: old, newContent: newC });
        
        // Should still produce a valid diff
        expect(result.patches?.unified).toBeTruthy();
        
        // The normalized round-trip should work
        const normalizedOld = old.replace(/\r\n/g, '\n');
        const normalizedNew = newC.replace(/\r\n/g, '\n');
        const reconstructed = applyUnifiedPatch(normalizedOld, result.patches!.unified!);
        expect(reconstructed).toBe(normalizedNew);
    });

    it('handles mixed line endings (normalized to LF)', () => {
        const old = 'line 1\nline 2\r\nline 3';
        const newC = 'line 1\nmodified\r\nline 3';
        const engine = new DiffEngine();
        const result = engine.compare({ oldContent: old, newContent: newC });
        
        expect(result.patches?.unified).toBeTruthy();
        
        const normalizedOld = old.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const normalizedNew = newC.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const reconstructed = applyUnifiedPatch(normalizedOld, result.patches!.unified!);
        expect(reconstructed).toBe(normalizedNew);
    });

    // 16. Unicode content
    it('handles unicode content', () => {
        assertRoundTrip('Hello 🌍\nLine 2', 'Hello 🌍\nLine 2 修改\nLine 3 新增');
    });

    it('handles CJK content', () => {
        assertRoundTrip('第一行\n第二行\n第三行', '第一行\n修改的行\n第三行\n第四行');
    });

    it('handles emoji-heavy content', () => {
        assertRoundTrip('🎉🎊🎈\n📌📍', '🎉🎊🎈\n📌📍\n🆕🔥');
    });

    // 17. Very small files
    it('handles single character files', () => {
        assertRoundTrip('a', 'b');
    });

    it('handles single line change', () => {
        assertRoundTrip('hello', 'world');
    });

    it('handles 2-line file', () => {
        assertRoundTrip('a\nb', 'a\nc');
    });

    // 18. Larger files
    it('handles 500-line file with scattered changes', () => {
        const lines = Array.from({ length: 500 }, (_, i) => `line ${i}: content here`);
        const oldContent = lines.join('\n');
        // Change every 50th line
        for (let i = 0; i < 500; i += 50) {
            lines[i] = `MODIFIED line ${i}: new content`;
        }
        const newContent = lines.join('\n');
        assertRoundTrip(oldContent, newContent);
    });

    // 19. Sequential diffs: A → B → C → D
    it('handles sequential diff chain A → B → C → D', () => {
        const A = 'line 1\nline 2\nline 3\nline 4\nline 5';
        const B = 'line 1\nmodified 2\nline 3\nline 4\nline 5';
        const C = 'line 1\nmodified 2\nline 3\nadded\nline 4\nline 5';
        const D = 'line 1\nmodified 2\nadded\nline 4\nline 5';

        const resultAB = assertRoundTrip(A, B);
        const resultBC = assertRoundTrip(B, C);
        const resultCD = assertRoundTrip(C, D);

        // Verify chain reconstruction
        let current = A;
        current = applyUnifiedPatch(current, resultAB.patches?.unified || '');
        expect(current).toBe(B);
        
        current = applyUnifiedPatch(current, resultBC.patches?.unified || '');
        expect(current).toBe(C);

        current = applyUnifiedPatch(current, resultCD.patches?.unified || '');
        expect(current).toBe(D);
    });

    // Additional edge cases
    it('handles files with empty lines', () => {
        assertRoundTrip('line 1\n\nline 3', 'line 1\n\n\nline 3');
    });

    it('handles files with only whitespace changes', () => {
        assertRoundTrip('  hello  ', '    hello    ');
    });

    it('handles file with trailing newline', () => {
        assertRoundTrip('line 1\nline 2\n', 'line 1\nmodified\n');
    });

    it('handles file gaining trailing newline', () => {
        assertRoundTrip('line 1\nline 2', 'line 1\nline 2\n');
    });

    it('handles file losing trailing newline', () => {
        assertRoundTrip('line 1\nline 2\n', 'line 1\nline 2');
    });

    // Statistics checks
    it('produces correct statistics for insertion', () => {
        const result = engine.compare({
            oldContent: 'line 1\nline 2',
            newContent: 'line 1\nnew line\nline 2',
        });
        expect(result.statistics.addedLines).toBeGreaterThanOrEqual(1);
    });

    it('produces correct statistics for deletion', () => {
        const result = engine.compare({
            oldContent: 'line 1\nline 2\nline 3',
            newContent: 'line 1\nline 3',
        });
        expect(result.statistics.deletedLines).toBeGreaterThanOrEqual(1);
    });

    // PatchAST structure checks
    it('produces valid PatchAST with hunks', () => {
        const result = engine.compare({
            oldContent: 'line 1\nline 2\nline 3',
            newContent: 'line 1\nmodified\nline 3',
        });
        expect(result.patchAST).not.toBeNull();
        expect(result.patchAST!.hunks.length).toBeGreaterThan(0);
        
        for (const hunk of result.patchAST!.hunks) {
            expect(hunk.oldStart).toBeGreaterThanOrEqual(1);
            expect(hunk.oldCount).toBeGreaterThanOrEqual(0);
            expect(hunk.newStart).toBeGreaterThanOrEqual(1);
            expect(hunk.newCount).toBeGreaterThanOrEqual(0);
            expect(hunk.lines.length).toBeGreaterThan(0);
        }
    });

    it('produces null PatchAST for identical files', () => {
        const result = engine.compare({
            oldContent: 'hello',
            newContent: 'hello',
        });
        expect(result.patchAST).toBeNull();
        expect(result.metadata.identical).toBe(true);
    });

    // Metadata checks
    it('detects binary content', () => {
        const result = engine.compare({
            oldContent: 'hello\x00world',
            newContent: 'hello\x00different',
        });
        expect(result.metadata.binary).toBe(true);
    });

    // Edit operations structure
    it('produces well-formed edit operations', () => {
        const result = engine.compare({
            oldContent: 'a\nb\nc\nd\ne',
            newContent: 'a\nB\nc\nd\nE',
        });
        
        for (const op of result.operations) {
            expect(['equal', 'insert', 'delete', 'replace']).toContain(op.type);
            expect(op.oldStart).toBeLessThanOrEqual(op.oldEnd);
            expect(op.newStart).toBeLessThanOrEqual(op.newEnd);
            
            if (op.type === 'equal') {
                expect(op.oldLines.length).toBe(op.newLines.length);
            }
            if (op.type === 'insert') {
                expect(op.oldStart).toBe(op.oldEnd);
                expect(op.newLines.length).toBeGreaterThan(0);
            }
            if (op.type === 'delete') {
                expect(op.newStart).toBe(op.newEnd);
                expect(op.oldLines.length).toBeGreaterThan(0);
            }
        }
    });

    // Realistic code change scenarios
    it('handles function body change in TypeScript', () => {
        const old = [
            'export function greet(name: string): string {',
            '  return `Hello, ${name}!`;',
            '}',
            '',
            'export function add(a: number, b: number): number {',
            '  return a + b;',
            '}',
        ].join('\n');

        const newC = [
            'export function greet(name: string): string {',
            '  const greeting = `Hello, ${name}!`;',
            '  console.log(greeting);',
            '  return greeting;',
            '}',
            '',
            'export function add(a: number, b: number): number {',
            '  return a + b;',
            '}',
        ].join('\n');

        assertRoundTrip(old, newC);
    });

    it('handles added imports', () => {
        const old = [
            'import { useState } from "react";',
            '',
            'function App() {',
            '  return <div>Hello</div>;',
            '}',
        ].join('\n');

        const newC = [
            'import { useState, useEffect } from "react";',
            'import { api } from "@/lib/api";',
            '',
            'function App() {',
            '  return <div>Hello</div>;',
            '}',
        ].join('\n');

        assertRoundTrip(old, newC);
    });

    it('handles JSON config changes', () => {
        const old = JSON.stringify({ name: 'test', version: '1.0.0', scripts: { build: 'tsc' } }, null, 2);
        const newC = JSON.stringify({ name: 'test', version: '1.1.0', scripts: { build: 'tsc', test: 'vitest' } }, null, 2);
        assertRoundTrip(old, newC);
    });

    // Stress test: many small changes throughout a large file
    it('handles many small changes in a 200-line file', () => {
        const lines = Array.from({ length: 200 }, (_, i) => `  const var_${i} = ${i};`);
        const oldContent = lines.join('\n');
        // Modify every 7th line
        for (let i = 0; i < 200; i += 7) {
            lines[i] = `  const var_${i} = ${i * 100}; // modified`;
        }
        const newContent = lines.join('\n');
        assertRoundTrip(oldContent, newContent);
    });
});
