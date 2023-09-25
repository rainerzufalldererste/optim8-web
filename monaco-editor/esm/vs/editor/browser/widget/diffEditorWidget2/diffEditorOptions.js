/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { derived, observableValue } from '../../../../base/common/observable.js';
import { diffEditorDefaultOptions } from '../../../common/config/diffEditor.js';
import { clampedFloat, clampedInt, boolean as validateBooleanOption, stringSet as validateStringSetOption } from '../../../common/config/editorOptions.js';
export class DiffEditorOptions {
    get editorOptions() { return this._options; }
    constructor(options, diffEditorWidth) {
        this.diffEditorWidth = diffEditorWidth;
        this.couldShowInlineViewBecauseOfSize = derived(reader => /** @description couldShowInlineViewBecauseOfSize */ this._options.read(reader).renderSideBySide && this.diffEditorWidth.read(reader) <= this._options.read(reader).renderSideBySideInlineBreakpoint);
        this.renderOverviewRuler = derived(reader => /** @description renderOverviewRuler */ this._options.read(reader).renderOverviewRuler);
        this.renderSideBySide = derived(reader => /** @description renderSideBySide */ this._options.read(reader).renderSideBySide
            && !(this._options.read(reader).useInlineViewWhenSpaceIsLimited && this.couldShowInlineViewBecauseOfSize.read(reader)));
        this.readOnly = derived(reader => /** @description readOnly */ this._options.read(reader).readOnly);
        this.shouldRenderRevertArrows = derived(reader => {
            /** @description shouldRenderRevertArrows */
            if (!this._options.read(reader).renderMarginRevertIcon) {
                return false;
            }
            if (!this.renderSideBySide.read(reader)) {
                return false;
            }
            if (this.readOnly.read(reader)) {
                return false;
            }
            return true;
        });
        this.renderIndicators = derived(reader => /** @description renderIndicators */ this._options.read(reader).renderIndicators);
        this.enableSplitViewResizing = derived(reader => /** @description enableSplitViewResizing */ this._options.read(reader).enableSplitViewResizing);
        this.splitViewDefaultRatio = derived(reader => /** @description splitViewDefaultRatio */ this._options.read(reader).splitViewDefaultRatio);
        this.ignoreTrimWhitespace = derived(reader => /** @description ignoreTrimWhitespace */ this._options.read(reader).ignoreTrimWhitespace);
        this.maxComputationTimeMs = derived(reader => /** @description maxComputationTime */ this._options.read(reader).maxComputationTime);
        this.showMoves = derived(reader => /** @description showMoves */ this._options.read(reader).experimental.showMoves && this.renderSideBySide.read(reader));
        this.isInEmbeddedEditor = derived(reader => /** @description isInEmbeddedEditor */ this._options.read(reader).isInEmbeddedEditor);
        this.diffWordWrap = derived(reader => /** @description diffWordWrap */ this._options.read(reader).diffWordWrap);
        this.originalEditable = derived(reader => /** @description originalEditable */ this._options.read(reader).originalEditable);
        this.diffCodeLens = derived(reader => /** @description diffCodeLens */ this._options.read(reader).diffCodeLens);
        this.accessibilityVerbose = derived(reader => /** @description accessibilityVerbose */ this._options.read(reader).accessibilityVerbose);
        this.diffAlgorithm = derived(reader => /** @description diffAlgorithm */ this._options.read(reader).diffAlgorithm);
        this.showEmptyDecorations = derived(reader => /** @description showEmptyDecorations */ this._options.read(reader).experimental.showEmptyDecorations);
        this.onlyShowAccessibleDiffViewer = derived(reader => /** @description onlyShowAccessibleDiffViewer */ this._options.read(reader).onlyShowAccessibleDiffViewer);
        this.hideUnchangedRegions = derived(reader => /** @description hideUnchangedRegions */ this._options.read(reader).hideUnchangedRegions.enabled);
        this.hideUnchangedRegionsRevealLineCount = derived(reader => /** @description hideUnchangedRegions */ this._options.read(reader).hideUnchangedRegions.revealLineCount);
        this.hideUnchangedRegionsContextLineCount = derived(reader => /** @description hideUnchangedRegions */ this._options.read(reader).hideUnchangedRegions.contextLineCount);
        this.hideUnchangedRegionsminimumLineCount = derived(reader => /** @description hideUnchangedRegions */ this._options.read(reader).hideUnchangedRegions.minimumLineCount);
        const optionsCopy = Object.assign(Object.assign({}, options), validateDiffEditorOptions(options, diffEditorDefaultOptions));
        this._options = observableValue('options', optionsCopy);
    }
    updateOptions(changedOptions) {
        const newDiffEditorOptions = validateDiffEditorOptions(changedOptions, this._options.get());
        const newOptions = Object.assign(Object.assign(Object.assign({}, this._options.get()), changedOptions), newDiffEditorOptions);
        this._options.set(newOptions, undefined, { changedOptions: changedOptions });
    }
}
function validateDiffEditorOptions(options, defaults) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    return {
        enableSplitViewResizing: validateBooleanOption(options.enableSplitViewResizing, defaults.enableSplitViewResizing),
        splitViewDefaultRatio: clampedFloat(options.splitViewDefaultRatio, 0.5, 0.1, 0.9),
        renderSideBySide: validateBooleanOption(options.renderSideBySide, defaults.renderSideBySide),
        renderMarginRevertIcon: validateBooleanOption(options.renderMarginRevertIcon, defaults.renderMarginRevertIcon),
        maxComputationTime: clampedInt(options.maxComputationTime, defaults.maxComputationTime, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
        maxFileSize: clampedInt(options.maxFileSize, defaults.maxFileSize, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
        ignoreTrimWhitespace: validateBooleanOption(options.ignoreTrimWhitespace, defaults.ignoreTrimWhitespace),
        renderIndicators: validateBooleanOption(options.renderIndicators, defaults.renderIndicators),
        originalEditable: validateBooleanOption(options.originalEditable, defaults.originalEditable),
        diffCodeLens: validateBooleanOption(options.diffCodeLens, defaults.diffCodeLens),
        renderOverviewRuler: validateBooleanOption(options.renderOverviewRuler, defaults.renderOverviewRuler),
        diffWordWrap: validateStringSetOption(options.diffWordWrap, defaults.diffWordWrap, ['off', 'on', 'inherit']),
        diffAlgorithm: validateStringSetOption(options.diffAlgorithm, defaults.diffAlgorithm, ['legacy', 'advanced'], { 'smart': 'legacy', 'experimental': 'advanced' }),
        accessibilityVerbose: validateBooleanOption(options.accessibilityVerbose, defaults.accessibilityVerbose),
        experimental: {
            showMoves: validateBooleanOption((_a = options.experimental) === null || _a === void 0 ? void 0 : _a.showMoves, defaults.experimental.showMoves),
            showEmptyDecorations: validateBooleanOption((_b = options.experimental) === null || _b === void 0 ? void 0 : _b.showEmptyDecorations, defaults.experimental.showEmptyDecorations),
        },
        hideUnchangedRegions: {
            enabled: validateBooleanOption((_d = (_c = options.hideUnchangedRegions) === null || _c === void 0 ? void 0 : _c.enabled) !== null && _d !== void 0 ? _d : (_e = options.experimental) === null || _e === void 0 ? void 0 : _e.collapseUnchangedRegions, defaults.hideUnchangedRegions.enabled),
            contextLineCount: clampedInt((_f = options.hideUnchangedRegions) === null || _f === void 0 ? void 0 : _f.contextLineCount, defaults.hideUnchangedRegions.contextLineCount, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
            minimumLineCount: clampedInt((_g = options.hideUnchangedRegions) === null || _g === void 0 ? void 0 : _g.minimumLineCount, defaults.hideUnchangedRegions.minimumLineCount, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
            revealLineCount: clampedInt((_h = options.hideUnchangedRegions) === null || _h === void 0 ? void 0 : _h.revealLineCount, defaults.hideUnchangedRegions.revealLineCount, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
        },
        isInEmbeddedEditor: validateBooleanOption(options.isInEmbeddedEditor, defaults.isInEmbeddedEditor),
        onlyShowAccessibleDiffViewer: validateBooleanOption(options.onlyShowAccessibleDiffViewer, defaults.onlyShowAccessibleDiffViewer),
        renderSideBySideInlineBreakpoint: clampedInt(options.renderSideBySideInlineBreakpoint, defaults.renderSideBySideInlineBreakpoint, 0, 1073741824 /* Constants.MAX_SAFE_SMALL_INTEGER */),
        useInlineViewWhenSpaceIsLimited: validateBooleanOption(options.useInlineViewWhenSpaceIsLimited, defaults.useInlineViewWhenSpaceIsLimited),
    };
}
