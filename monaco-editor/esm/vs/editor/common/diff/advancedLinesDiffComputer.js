/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CompareResult, compareBy, equals, findLastIndex, numberComparator, reverseOrder } from '../../../base/common/arrays.js';
import { assertFn, checkAdjacentItems } from '../../../base/common/assert.js';
import { SetMap } from '../../../base/common/collections.js';
import { BugIndicatingError } from '../../../base/common/errors.js';
import { LineRange } from '../core/lineRange.js';
import { OffsetRange } from '../core/offsetRange.js';
import { Position } from '../core/position.js';
import { Range } from '../core/range.js';
import { DateTimeout, InfiniteTimeout, SequenceDiff } from './algorithms/diffAlgorithm.js';
import { DynamicProgrammingDiffing } from './algorithms/dynamicProgrammingDiffing.js';
import { optimizeSequenceDiffs, removeRandomLineMatches, removeRandomMatches, smoothenSequenceDiffs } from './algorithms/joinSequenceDiffs.js';
import { MyersDiffAlgorithm } from './algorithms/myersDiffAlgorithm.js';
import { LineRangeMapping, LinesDiff, MovedText, RangeMapping, SimpleLineRangeMapping } from './linesDiffComputer.js';
export class AdvancedLinesDiffComputer {
    constructor() {
        this.dynamicProgrammingDiffing = new DynamicProgrammingDiffing();
        this.myersDiffingAlgorithm = new MyersDiffAlgorithm();
    }
    computeDiff(originalLines, modifiedLines, options) {
        if (originalLines.length <= 1 && equals(originalLines, modifiedLines, (a, b) => a === b)) {
            return new LinesDiff([], [], false);
        }
        if (originalLines.length === 1 && originalLines[0].length === 0 || modifiedLines.length === 1 && modifiedLines[0].length === 0) {
            return new LinesDiff([
                new LineRangeMapping(new LineRange(1, originalLines.length + 1), new LineRange(1, modifiedLines.length + 1), [
                    new RangeMapping(new Range(1, 1, originalLines.length, originalLines[0].length + 1), new Range(1, 1, modifiedLines.length, modifiedLines[0].length + 1))
                ])
            ], [], false);
        }
        const timeout = options.maxComputationTimeMs === 0 ? InfiniteTimeout.instance : new DateTimeout(options.maxComputationTimeMs);
        const considerWhitespaceChanges = !options.ignoreTrimWhitespace;
        const perfectHashes = new Map();
        function getOrCreateHash(text) {
            let hash = perfectHashes.get(text);
            if (hash === undefined) {
                hash = perfectHashes.size;
                perfectHashes.set(text, hash);
            }
            return hash;
        }
        const srcDocLines = originalLines.map((l) => getOrCreateHash(l.trim()));
        const tgtDocLines = modifiedLines.map((l) => getOrCreateHash(l.trim()));
        const sequence1 = new LineSequence(srcDocLines, originalLines);
        const sequence2 = new LineSequence(tgtDocLines, modifiedLines);
        const lineAlignmentResult = (() => {
            if (sequence1.length + sequence2.length < 1700) {
                // Use the improved algorithm for small files
                return this.dynamicProgrammingDiffing.compute(sequence1, sequence2, timeout, (offset1, offset2) => originalLines[offset1] === modifiedLines[offset2]
                    ? modifiedLines[offset2].length === 0
                        ? 0.1
                        : 1 + Math.log(1 + modifiedLines[offset2].length)
                    : 0.99);
            }
            return this.myersDiffingAlgorithm.compute(sequence1, sequence2);
        })();
        let lineAlignments = lineAlignmentResult.diffs;
        let hitTimeout = lineAlignmentResult.hitTimeout;
        lineAlignments = optimizeSequenceDiffs(sequence1, sequence2, lineAlignments);
        lineAlignments = removeRandomLineMatches(sequence1, sequence2, lineAlignments);
        const alignments = [];
        const scanForWhitespaceChanges = (equalLinesCount) => {
            if (!considerWhitespaceChanges) {
                return;
            }
            for (let i = 0; i < equalLinesCount; i++) {
                const seq1Offset = seq1LastStart + i;
                const seq2Offset = seq2LastStart + i;
                if (originalLines[seq1Offset] !== modifiedLines[seq2Offset]) {
                    // This is because of whitespace changes, diff these lines
                    const characterDiffs = this.refineDiff(originalLines, modifiedLines, new SequenceDiff(new OffsetRange(seq1Offset, seq1Offset + 1), new OffsetRange(seq2Offset, seq2Offset + 1)), timeout, considerWhitespaceChanges);
                    for (const a of characterDiffs.mappings) {
                        alignments.push(a);
                    }
                    if (characterDiffs.hitTimeout) {
                        hitTimeout = true;
                    }
                }
            }
        };
        let seq1LastStart = 0;
        let seq2LastStart = 0;
        for (const diff of lineAlignments) {
            assertFn(() => diff.seq1Range.start - seq1LastStart === diff.seq2Range.start - seq2LastStart);
            const equalLinesCount = diff.seq1Range.start - seq1LastStart;
            scanForWhitespaceChanges(equalLinesCount);
            seq1LastStart = diff.seq1Range.endExclusive;
            seq2LastStart = diff.seq2Range.endExclusive;
            const characterDiffs = this.refineDiff(originalLines, modifiedLines, diff, timeout, considerWhitespaceChanges);
            if (characterDiffs.hitTimeout) {
                hitTimeout = true;
            }
            for (const a of characterDiffs.mappings) {
                alignments.push(a);
            }
        }
        scanForWhitespaceChanges(originalLines.length - seq1LastStart);
        const changes = lineRangeMappingFromRangeMappings(alignments, originalLines, modifiedLines);
        let moves = [];
        if (options.computeMoves) {
            moves = this.computeMoves(changes, originalLines, modifiedLines, srcDocLines, tgtDocLines, timeout, considerWhitespaceChanges);
        }
        // Make sure all ranges are valid
        assertFn(() => {
            function validatePosition(pos, lines) {
                if (pos.lineNumber < 1 || pos.lineNumber > lines.length) {
                    return false;
                }
                const line = lines[pos.lineNumber - 1];
                if (pos.column < 1 || pos.column > line.length + 1) {
                    return false;
                }
                return true;
            }
            function validateRange(range, lines) {
                if (range.startLineNumber < 1 || range.startLineNumber > lines.length + 1) {
                    return false;
                }
                if (range.endLineNumberExclusive < 1 || range.endLineNumberExclusive > lines.length + 1) {
                    return false;
                }
                return true;
            }
            for (const c of changes) {
                if (!c.innerChanges) {
                    return false;
                }
                for (const ic of c.innerChanges) {
                    const valid = validatePosition(ic.modifiedRange.getStartPosition(), modifiedLines) && validatePosition(ic.modifiedRange.getEndPosition(), modifiedLines) &&
                        validatePosition(ic.originalRange.getStartPosition(), originalLines) && validatePosition(ic.originalRange.getEndPosition(), originalLines);
                    if (!valid) {
                        return false;
                    }
                }
                if (!validateRange(c.modifiedRange, modifiedLines) || !validateRange(c.originalRange, originalLines)) {
                    return false;
                }
            }
            return true;
        });
        return new LinesDiff(changes, moves, hitTimeout);
    }
    computeMoves(changes, originalLines, modifiedLines, hashedOriginalLines, hashedModifiedLines, timeout, considerWhitespaceChanges) {
        const moves = [];
        const deletions = changes
            .filter(c => c.modifiedRange.isEmpty && c.originalRange.length >= 3)
            .map(d => new LineRangeFragment(d.originalRange, originalLines, d));
        const insertions = new Set(changes
            .filter(c => c.originalRange.isEmpty && c.modifiedRange.length >= 3)
            .map(d => new LineRangeFragment(d.modifiedRange, modifiedLines, d)));
        const excludedChanges = new Set();
        for (const deletion of deletions) {
            let highestSimilarity = -1;
            let best;
            for (const insertion of insertions) {
                const similarity = deletion.computeSimilarity(insertion);
                if (similarity > highestSimilarity) {
                    highestSimilarity = similarity;
                    best = insertion;
                }
            }
            if (highestSimilarity > 0.90 && best) {
                insertions.delete(best);
                moves.push(new SimpleLineRangeMapping(deletion.range, best.range));
                excludedChanges.add(deletion.source);
                excludedChanges.add(best.source);
            }
            if (!timeout.isValid()) {
                return [];
            }
        }
        const original3LineHashes = new SetMap();
        for (const change of changes) {
            if (excludedChanges.has(change)) {
                continue;
            }
            for (let i = change.originalRange.startLineNumber; i < change.originalRange.endLineNumberExclusive - 2; i++) {
                const key = `${hashedOriginalLines[i - 1]}:${hashedOriginalLines[i + 1 - 1]}:${hashedOriginalLines[i + 2 - 1]}`;
                original3LineHashes.add(key, { range: new LineRange(i, i + 3) });
            }
        }
        const possibleMappings = [];
        changes.sort(compareBy(c => c.modifiedRange.startLineNumber, numberComparator));
        for (const change of changes) {
            if (excludedChanges.has(change)) {
                continue;
            }
            let lastMappings = [];
            for (let i = change.modifiedRange.startLineNumber; i < change.modifiedRange.endLineNumberExclusive - 2; i++) {
                const key = `${hashedModifiedLines[i - 1]}:${hashedModifiedLines[i + 1 - 1]}:${hashedModifiedLines[i + 2 - 1]}`;
                const currentModifiedRange = new LineRange(i, i + 3);
                const nextMappings = [];
                original3LineHashes.forEach(key, ({ range }) => {
                    for (const lastMapping of lastMappings) {
                        // does this match extend some last match?
                        if (lastMapping.originalLineRange.endLineNumberExclusive + 1 === range.endLineNumberExclusive &&
                            lastMapping.modifiedLineRange.endLineNumberExclusive + 1 === currentModifiedRange.endLineNumberExclusive) {
                            lastMapping.originalLineRange = new LineRange(lastMapping.originalLineRange.startLineNumber, range.endLineNumberExclusive);
                            lastMapping.modifiedLineRange = new LineRange(lastMapping.modifiedLineRange.startLineNumber, currentModifiedRange.endLineNumberExclusive);
                            nextMappings.push(lastMapping);
                            return;
                        }
                    }
                    const mapping = {
                        modifiedLineRange: currentModifiedRange,
                        originalLineRange: range,
                    };
                    possibleMappings.push(mapping);
                    nextMappings.push(mapping);
                });
                lastMappings = nextMappings;
            }
            if (!timeout.isValid()) {
                return [];
            }
        }
        possibleMappings.sort(reverseOrder(compareBy(m => m.modifiedLineRange.length, numberComparator)));
        const modifiedSet = new LineRangeSet();
        const originalSet = new LineRangeSet();
        for (const mapping of possibleMappings) {
            const diffOrigToMod = mapping.modifiedLineRange.startLineNumber - mapping.originalLineRange.startLineNumber;
            const modifiedSections = modifiedSet.subtractFrom(mapping.modifiedLineRange);
            const originalTranslatedSections = originalSet.subtractFrom(mapping.originalLineRange).map(r => r.delta(diffOrigToMod));
            const modifiedIntersectedSections = intersectRanges(modifiedSections, originalTranslatedSections);
            for (const s of modifiedIntersectedSections) {
                if (s.length < 3) {
                    continue;
                }
                const modifiedLineRange = s;
                const originalLineRange = s.delta(-diffOrigToMod);
                moves.push(new SimpleLineRangeMapping(originalLineRange, modifiedLineRange));
                modifiedSet.addRange(modifiedLineRange);
                originalSet.addRange(originalLineRange);
            }
        }
        // join moves
        moves.sort(compareBy(m => m.original.startLineNumber, numberComparator));
        if (moves.length === 0) {
            return [];
        }
        let joinedMoves = [moves[0]];
        for (let i = 1; i < moves.length; i++) {
            const last = joinedMoves[joinedMoves.length - 1];
            const current = moves[i];
            const originalDist = current.original.startLineNumber - last.original.endLineNumberExclusive;
            const modifiedDist = current.modified.startLineNumber - last.modified.endLineNumberExclusive;
            const currentMoveAfterLast = originalDist >= 0 && modifiedDist >= 0;
            if (currentMoveAfterLast && originalDist + modifiedDist <= 2) {
                joinedMoves[joinedMoves.length - 1] = last.join(current);
                continue;
            }
            const originalText = current.original.toOffsetRange().slice(originalLines).map(l => l.trim()).join('\n');
            if (originalText.length <= 10) {
                // Ignore small moves
                continue;
            }
            joinedMoves.push(current);
        }
        // Ignore non moves
        const originalChanges = MonotonousFinder.createOfSorted(changes, c => c.originalRange.endLineNumberExclusive, numberComparator);
        joinedMoves = joinedMoves.filter(m => {
            const diffBeforeOriginalMove = originalChanges.findLastItemBeforeOrEqual(m.original.startLineNumber)
                || new LineRangeMapping(new LineRange(1, 1), new LineRange(1, 1), []);
            const modifiedDistToPrevDiff = m.modified.startLineNumber - diffBeforeOriginalMove.modifiedRange.endLineNumberExclusive;
            const originalDistToPrevDiff = m.original.startLineNumber - diffBeforeOriginalMove.originalRange.endLineNumberExclusive;
            const differentDistances = modifiedDistToPrevDiff !== originalDistToPrevDiff;
            return differentDistances;
        });
        const fullMoves = joinedMoves.map(m => {
            const moveChanges = this.refineDiff(originalLines, modifiedLines, new SequenceDiff(m.original.toOffsetRange(), m.modified.toOffsetRange()), timeout, considerWhitespaceChanges);
            const mappings = lineRangeMappingFromRangeMappings(moveChanges.mappings, originalLines, modifiedLines, true);
            return new MovedText(m, mappings);
        });
        return fullMoves;
    }
    refineDiff(originalLines, modifiedLines, diff, timeout, considerWhitespaceChanges) {
        const slice1 = new LinesSliceCharSequence(originalLines, diff.seq1Range, considerWhitespaceChanges);
        const slice2 = new LinesSliceCharSequence(modifiedLines, diff.seq2Range, considerWhitespaceChanges);
        const diffResult = slice1.length + slice2.length < 500
            ? this.dynamicProgrammingDiffing.compute(slice1, slice2, timeout)
            : this.myersDiffingAlgorithm.compute(slice1, slice2, timeout);
        let diffs = diffResult.diffs;
        diffs = optimizeSequenceDiffs(slice1, slice2, diffs);
        diffs = coverFullWords(slice1, slice2, diffs);
        diffs = smoothenSequenceDiffs(slice1, slice2, diffs);
        diffs = removeRandomMatches(slice1, slice2, diffs);
        const result = diffs.map((d) => new RangeMapping(slice1.translateRange(d.seq1Range), slice2.translateRange(d.seq2Range)));
        // Assert: result applied on original should be the same as diff applied to original
        return {
            mappings: result,
            hitTimeout: diffResult.hitTimeout,
        };
    }
}
class MonotonousFinder {
    static createOfSorted(items, itemToDomain, domainComparator) {
        return new MonotonousFinder(items, itemToDomain, domainComparator);
    }
    constructor(_items, _itemToDomain, _domainComparator) {
        this._items = _items;
        this._itemToDomain = _itemToDomain;
        this._domainComparator = _domainComparator;
        this._currentIdx = 0; // All values with index lower than this are smaller than or equal to _lastValue and vice versa.
        this._lastValue = undefined; // Represents a smallest value.
        this._hasLastValue = false;
    }
    /**
     * Assumes the values are monotonously increasing.
     */
    findLastItemBeforeOrEqual(value) {
        if (this._hasLastValue && CompareResult.isLessThan(this._domainComparator(value, this._lastValue))) {
            // Values must be monotonously increasing
            throw new BugIndicatingError();
        }
        this._lastValue = value;
        this._hasLastValue = true;
        while (this._currentIdx < this._items.length
            && CompareResult.isLessThanOrEqual(this._domainComparator(this._itemToDomain(this._items[this._currentIdx]), value))) {
            this._currentIdx++;
        }
        return this._currentIdx === 0 ? undefined : this._items[this._currentIdx - 1];
    }
}
function intersectRanges(ranges1, ranges2) {
    const result = [];
    let i1 = 0;
    let i2 = 0;
    while (i1 < ranges1.length && i2 < ranges2.length) {
        const r1 = ranges1[i1];
        const r2 = ranges2[i2];
        const i = r1.intersect(r2);
        if (i && !i.isEmpty) {
            result.push(i);
        }
        if (r1.endLineNumberExclusive < r2.endLineNumberExclusive) {
            i1++;
        }
        else {
            i2++;
        }
    }
    return result;
}
// TODO make this fast
class LineRangeSet {
    constructor() {
        this._normalizedRanges = [];
    }
    addRange(range) {
        // Idea: Find joinRange such that:
        // replaceRange = _normalizedRanges.replaceRange(joinRange, range.joinAll(joinRange.map(idx => this._normalizedRanges[idx])))
        // idx of first element that touches range or that is after range
        const joinRangeStartIdx = mapMinusOne(this._normalizedRanges.findIndex(r => r.endLineNumberExclusive >= range.startLineNumber), this._normalizedRanges.length);
        // idx of element after { last element that touches range or that is before range }
        const joinRangeEndIdxExclusive = findLastIndex(this._normalizedRanges, r => r.startLineNumber <= range.endLineNumberExclusive) + 1;
        if (joinRangeStartIdx === joinRangeEndIdxExclusive) {
            // If there is no element that touches range, then joinRangeStartIdx === joinRangeEndIdxExclusive and that value is the index of the element after range
            this._normalizedRanges.splice(joinRangeStartIdx, 0, range);
        }
        else if (joinRangeStartIdx === joinRangeEndIdxExclusive - 1) {
            // Else, there is an element that touches range and in this case it is both the first and last element. Thus we can replace it
            const joinRange = this._normalizedRanges[joinRangeStartIdx];
            this._normalizedRanges[joinRangeStartIdx] = joinRange.join(range);
        }
        else {
            // First and last element are different - we need to replace the entire range
            const joinRange = this._normalizedRanges[joinRangeStartIdx].join(this._normalizedRanges[joinRangeEndIdxExclusive - 1]).join(range);
            this._normalizedRanges.splice(joinRangeStartIdx, joinRangeEndIdxExclusive - joinRangeStartIdx, joinRange);
        }
    }
    /**
     * Subtracts all ranges in this set from `range` and returns the result.
     */
    subtractFrom(range) {
        // idx of first element that touches range or that is after range
        const joinRangeStartIdx = mapMinusOne(this._normalizedRanges.findIndex(r => r.endLineNumberExclusive >= range.startLineNumber), this._normalizedRanges.length);
        // idx of element after { last element that touches range or that is before range }
        const joinRangeEndIdxExclusive = findLastIndex(this._normalizedRanges, r => r.startLineNumber <= range.endLineNumberExclusive) + 1;
        if (joinRangeStartIdx === joinRangeEndIdxExclusive) {
            return [range];
        }
        const result = [];
        let startLineNumber = range.startLineNumber;
        for (let i = joinRangeStartIdx; i < joinRangeEndIdxExclusive; i++) {
            const r = this._normalizedRanges[i];
            if (r.startLineNumber > startLineNumber) {
                result.push(new LineRange(startLineNumber, r.startLineNumber));
            }
            startLineNumber = r.endLineNumberExclusive;
        }
        if (startLineNumber < range.endLineNumberExclusive) {
            result.push(new LineRange(startLineNumber, range.endLineNumberExclusive));
        }
        return result;
    }
}
function mapMinusOne(idx, mapTo) {
    return idx === -1 ? mapTo : idx;
}
function coverFullWords(sequence1, sequence2, sequenceDiffs) {
    const additional = [];
    let lastModifiedWord = undefined;
    function maybePushWordToAdditional() {
        if (!lastModifiedWord) {
            return;
        }
        const originalLength1 = lastModifiedWord.s1Range.length - lastModifiedWord.deleted;
        const originalLength2 = lastModifiedWord.s2Range.length - lastModifiedWord.added;
        if (originalLength1 !== originalLength2) {
            // TODO figure out why this happens
        }
        if (Math.max(lastModifiedWord.deleted, lastModifiedWord.added) + (lastModifiedWord.count - 1) > originalLength1) {
            additional.push(new SequenceDiff(lastModifiedWord.s1Range, lastModifiedWord.s2Range));
        }
        lastModifiedWord = undefined;
    }
    for (const s of sequenceDiffs) {
        function processWord(s1Range, s2Range) {
            var _a, _b, _c, _d;
            if (!lastModifiedWord || !lastModifiedWord.s1Range.containsRange(s1Range) || !lastModifiedWord.s2Range.containsRange(s2Range)) {
                if (lastModifiedWord && !(lastModifiedWord.s1Range.endExclusive < s1Range.start && lastModifiedWord.s2Range.endExclusive < s2Range.start)) {
                    const s1Added = OffsetRange.tryCreate(lastModifiedWord.s1Range.endExclusive, s1Range.start);
                    const s2Added = OffsetRange.tryCreate(lastModifiedWord.s2Range.endExclusive, s2Range.start);
                    lastModifiedWord.deleted += (_a = s1Added === null || s1Added === void 0 ? void 0 : s1Added.length) !== null && _a !== void 0 ? _a : 0;
                    lastModifiedWord.added += (_b = s2Added === null || s2Added === void 0 ? void 0 : s2Added.length) !== null && _b !== void 0 ? _b : 0;
                    lastModifiedWord.s1Range = lastModifiedWord.s1Range.join(s1Range);
                    lastModifiedWord.s2Range = lastModifiedWord.s2Range.join(s2Range);
                }
                else {
                    maybePushWordToAdditional();
                    lastModifiedWord = { added: 0, deleted: 0, count: 0, s1Range: s1Range, s2Range: s2Range };
                }
            }
            const changedS1 = s1Range.intersect(s.seq1Range);
            const changedS2 = s2Range.intersect(s.seq2Range);
            lastModifiedWord.count++;
            lastModifiedWord.deleted += (_c = changedS1 === null || changedS1 === void 0 ? void 0 : changedS1.length) !== null && _c !== void 0 ? _c : 0;
            lastModifiedWord.added += (_d = changedS2 === null || changedS2 === void 0 ? void 0 : changedS2.length) !== null && _d !== void 0 ? _d : 0;
        }
        const w1Before = sequence1.findWordContaining(s.seq1Range.start - 1);
        const w2Before = sequence2.findWordContaining(s.seq2Range.start - 1);
        const w1After = sequence1.findWordContaining(s.seq1Range.endExclusive);
        const w2After = sequence2.findWordContaining(s.seq2Range.endExclusive);
        if (w1Before && w1After && w2Before && w2After && w1Before.equals(w1After) && w2Before.equals(w2After)) {
            processWord(w1Before, w2Before);
        }
        else {
            if (w1Before && w2Before) {
                processWord(w1Before, w2Before);
            }
            if (w1After && w2After) {
                processWord(w1After, w2After);
            }
        }
    }
    maybePushWordToAdditional();
    const merged = mergeSequenceDiffs(sequenceDiffs, additional);
    return merged;
}
function mergeSequenceDiffs(sequenceDiffs1, sequenceDiffs2) {
    const result = [];
    while (sequenceDiffs1.length > 0 || sequenceDiffs2.length > 0) {
        const sd1 = sequenceDiffs1[0];
        const sd2 = sequenceDiffs2[0];
        let next;
        if (sd1 && (!sd2 || sd1.seq1Range.start < sd2.seq1Range.start)) {
            next = sequenceDiffs1.shift();
        }
        else {
            next = sequenceDiffs2.shift();
        }
        if (result.length > 0 && result[result.length - 1].seq1Range.endExclusive >= next.seq1Range.start) {
            result[result.length - 1] = result[result.length - 1].join(next);
        }
        else {
            result.push(next);
        }
    }
    return result;
}
export function lineRangeMappingFromRangeMappings(alignments, originalLines, modifiedLines, dontAssertStartLine = false) {
    const changes = [];
    for (const g of group(alignments.map(a => getLineRangeMapping(a, originalLines, modifiedLines)), (a1, a2) => a1.originalRange.overlapOrTouch(a2.originalRange)
        || a1.modifiedRange.overlapOrTouch(a2.modifiedRange))) {
        const first = g[0];
        const last = g[g.length - 1];
        changes.push(new LineRangeMapping(first.originalRange.join(last.originalRange), first.modifiedRange.join(last.modifiedRange), g.map(a => a.innerChanges[0])));
    }
    assertFn(() => {
        if (!dontAssertStartLine) {
            if (changes.length > 0 && changes[0].originalRange.startLineNumber !== changes[0].modifiedRange.startLineNumber) {
                return false;
            }
        }
        return checkAdjacentItems(changes, (m1, m2) => m2.originalRange.startLineNumber - m1.originalRange.endLineNumberExclusive === m2.modifiedRange.startLineNumber - m1.modifiedRange.endLineNumberExclusive &&
            // There has to be an unchanged line in between (otherwise both diffs should have been joined)
            m1.originalRange.endLineNumberExclusive < m2.originalRange.startLineNumber &&
            m1.modifiedRange.endLineNumberExclusive < m2.modifiedRange.startLineNumber);
    });
    return changes;
}
export function getLineRangeMapping(rangeMapping, originalLines, modifiedLines) {
    let lineStartDelta = 0;
    let lineEndDelta = 0;
    // rangeMapping describes the edit that replaces `rangeMapping.originalRange` with `newText := getText(modifiedLines, rangeMapping.modifiedRange)`.
    // original: ]xxx \n <- this line is not modified
    // modified: ]xx  \n
    if (rangeMapping.modifiedRange.endColumn === 1 && rangeMapping.originalRange.endColumn === 1
        && rangeMapping.originalRange.startLineNumber + lineStartDelta <= rangeMapping.originalRange.endLineNumber
        && rangeMapping.modifiedRange.startLineNumber + lineStartDelta <= rangeMapping.modifiedRange.endLineNumber) {
        // We can only do this if the range is not empty yet
        lineEndDelta = -1;
    }
    // original: xxx[ \n <- this line is not modified
    // modified: xxx[ \n
    if (rangeMapping.modifiedRange.startColumn - 1 >= modifiedLines[rangeMapping.modifiedRange.startLineNumber - 1].length
        && rangeMapping.originalRange.startColumn - 1 >= originalLines[rangeMapping.originalRange.startLineNumber - 1].length
        && rangeMapping.originalRange.startLineNumber <= rangeMapping.originalRange.endLineNumber + lineEndDelta
        && rangeMapping.modifiedRange.startLineNumber <= rangeMapping.modifiedRange.endLineNumber + lineEndDelta) {
        // We can only do this if the range is not empty yet
        lineStartDelta = 1;
    }
    const originalLineRange = new LineRange(rangeMapping.originalRange.startLineNumber + lineStartDelta, rangeMapping.originalRange.endLineNumber + 1 + lineEndDelta);
    const modifiedLineRange = new LineRange(rangeMapping.modifiedRange.startLineNumber + lineStartDelta, rangeMapping.modifiedRange.endLineNumber + 1 + lineEndDelta);
    return new LineRangeMapping(originalLineRange, modifiedLineRange, [rangeMapping]);
}
function* group(items, shouldBeGrouped) {
    let currentGroup;
    let last;
    for (const item of items) {
        if (last !== undefined && shouldBeGrouped(last, item)) {
            currentGroup.push(item);
        }
        else {
            if (currentGroup) {
                yield currentGroup;
            }
            currentGroup = [item];
        }
        last = item;
    }
    if (currentGroup) {
        yield currentGroup;
    }
}
export class LineSequence {
    constructor(trimmedHash, lines) {
        this.trimmedHash = trimmedHash;
        this.lines = lines;
    }
    getElement(offset) {
        return this.trimmedHash[offset];
    }
    get length() {
        return this.trimmedHash.length;
    }
    getBoundaryScore(length) {
        const indentationBefore = length === 0 ? 0 : getIndentation(this.lines[length - 1]);
        const indentationAfter = length === this.lines.length ? 0 : getIndentation(this.lines[length]);
        return 1000 - (indentationBefore + indentationAfter);
    }
    getText(range) {
        return this.lines.slice(range.start, range.endExclusive).join('\n');
    }
    isStronglyEqual(offset1, offset2) {
        return this.lines[offset1] === this.lines[offset2];
    }
}
function getIndentation(str) {
    let i = 0;
    while (i < str.length && (str.charCodeAt(i) === 32 /* CharCode.Space */ || str.charCodeAt(i) === 9 /* CharCode.Tab */)) {
        i++;
    }
    return i;
}
export class LinesSliceCharSequence {
    constructor(lines, lineRange, considerWhitespaceChanges) {
        // This slice has to have lineRange.length many \n! (otherwise diffing against an empty slice will be problematic)
        // (Unless it covers the entire document, in that case the other slice also has to cover the entire document ands it's okay)
        this.lines = lines;
        this.considerWhitespaceChanges = considerWhitespaceChanges;
        this.elements = [];
        this.firstCharOffsetByLineMinusOne = [];
        // To account for trimming
        this.additionalOffsetByLine = [];
        // If the slice covers the end, but does not start at the beginning, we include just the \n of the previous line.
        let trimFirstLineFully = false;
        if (lineRange.start > 0 && lineRange.endExclusive >= lines.length) {
            lineRange = new OffsetRange(lineRange.start - 1, lineRange.endExclusive);
            trimFirstLineFully = true;
        }
        this.lineRange = lineRange;
        for (let i = this.lineRange.start; i < this.lineRange.endExclusive; i++) {
            let line = lines[i];
            let offset = 0;
            if (trimFirstLineFully) {
                offset = line.length;
                line = '';
                trimFirstLineFully = false;
            }
            else if (!considerWhitespaceChanges) {
                const trimmedStartLine = line.trimStart();
                offset = line.length - trimmedStartLine.length;
                line = trimmedStartLine.trimEnd();
            }
            this.additionalOffsetByLine.push(offset);
            for (let i = 0; i < line.length; i++) {
                this.elements.push(line.charCodeAt(i));
            }
            // Don't add an \n that does not exist in the document.
            if (i < lines.length - 1) {
                this.elements.push('\n'.charCodeAt(0));
                this.firstCharOffsetByLineMinusOne[i - this.lineRange.start] = this.elements.length;
            }
        }
        // To account for the last line
        this.additionalOffsetByLine.push(0);
    }
    toString() {
        return `Slice: "${this.text}"`;
    }
    get text() {
        return this.getText(new OffsetRange(0, this.length));
    }
    getText(range) {
        return this.elements.slice(range.start, range.endExclusive).map(e => String.fromCharCode(e)).join('');
    }
    getElement(offset) {
        return this.elements[offset];
    }
    get length() {
        return this.elements.length;
    }
    getBoundaryScore(length) {
        //   a   b   c   ,           d   e   f
        // 11  0   0   12  15  6   13  0   0   11
        const prevCategory = getCategory(length > 0 ? this.elements[length - 1] : -1);
        const nextCategory = getCategory(length < this.elements.length ? this.elements[length] : -1);
        if (prevCategory === 6 /* CharBoundaryCategory.LineBreakCR */ && nextCategory === 7 /* CharBoundaryCategory.LineBreakLF */) {
            // don't break between \r and \n
            return 0;
        }
        let score = 0;
        if (prevCategory !== nextCategory) {
            score += 10;
            if (nextCategory === 1 /* CharBoundaryCategory.WordUpper */) {
                score += 1;
            }
        }
        score += getCategoryBoundaryScore(prevCategory);
        score += getCategoryBoundaryScore(nextCategory);
        return score;
    }
    translateOffset(offset) {
        // find smallest i, so that lineBreakOffsets[i] <= offset using binary search
        if (this.lineRange.isEmpty) {
            return new Position(this.lineRange.start + 1, 1);
        }
        let i = 0;
        let j = this.firstCharOffsetByLineMinusOne.length;
        while (i < j) {
            const k = Math.floor((i + j) / 2);
            if (this.firstCharOffsetByLineMinusOne[k] > offset) {
                j = k;
            }
            else {
                i = k + 1;
            }
        }
        const offsetOfFirstCharInLine = i === 0 ? 0 : this.firstCharOffsetByLineMinusOne[i - 1];
        return new Position(this.lineRange.start + i + 1, offset - offsetOfFirstCharInLine + 1 + this.additionalOffsetByLine[i]);
    }
    translateRange(range) {
        return Range.fromPositions(this.translateOffset(range.start), this.translateOffset(range.endExclusive));
    }
    /**
     * Finds the word that contains the character at the given offset
     */
    findWordContaining(offset) {
        if (offset < 0 || offset >= this.elements.length) {
            return undefined;
        }
        if (!isWordChar(this.elements[offset])) {
            return undefined;
        }
        // find start
        let start = offset;
        while (start > 0 && isWordChar(this.elements[start - 1])) {
            start--;
        }
        // find end
        let end = offset;
        while (end < this.elements.length && isWordChar(this.elements[end])) {
            end++;
        }
        return new OffsetRange(start, end);
    }
    countLinesIn(range) {
        return this.translateOffset(range.endExclusive).lineNumber - this.translateOffset(range.start).lineNumber;
    }
    isStronglyEqual(offset1, offset2) {
        return this.elements[offset1] === this.elements[offset2];
    }
    extendToFullLines(range) {
        var _a, _b;
        const start = (_a = findLastMonotonous(this.firstCharOffsetByLineMinusOne, x => x <= range.start)) !== null && _a !== void 0 ? _a : 0;
        const end = (_b = findFirstMonotonous(this.firstCharOffsetByLineMinusOne, x => range.endExclusive <= x)) !== null && _b !== void 0 ? _b : this.elements.length;
        return new OffsetRange(start, end);
    }
}
/**
 * `arr.map(predicate)` must be like `[true, ..., true, false, ..., false]`!
 *
 * @returns -1 if predicate is false for all items
 */
