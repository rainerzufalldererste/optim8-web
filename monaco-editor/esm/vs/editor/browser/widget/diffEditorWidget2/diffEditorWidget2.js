var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { $, h } from '../../../../base/browser/dom.js';
import { onUnexpectedError } from '../../../../base/common/errors.js';
import { Event } from '../../../../base/common/event.js';
import { autorun, autorunWithStore, derived, derivedWithStore, disposableObservableValue, keepAlive, observableValue, transaction } from '../../../../base/common/observable.js';
import './style.css';
import { EditorExtensionsRegistry } from '../../editorExtensions.js';
import { ICodeEditorService } from '../../services/codeEditorService.js';
import { CodeEditorWidget } from '../codeEditorWidget.js';
import { AccessibleDiffViewer } from './accessibleDiffViewer.js';
import { DiffEditorDecorations } from './diffEditorDecorations.js';
import { DiffEditorSash } from './diffEditorSash.js';
import { ViewZoneManager } from './lineAlignment.js';
import { MovedBlocksLinesPart } from './movedBlocksLines.js';
import { OverviewRulerPart } from './overviewRulerPart.js';
import { UnchangedRangesFeature } from './unchangedRanges.js';
import { ObservableElementSizeObserver, applyStyle, readHotReloadableExport } from './utils.js';
import { WorkerBasedDocumentDiffProvider } from '../workerBasedDocumentDiffProvider.js';
import { EditorType } from '../../../common/editorCommon.js';
import { EditorContextKeys } from '../../../common/editorContextKeys.js';
import { AudioCue, IAudioCueService } from '../../../../platform/audioCues/browser/audioCueService.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IInstantiationService } from '../../../../platform/instantiation/common/instantiation.js';
import { ServiceCollection } from '../../../../platform/instantiation/common/serviceCollection.js';
import './colors.js';
import { DelegatingEditor } from './delegatingEditorImpl.js';
import { DiffEditorEditors } from './diffEditorEditors.js';
import { DiffEditorOptions } from './diffEditorOptions.js';
import { DiffEditorViewModel } from './diffEditorViewModel.js';
import { toDisposable } from '../../../../base/common/lifecycle.js';
import { IEditorProgressService } from '../../../../platform/progress/common/progress.js';
let DiffEditorWidget2 = class DiffEditorWidget2 extends DelegatingEditor {
    constructor(_domElement, options, codeEditorWidgetOptions, _parentContextKeyService, _parentInstantiationService, codeEditorService, _audioCueService, _editorProgressService) {
        var _a;
        super();
        this._domElement = _domElement;
        this._parentContextKeyService = _parentContextKeyService;
        this._parentInstantiationService = _parentInstantiationService;
        this._audioCueService = _audioCueService;
        this._editorProgressService = _editorProgressService;
        this.elements = h('div.monaco-diff-editor.side-by-side', { style: { position: 'relative', height: '100%' } }, [
            h('div.noModificationsOverlay@overlay', { style: { position: 'absolute', height: '100%', visibility: 'hidden', } }, [$('span', {}, 'No Changes')]),
            h('div.editor.original@original', { style: { position: 'absolute', height: '100%' } }),
            h('div.editor.modified@modified', { style: { position: 'absolute', height: '100%' } }),
            h('div.accessibleDiffViewer@accessibleDiffViewer', { style: { position: 'absolute', height: '100%' } }),
        ]);
        this._diffModel = this._register(disposableObservableValue('diffModel', undefined));
        this.onDidChangeModel = Event.fromObservableLight(this._diffModel);
        this._contextKeyService = this._register(this._parentContextKeyService.createScoped(this._domElement));
        this._instantiationService = this._parentInstantiationService.createChild(new ServiceCollection([IContextKeyService, this._contextKeyService]));
        this._boundarySashes = observableValue('boundarySashes', undefined);
        this._accessibleDiffViewerShouldBeVisible = observableValue('accessibleDiffViewerShouldBeVisible', false);
        this._accessibleDiffViewerVisible = derived(reader => 
        /** @description accessibleDiffViewerVisible */ this._options.onlyShowAccessibleDiffViewer.read(reader)
            ? true
            : this._accessibleDiffViewerShouldBeVisible.read(reader));
        this.movedBlocksLinesPart = observableValue('MovedBlocksLinesPart', undefined);
        this._layoutInfo = derived(reader => {
            var _a, _b, _c;
            /** @description modifiedEditorLayoutInfo */
            const width = this._rootSizeObserver.width.read(reader);
            const height = this._rootSizeObserver.height.read(reader);
            const sashLeft = (_a = this._sash.read(reader)) === null || _a === void 0 ? void 0 : _a.sashLeft.read(reader);
            const originalWidth = sashLeft !== null && sashLeft !== void 0 ? sashLeft : Math.max(5, this._editors.original.getLayoutInfo().decorationsLeft);
            const modifiedWidth = width - originalWidth - (this._options.renderOverviewRuler.read(reader) ? OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH : 0);
            const movedBlocksLinesWidth = (_c = (_b = this.movedBlocksLinesPart.read(reader)) === null || _b === void 0 ? void 0 : _b.width.read(reader)) !== null && _c !== void 0 ? _c : 0;
            const originalWidthWithoutMovedBlockLines = originalWidth - movedBlocksLinesWidth;
            this.elements.original.style.width = originalWidthWithoutMovedBlockLines + 'px';
            this.elements.original.style.left = '0px';
            this.elements.modified.style.width = modifiedWidth + 'px';
            this.elements.modified.style.left = originalWidth + 'px';
            this._editors.original.layout({ width: originalWidthWithoutMovedBlockLines, height });
            this._editors.modified.layout({ width: modifiedWidth, height });
            return {
                modifiedEditor: this._editors.modified.getLayoutInfo(),
                originalEditor: this._editors.original.getLayoutInfo(),
            };
        });
        this._diffValue = this._diffModel.map((m, r) => m === null || m === void 0 ? void 0 : m.diff.read(r));
        this.onDidUpdateDiff = Event.fromObservableLight(this._diffValue);
        codeEditorService.willCreateDiffEditor();
        this._contextKeyService.createKey('isInDiffEditor', true);
        this._contextKeyService.createKey('diffEditorVersion', 2);
        this._domElement.appendChild(this.elements.root);
        this._register(toDisposable(() => this._domElement.removeChild(this.elements.root)));
        this._rootSizeObserver = this._register(new ObservableElementSizeObserver(this.elements.root, options.dimension));
        this._rootSizeObserver.setAutomaticLayout((_a = options.automaticLayout) !== null && _a !== void 0 ? _a : false);
        this._options = new DiffEditorOptions(options, this._rootSizeObserver.width);
        this._contextKeyService.createKey(EditorContextKeys.isEmbeddedDiffEditor.key, false);
        const isEmbeddedDiffEditorKey = EditorContextKeys.isEmbeddedDiffEditor.bindTo(this._contextKeyService);
        this._register(autorun(reader => {
            /** @description update isEmbeddedDiffEditorKey */
            isEmbeddedDiffEditorKey.set(this._options.isInEmbeddedEditor.read(reader));
        }));
        const comparingMovedCodeKey = EditorContextKeys.comparingMovedCode.bindTo(this._contextKeyService);
        this._register(autorun(reader => {
            var _a;
            /** @description update comparingMovedCodeKey */
            comparingMovedCodeKey.set(!!((_a = this._diffModel.read(reader)) === null || _a === void 0 ? void 0 : _a.movedTextToCompare.read(reader)));
        }));
        const diffEditorRenderSideBySideInlineBreakpointReachedContextKeyValue = EditorContextKeys.diffEditorRenderSideBySideInlineBreakpointReached.bindTo(this._contextKeyService);
        this._register(autorun(reader => {
            /** @description update accessibleDiffViewerVisible context key */
            diffEditorRenderSideBySideInlineBreakpointReachedContextKeyValue.set(this._options.couldShowInlineViewBecauseOfSize.read(reader));
        }));
        this._editors = this._register(this._instantiationService.createInstance(DiffEditorEditors, this.elements.original, this.elements.modified, this._options, codeEditorWidgetOptions, (i, c, o, o2) => this._createInnerEditor(i, c, o, o2)));
        this._sash = derivedWithStore('sash', (reader, store) => {
            const showSash = this._options.renderSideBySide.read(reader);
            this.elements.root.classList.toggle('side-by-side', showSash);
            if (!showSash) {
                return undefined;
            }
            const result = store.add(new DiffEditorSash(this._options, this.elements.root, {
                height: this._rootSizeObserver.height,
                width: this._rootSizeObserver.width.map((w, reader) => w - (this._options.renderOverviewRuler.read(reader) ? OverviewRulerPart.ENTIRE_DIFF_OVERVIEW_WIDTH : 0)),
            }));
            store.add(autorun(reader => {
                /** @description setBoundarySashes */
                const boundarySashes = this._boundarySashes.read(reader);
                if (boundarySashes) {
                    result.setBoundarySashes(boundarySashes);
                }
            }));
            return result;
        });
        this._register(keepAlive(this._sash, true));
        this._register(autorunWithStore((reader, store) => {
            /** @description UnchangedRangesFeature */
            this.unchangedRangesFeature = store.add(this._instantiationService.createInstance(readHotReloadableExport(UnchangedRangesFeature, reader), this._editors, this._diffModel, this._options));
        }));
        this._register(autorunWithStore((reader, store) => {
            /** @description DiffEditorDecorations */
            store.add(new (readHotReloadableExport(DiffEditorDecorations, reader))(this._editors, this._diffModel, this._options));
        }));
        this._register(autorunWithStore((reader, store) => {
            /** @description ViewZoneManager */
            store.add(this._instantiationService.createInstance(readHotReloadableExport(ViewZoneManager, reader), this._editors, this._diffModel, this._options, this, () => this.unchangedRangesFeature.isUpdatingViewZones));
        }));
        this._register(autorunWithStore((reader, store) => {
            /** @description OverviewRulerPart */
            store.add(this._instantiationService.createInstance(readHotReloadableExport(OverviewRulerPart, reader), this._editors, this.elements.root, this._diffModel, this._rootSizeObserver.width, this._rootSizeObserver.height, this._layoutInfo.map(i => i.modifiedEditor), this._options));
        }));
        this._register(autorunWithStore((reader, store) => {
            /** @description _accessibleDiffViewer */
            this._accessibleDiffViewer = store.add(this._register(this._instantiationService.createInstance(readHotReloadableExport(AccessibleDiffViewer, reader), this.elements.accessibleDiffViewer, this._accessibleDiffViewerVisible, (visible, tx) => this._accessibleDiffViewerShouldBeVisible.set(visible, tx), this._options.onlyShowAccessibleDiffViewer.map(v => !v), this._rootSizeObserver.width, this._rootSizeObserver.height, this._diffModel.map((m, r) => { var _a; return (_a = m === null || m === void 0 ? void 0 : m.diff.read(r)) === null || _a === void 0 ? void 0 : _a.mappings.map(m => m.lineRangeMapping); }), this._editors)));
        }));
        const visibility = this._accessibleDiffViewerVisible.map(v => v ? 'hidden' : 'visible');
        this._register(applyStyle(this.elements.modified, { visibility }));
        this._register(applyStyle(this.elements.original, { visibility }));
        this._createDiffEditorContributions();
        codeEditorService.addDiffEditor(this);
        this._register(keepAlive(this._layoutInfo, true));
        this._register(autorunWithStore((reader, store) => {
            this.movedBlocksLinesPart.set(store.add(new (readHotReloadableExport(MovedBlocksLinesPart, reader))(this.elements.root, this._diffModel, this._layoutInfo.map(i => i.originalEditor), this._layoutInfo.map(i => i.modifiedEditor), this._editors)), undefined);
        }));
        this._register(applyStyle(this.elements.overlay, {
            width: this._layoutInfo.map((i, r) => i.originalEditor.width + (this._options.renderSideBySide.read(r) ? 0 : i.modifiedEditor.width)),
            visibility: derived(reader => /** @description visibility */ {
                var _a, _b;
                return (this._options.hideUnchangedRegions.read(reader) && ((_b = (_a = this._diffModel.read(reader)) === null || _a === void 0 ? void 0 : _a.diff.read(reader)) === null || _b === void 0 ? void 0 : _b.mappings.length) === 0)
                    ? 'visible' : 'hidden';
            }),
        }));
        // Revert change when an arrow is clicked.
        this._register(this._editors.modified.onMouseDown(event => {
            var _a, _b;
            if (!event.event.rightButton && event.target.position && ((_a = event.target.element) === null || _a === void 0 ? void 0 : _a.className.includes('arrow-revert-change'))) {
                const lineNumber = event.target.position.lineNumber;
                const viewZone = event.target;
                const model = this._diffModel.get();
                if (!model) {
                    return;
                }
                const diffs = (_b = model.diff.get()) === null || _b === void 0 ? void 0 : _b.mappings;
                if (!diffs) {
                    return;
                }
                const diff = diffs.find(d => (viewZone === null || viewZone === void 0 ? void 0 : viewZone.detail.afterLineNumber) === d.lineRangeMapping.modifiedRange.startLineNumber - 1 ||
                    d.lineRangeMapping.modifiedRange.startLineNumber === lineNumber);
                if (!diff) {
                    return;
                }
                this.revert(diff.lineRangeMapping);
                event.event.stopPropagation();
            }
        }));
        this._register(Event.runAndSubscribe(this._editors.modified.onDidChangeCursorPosition, (e) => {
            var _a, _b;
            if ((e === null || e === void 0 ? void 0 : e.reason) === 3 /* CursorChangeReason.Explicit */) {
                const diff = (_b = (_a = this._diffModel.get()) === null || _a === void 0 ? void 0 : _a.diff.get()) === null || _b === void 0 ? void 0 : _b.mappings.find(m => m.lineRangeMapping.modifiedRange.contains(e.position.lineNumber));
                if (diff === null || diff === void 0 ? void 0 : diff.lineRangeMapping.modifiedRange.isEmpty) {
                    this._audioCueService.playAudioCue(AudioCue.diffLineDeleted, { source: 'diffEditor.cursorPositionChanged' });
                }
                else if (diff === null || diff === void 0 ? void 0 : diff.lineRangeMapping.originalRange.isEmpty) {
                    this._audioCueService.playAudioCue(AudioCue.diffLineInserted, { source: 'diffEditor.cursorPositionChanged' });
                }
                else if (diff) {
                    this._audioCueService.playAudioCue(AudioCue.diffLineModified, { source: 'diffEditor.cursorPositionChanged' });
                }
            }
        }));
        const isDiffUpToDate = this._diffModel.map((m, reader) => m === null || m === void 0 ? void 0 : m.isDiffUpToDate.read(reader));
        this._register(autorunWithStore((reader, store) => {
            if (isDiffUpToDate.read(reader) === false) {
                const r = this._editorProgressService.show(true, 1000);
                store.add(toDisposable(() => r.done()));
            }
        }));
    }
    _createInnerEditor(instantiationService, container, options, editorWidgetOptions) {
        const editor = instantiationService.createInstance(CodeEditorWidget, container, options, editorWidgetOptions);
        return editor;
    }
    _createDiffEditorContributions() {
        const contributions = EditorExtensionsRegistry.getDiffEditorContributions();
        for (const desc of contributions) {
            try {
                this._register(this._instantiationService.createInstance(desc.ctor, this));
            }
            catch (err) {
                onUnexpectedError(err);
            }
        }
    }
    get _targetEditor() { return this._editors.modified; }
    getEditorType() { return EditorType.IDiffEditor; }
    layout(dimension) { this._rootSizeObserver.observe(dimension); }
    hasTextFocus() { return this._editors.original.hasTextFocus() || this._editors.modified.hasTextFocus(); }
    saveViewState() {
        var _a;
        const originalViewState = this._editors.original.saveViewState();
        const modifiedViewState = this._editors.modified.saveViewState();
        return {
            original: originalViewState,
            modified: modifiedViewState,
            modelState: (_a = this._diffModel.get()) === null || _a === void 0 ? void 0 : _a.serializeState(),
        };
    }
    restoreViewState(s) {
        var _a;
        if (s && s.original && s.modified) {
            const diffEditorState = s;
            this._editors.original.restoreViewState(diffEditorState.original);
            this._editors.modified.restoreViewState(diffEditorState.modified);
            if (diffEditorState.modelState) {
                (_a = this._diffModel.get()) === null || _a === void 0 ? void 0 : _a.restoreSerializedState(diffEditorState.modelState);
            }
        }
    }
    createViewModel(model) {
        return new DiffEditorViewModel(model, this._options, 
        // TODO@hediet make diffAlgorithm observable
        this._instantiationService.createInstance(WorkerBasedDocumentDiffProvider, { diffAlgorithm: this._options.diffAlgorithm.get() }));
    }
    getModel() { var _a, _b; return (_b = (_a = this._diffModel.get()) === null || _a === void 0 ? void 0 : _a.model) !== null && _b !== void 0 ? _b : null; }
    setModel(model) {
        if (!model && this._diffModel.get()) {
            // Transitioning from a model to no-model
            this._accessibleDiffViewer.close();
        }
        const vm = model ? ('model' in model) ? model : this.createViewModel(model) : undefined;
        this._editors.original.setModel(vm ? vm.model.original : null);
        this._editors.modified.setModel(vm ? vm.model.modified : null);
        transaction(tx => {
            this._diffModel.set(vm, tx);
        });
    }
    /**
     * @param changedOptions Only has values for top-level options that have actually changed.
     */
    updateOptions(changedOptions) {
        this._options.updateOptions(changedOptions);
    }
    getContainerDomNode() { return this._domElement; }
    getOriginalEditor() { return this._editors.original; }
    getModifiedEditor() { return this._editors.modified; }
    /**
     * @deprecated Use `this.getDiffComputationResult().changes2` instead.
     */
    getLineChanges() {
        var _a;
        const diffState = (_a = this._diffModel.get()) === null || _a === void 0 ? void 0 : _a.diff.get();
        if (!diffState) {
            return null;
        }
        return toLineChanges(diffState);
    }
    revert(diff) {
        var _a;
        const model = (_a = this._diffModel.get()) === null || _a === void 0 ? void 0 : _a.model;
        if (!model) {
            return;
        }
        const changes = diff.innerChanges
            ? diff.innerChanges.map(c => ({
                range: c.modifiedRange,
                text: model.original.getValueInRange(c.originalRange)
            }))
            : [
                {
                    range: diff.modifiedRange.toExclusiveRange(),
                    text: model.original.getValueInRange(diff.originalRange.toExclusiveRange())
                }
            ];
        this._editors.modified.executeEdits('diffEditor', changes);
    }
    accessibleDiffViewerNext() { this._accessibleDiffViewer.next(); }
    accessibleDiffViewerPrev() { this._accessibleDiffViewer.prev(); }
};
DiffEditorWidget2 = __decorate([
    __param(3, IContextKeyService),
    __param(4, IInstantiationService),
    __param(5, ICodeEditorService),
    __param(6, IAudioCueService),
    __param(7, IEditorProgressService)
], DiffEditorWidget2);
export { DiffEditorWidget2 };
function toLineChanges(state) {
    return state.mappings.map(x => {
        const m = x.lineRangeMapping;
        let originalStartLineNumber;
        let originalEndLineNumber;
        let modifiedStartLineNumber;
        let modifiedEndLineNumber;
        let innerChanges = m.innerChanges;
        if (m.originalRange.isEmpty) {
            // Insertion
            originalStartLineNumber = m.originalRange.startLineNumber - 1;
            originalEndLineNumber = 0;
            innerChanges = undefined;
        }
        else {
            originalStartLineNumber = m.originalRange.startLineNumber;
            originalEndLineNumber = m.originalRange.endLineNumberExclusive - 1;
        }
        if (m.modifiedRange.isEmpty) {
            // Deletion
            modifiedStartLineNumber = m.modifiedRange.startLineNumber - 1;
            modifiedEndLineNumber = 0;
            innerChanges = undefined;
        }
        else {
            modifiedStartLineNumber = m.modifiedRange.startLineNumber;
            modifiedEndLineNumber = m.modifiedRange.endLineNumberExclusive - 1;
        }
        return {
            originalStartLineNumber,
            originalEndLineNumber,
            modifiedStartLineNumber,
            modifiedEndLineNumber,
            charChanges: innerChanges === null || innerChanges === void 0 ? void 0 : innerChanges.map(m => ({
                originalStartLineNumber: m.originalRange.startLineNumber,
                originalStartColumn: m.originalRange.startColumn,
                originalEndLineNumber: m.originalRange.endLineNumber,
                originalEndColumn: m.originalRange.endColumn,
                modifiedStartLineNumber: m.modifiedRange.startLineNumber,
                modifiedStartColumn: m.modifiedRange.startColumn,
                modifiedEndLineNumber: m.modifiedRange.endLineNumber,
                modifiedEndColumn: m.modifiedRange.endColumn,
            }))
        };
    });
}
