/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Disposable } from '../../../../base/common/lifecycle.js';
import { derived } from '../../../../base/common/observable.js';
import { arrowRevertChange, diffAddDecoration, diffAddDecorationEmpty, diffDeleteDecoration, diffDeleteDecorationEmpty, diffLineAddDecorationBackground, diffLineAddDecorationBackgroundWithIndicator, diffLineDeleteDecorationBackground, diffLineDeleteDecorationBackgroundWithIndicator, diffWholeLineAddDecoration, diffWholeLineDeleteDecoration } from './decorations.js';
import { MovedBlocksLinesPart } from './movedBlocksLines.js';
import { applyObservableDecorations } from './utils.js';
import { Position } from '../../../common/core/position.js';
import { Range } from '../../../common/core/range.js';
export class DiffEditorDecorations extends Disposable {
    constructor(_editors, _diffModel, _options) {
        super();
        this._editors = _editors;
        this._diffModel = _diffModel;
        this._options = _options;
        this._decorations = derived((reader) => {
            var _a;
            /** @description _decorations */
            const diff = (_a = this._diffModel.read(reader)) === null || _a === void 0 ? void 0 : _a.diff.read(reader);
            if (!diff) {
                return null;
            }
            const movedTextToCompare = this._diffModel.read(reader).movedTextToCompare.read(reader);
            const renderIndicators = this._options.renderIndicators.read(reader);
            const showEmptyDecorations = this._options.showEmptyDecorations.read(reader);
            const originalDecorations = [];
            const modifiedDecorations = [];
            if (!movedTextToCompare) {
                for (const m of diff.mappings) {
                    if (!m.lineRangeMapping.originalRange.isEmpty) {
                        originalDecorations.push({ range: m.lineRangeMapping.originalRange.toInclusiveRange(), options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
                    }
                    if (!m.lineRangeMapping.modifiedRange.isEmpty) {
                        modifiedDecorations.push({ range: m.lineRangeMapping.modifiedRange.toInclusiveRange(), options: renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground });
                    }
                    if (m.lineRangeMapping.modifiedRange.isEmpty || m.lineRangeMapping.originalRange.isEmpty) {
                        if (!m.lineRangeMapping.originalRange.isEmpty) {
                            originalDecorations.push({ range: m.lineRangeMapping.originalRange.toInclusiveRange(), options: diffWholeLineDeleteDecoration });
                        }
                        if (!m.lineRangeMapping.modifiedRange.isEmpty) {
                            modifiedDecorations.push({ range: m.lineRangeMapping.modifiedRange.toInclusiveRange(), options: diffWholeLineAddDecoration });
                        }
                    }
                    else {
                        for (const i of m.lineRangeMapping.innerChanges || []) {
                            // Don't show empty markers outside the line range
                            if (m.lineRangeMapping.originalRange.contains(i.originalRange.startLineNumber)) {
                                originalDecorations.push({ range: i.originalRange, options: (i.originalRange.isEmpty() && showEmptyDecorations) ? diffDeleteDecorationEmpty : diffDeleteDecoration });
                            }
                            if (m.lineRangeMapping.modifiedRange.contains(i.modifiedRange.startLineNumber)) {
                                modifiedDecorations.push({ range: i.modifiedRange, options: (i.modifiedRange.isEmpty() && showEmptyDecorations) ? diffAddDecorationEmpty : diffAddDecoration });
                            }
                        }
                    }
                    if (!m.lineRangeMapping.modifiedRange.isEmpty && this._options.shouldRenderRevertArrows.read(reader) && !movedTextToCompare) {
                        modifiedDecorations.push({ range: Range.fromPositions(new Position(m.lineRangeMapping.modifiedRange.startLineNumber, 1)), options: arrowRevertChange });
                    }
                }
            }
            if (movedTextToCompare) {
                for (const m of movedTextToCompare.changes) {
                    const fullRangeOriginal = m.originalRange.toInclusiveRange();
                    if (fullRangeOriginal) {
                        originalDecorations.push({ range: fullRangeOriginal, options: renderIndicators ? diffLineDeleteDecorationBackgroundWithIndicator : diffLineDeleteDecorationBackground });
                    }
                    const fullRangeModified = m.modifiedRange.toInclusiveRange();
                    if (fullRangeModified) {
                        modifiedDecorations.push({ range: fullRangeModified, options: renderIndicators ? diffLineAddDecorationBackgroundWithIndicator : diffLineAddDecorationBackground });
                    }
                    for (const i of m.innerChanges || []) {
                        originalDecorations.push({ range: i.originalRange, options: diffDeleteDecoration });
                        modifiedDecorations.push({ range: i.modifiedRange, options: diffAddDecoration });
                    }
                }
            }
            const activeMovedText = this._diffModel.read(reader).activeMovedText.read(reader);
            for (const m of diff.movedTexts) {
                originalDecorations.push({
                    range: m.lineRangeMapping.original.toInclusiveRange(), options: {
                        description: 'moved',
                        blockClassName: 'movedOriginal' + (m === activeMovedText ? ' currentMove' : ''),
                        blockPadding: [MovedBlocksLinesPart.movedCodeBlockPadding, 0, MovedBlocksLinesPart.movedCodeBlockPadding, MovedBlocksLinesPart.movedCodeBlockPadding],
                    }
                });
                modifiedDecorations.push({
                    range: m.lineRangeMapping.modified.toInclusiveRange(), options: {
                        description: 'moved',
                        blockClassName: 'movedModified' + (m === activeMovedText ? ' currentMove' : ''),
                        blockPadding: [4, 0, 4, 4],
                    }
                });
            }
            return { originalDecorations, modifiedDecorations };
        });
        this._register(applyObservableDecorations(this._editors.original, this._decorations.map(d => (d === null || d === void 0 ? void 0 : d.originalDecorations) || [])));
        this._register(applyObservableDecorations(this._editors.modified, this._decorations.map(d => (d === null || d === void 0 ? void 0 : d.modifiedDecorations) || [])));
    }
}