function findLastIdxMonotonous(arr, predicate) {
    let i = 0;
    let j = arr.length;
    while (i < j) {
        const k = Math.floor((i + j) / 2);
        if (predicate(arr[k])) {
            i = k + 1;
        }
        else {
            j = k;
        }
    }
    return i - 1;
}
export function findLastMonotonous(arr, predicate) {
    const idx = findLastIdxMonotonous(arr, predicate);
    return idx === -1 ? undefined : arr[idx];
}
/**
 * `arr.map(predicate)` must be like `[false, ..., false, true, ..., true]`!
 *
 * @returns arr.length if predicate is false for all items
 */
function findFirstIdxMonotonous(arr, predicate) {
    let i = 0;
    let j = arr.length;
    while (i < j) {
        const k = Math.floor((i + j) / 2);
        if (predicate(arr[k])) {
            j = k;
        }
        else {
            i = k + 1;
        }
    }
    return i;
}
export function findFirstMonotonous(arr, predicate) {
    const idx = findFirstIdxMonotonous(arr, predicate);
    return idx === arr.length ? undefined : arr[idx];
}
function isWordChar(charCode) {
    return charCode >= 97 /* CharCode.a */ && charCode <= 122 /* CharCode.z */
        || charCode >= 65 /* CharCode.A */ && charCode <= 90 /* CharCode.Z */
        || charCode >= 48 /* CharCode.Digit0 */ && charCode <= 57 /* CharCode.Digit9 */;
}
const score = {
    [0 /* CharBoundaryCategory.WordLower */]: 0,
    [1 /* CharBoundaryCategory.WordUpper */]: 0,
    [2 /* CharBoundaryCategory.WordNumber */]: 0,
    [3 /* CharBoundaryCategory.End */]: 10,
    [4 /* CharBoundaryCategory.Other */]: 2,
    [5 /* CharBoundaryCategory.Space */]: 3,
    [6 /* CharBoundaryCategory.LineBreakCR */]: 10,
    [7 /* CharBoundaryCategory.LineBreakLF */]: 10,
};
function getCategoryBoundaryScore(category) {
    return score[category];
}
function getCategory(charCode) {
    if (charCode === 10 /* CharCode.LineFeed */) {
        return 7 /* CharBoundaryCategory.LineBreakLF */;
    }
    else if (charCode === 13 /* CharCode.CarriageReturn */) {
        return 6 /* CharBoundaryCategory.LineBreakCR */;
    }
    else if (isSpace(charCode)) {
        return 5 /* CharBoundaryCategory.Space */;
    }
    else if (charCode >= 97 /* CharCode.a */ && charCode <= 122 /* CharCode.z */) {
        return 0 /* CharBoundaryCategory.WordLower */;
    }
    else if (charCode >= 65 /* CharCode.A */ && charCode <= 90 /* CharCode.Z */) {
        return 1 /* CharBoundaryCategory.WordUpper */;
    }
    else if (charCode >= 48 /* CharCode.Digit0 */ && charCode <= 57 /* CharCode.Digit9 */) {
        return 2 /* CharBoundaryCategory.WordNumber */;
    }
    else if (charCode === -1) {
        return 3 /* CharBoundaryCategory.End */;
    }
    else {
        return 4 /* CharBoundaryCategory.Other */;
    }
}
function isSpace(charCode) {
    return charCode === 32 /* CharCode.Space */ || charCode === 9 /* CharCode.Tab */;
}
const chrKeys = new Map();
function getKey(chr) {
    let key = chrKeys.get(chr);
    if (key === undefined) {
        key = chrKeys.size;
        chrKeys.set(chr, key);
    }
    return key;
}
class LineRangeFragment {
    constructor(range, lines, source) {
        this.range = range;
        this.lines = lines;
        this.source = source;
        this.histogram = [];
        let counter = 0;
        for (let i = range.startLineNumber - 1; i < range.endLineNumberExclusive - 1; i++) {
            const line = lines[i];
            for (let j = 0; j < line.length; j++) {
                counter++;
                const chr = line[j];
                const key = getKey(chr);
                this.histogram[key] = (this.histogram[key] || 0) + 1;
            }
            counter++;
            const key = getKey('\n');
            this.histogram[key] = (this.histogram[key] || 0) + 1;
        }
        this.totalCount = counter;
    }
    computeSimilarity(other) {
        var _a, _b;
        let sumDifferences = 0;
        const maxLength = Math.max(this.histogram.length, other.histogram.length);
        for (let i = 0; i < maxLength; i++) {
            sumDifferences += Math.abs(((_a = this.histogram[i]) !== null && _a !== void 0 ? _a : 0) - ((_b = other.histogram[i]) !== null && _b !== void 0 ? _b : 0));
        }
        return 1 - (sumDifferences / (this.totalCount + other.totalCount));
    }
}
