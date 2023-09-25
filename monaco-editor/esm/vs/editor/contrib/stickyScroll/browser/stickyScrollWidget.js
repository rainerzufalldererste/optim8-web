/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as dom from '../../../../base/browser/dom.js';
import { createTrustedTypesPolicy } from '../../../../base/browser/trustedTypes.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import './stickyScroll.css';
import { getColumnOfNodeOffset } from '../../../browser/viewParts/lines/viewLine.js';
import { EmbeddedCodeEditorWidget } from '../../../browser/widget/embeddedCodeEditorWidget.js';
import { Position } from '../../../common/core/position.js';
import { StringBuilder } from '../../../common/core/stringBuilder.js';
import { LineDecoration } from '../../../common/viewLayout/lineDecorations.js';
import { RenderLineInput, renderViewLine } from '../../../common/viewLayout/viewLineRenderer.js';
import { FoldingController } from '../../folding/browser/folding.js';
import { foldingCollapsedIcon, foldingExpandedIcon } from '../../folding/browser/foldingDecorations.js';
import { toggleCollapseState } from '../../folding/browser/foldingModel.js';
export class StickyScrollWidgetState {
    constructor(startLineNumbers, endLineNumbers, lastLineRelativePosition, showEndForLine = null) {
        this.startLineNumbers = startLineNumbers;
        this.endLineNumbers = endLineNumbers;
        this.lastLineRelativePosition = lastLineRelativePosition;
        this.showEndForLine = showEndForLine;
    }
}
const _ttPolicy = createTrustedTypesPolicy('stickyScrollViewLayer', { createHTML: value => value });
const STICKY_LINE_INDEX_ATTR = 'data-sticky-line-index';
export class StickyScrollWidget extends Disposable {
    constructor(_editor) {
        super();
        this._editor = _editor;
        this._foldingIconStore = new DisposableStore();
        this._rootDomNode = document.createElement('div');
        this._lineNumbersDomNode = document.createElement('div');
        this._linesDomNodeScrollable = document.createElement('div');
        this._linesDomNode = document.createElement('div');
        this._lineHeight = this._editor.getOption(65 /* EditorOption.lineHeight */);
        this._stickyLines = [];
        this._lineNumbers = [];
        this._lastLineRelativePosition = 0;
        this._minContentWidthInPx = 0;
        this._isOnGlyphMargin = false;
        this._lineNumbersDomNode.className = 'sticky-widget-line-numbers';
        this._lineNumbersDomNode.setAttribute('role', 'none');
        this._linesDomNode.className = 'sticky-widget-lines';
        this._linesDomNode.setAttribute('role', 'list');
        this._linesDomNodeScrollable.className = 'sticky-widget-lines-scrollable';
        this._linesDomNodeScrollable.appendChild(this._linesDomNode);
        this._rootDomNode.className = 'sticky-widget';
        this._rootDomNode.classList.toggle('peek', _editor instanceof EmbeddedCodeEditorWidget);
        this._rootDomNode.appendChild(this._lineNumbersDomNode);
        this._rootDomNode.appendChild(this._linesDomNodeScrollable);
        const updateScrollLeftPosition = () => {
            this._linesDomNode.style.left = this._editor.getOption(113 /* EditorOption.stickyScroll */).scrollWithEditor ? `-${this._editor.getScrollLeft()}px` : '0px';
        };
        this._register(this._editor.onDidChangeConfiguration((e) => {
            if (e.hasChanged(113 /* EditorOption.stickyScroll */)) {
                updateScrollLeftPosition();
            }
            if (e.hasChanged(65 /* EditorOption.lineHeight */)) {
                this._lineHeight = this._editor.getOption(65 /* EditorOption.lineHeight */);
            }
        }));
        this._register(this._editor.onDidScrollChange((e) => {
            if (e.scrollLeftChanged) {
                updateScrollLeftPosition();
            }
            if (e.scrollWidthChanged) {
                this._updateWidgetWidth();
            }
        }));
        this._register(this._editor.onDidChangeModel(() => {
            updateScrollLeftPosition();
            this._updateWidgetWidth();
        }));
        this._register(this._foldingIconStore);
        updateScrollLeftPosition();
        this._register(this._editor.onDidLayoutChange((e) => {
            this._updateWidgetWidth();
        }));
        this._updateWidgetWidth();
    }
    get lineNumbers() {
        return this._lineNumbers;
    }
    get lineNumberCount() {
        return this._lineNumbers.length;
    }
    getCurrentLines() {
        return this._lineNumbers;
    }
    setState(state) {
        this._clearStickyWidget();
        if (!state || !this._editor._getViewModel()) {
            return;
        }
        const futureWidgetHeight = state.startLineNumbers.length * this._lineHeight + state.lastLineRelativePosition;
        if (futureWidgetHeight > 0) {
            this._lastLineRelativePosition = state.lastLineRelativePosition;
            const lineNumbers = [...state.startLineNumbers];
            if (state.showEndForLine !== null) {
                lineNumbers[state.showEndForLine] = state.endLineNumbers[state.showEndForLine];
            }
            this._lineNumbers = lineNumbers;
        }
        else {
            this._lastLineRelativePosition = 0;
            this._lineNumbers = [];
        }
        this._renderRootNode();
    }
    _updateWidgetWidth() {
        const layoutInfo = this._editor.getLayoutInfo();
        const minimapSide = this._editor.getOption(71 /* EditorOption.minimap */).side;
        const lineNumbersWidth = minimapSide === 'left' ? layoutInfo.contentLeft - layoutInfo.minimap.minimapCanvasOuterWidth : layoutInfo.contentLeft;
        this._lineNumbersDomNode.style.width = `${lineNumbersWidth}px`;
        this._linesDomNodeScrollable.style.setProperty('--vscode-editorStickyScroll-scrollableWidth', `${this._editor.getScrollWidth() - layoutInfo.verticalScrollbarWidth}px`);
        this._rootDomNode.style.width = `${layoutInfo.width - layoutInfo.minimap.minimapCanvasOuterWidth - layoutInfo.verticalScrollbarWidth}px`;
    }
    _clearStickyWidget() {
        this._stickyLines = [];
        this._foldingIconStore.clear();
        dom.clearNode(this._lineNumbersDomNode);
        dom.clearNode(this._linesDomNode);
        this._rootDomNode.style.display = 'none';
    }
    _useFoldingOpacityTransition(requireTransitions) {
        this._lineNumbersDomNode.style.setProperty('--vscode-editorStickyScroll-foldingOpacityTransition', `opacity ${requireTransitions ? 0.5 : 0}s`);
    }
    _setFoldingIconsVisibility(allVisible) {
        for (const line of this._stickyLines) {
            const foldingIcon = line.foldingIcon;
            if (!foldingIcon) {
                continue;
            }
            foldingIcon.setVisible(allVisible ? true : foldingIcon.isCollapsed);
        }
    }
    _renderRootNode() {
        var _a;
        return __awaiter(this, void 0, void 0, function* () {
            const foldingModel = yield ((_a = FoldingController.get(this._editor)) === null || _a === void 0 ? void 0 : _a.getFoldingModel());
            const layoutInfo = this._editor.getLayoutInfo();
            for (const [index, line] of this._lineNumbers.entries()) {
                const renderedStickyLine = this._renderChildNode(index, line, layoutInfo, foldingModel);
                this._linesDomNode.appendChild(renderedStickyLine.lineDomNode);
                this._lineNumbersDomNode.appendChild(renderedStickyLine.lineNumberDomNode);
                this._stickyLines.push(renderedStickyLine);
            }
            if (foldingModel) {
                this._setFoldingHoverListeners();
                this._useFoldingOpacityTransition(!this._isOnGlyphMargin);
            }
            const widgetHeight = this._lineNumbers.length * this._lineHeight + this._lastLineRelativePosition;
            if (widgetHeight === 0) {
                this._clearStickyWidget();
                return;
            }
            this._rootDomNode.style.display = 'block';
            this._lineNumbersDomNode.style.height = `${widgetHeight}px`;
            this._linesDomNodeScrollable.style.height = `${widgetHeight}px`;
            this._rootDomNode.style.height = `${widgetHeight}px`;
            const minimapSide = this._editor.getOption(71 /* EditorOption.minimap */).side;
            if (minimapSide === 'left') {
                this._rootDomNode.style.marginLeft = layoutInfo.minimap.minimapCanvasOuterWidth + 'px';
            }
            else {
                this._rootDomNode.style.marginLeft = '0px';
            }
            this._updateMinContentWidth();
            this._editor.layoutOverlayWidget(this);
        });
    }
    _setFoldingHoverListeners() {
        const showFoldingControls = this._editor.getOption(108 /* EditorOption.showFoldingControls */);
        if (showFoldingControls !== 'mouseover') {
            return;
        }
        this._foldingIconStore.add(dom.addDisposableListener(this._lineNumbersDomNode, dom.EventType.MOUSE_ENTER, (e) => {
            this._isOnGlyphMargin = true;
            this._setFoldingIconsVisibility(true);
        }));
        this._foldingIconStore.add(dom.addDisposableListener(this._lineNumbersDomNode, dom.EventType.MOUSE_LEAVE, () => {
            this._isOnGlyphMargin = false;
            this._useFoldingOpacityTransition(true);
            this._setFoldingIconsVisibility(false);
        }));
    }
    _renderChildNode(index, line, layoutInfo, foldingModel) {
        const viewModel = this._editor._getViewModel();
        const viewLineNumber = viewModel.coordinatesConverter.convertModelPositionToViewPosition(new Position(line, 1)).lineNumber;
        const lineRenderingData = viewModel.getViewLineRenderingData(viewLineNumber);
        const minimapSide = this._editor.getOption(71 /* EditorOption.minimap */).side;
        const lineNumberOption = this._editor.getOption(66 /* EditorOption.lineNumbers */);
        let actualInlineDecorations;
        try {
            actualInlineDecorations = LineDecoration.filter(lineRenderingData.inlineDecorations, viewLineNumber, lineRenderingData.minColumn, lineRenderingData.maxColumn);
        }
        catch (err) {
            actualInlineDecorations = [];
        }
        const renderLineInput = new RenderLineInput(true, true, lineRenderingData.content, lineRenderingData.continuesWithWrappedLine, lineRenderingData.isBasicASCII, lineRenderingData.containsRTL, 0, lineRenderingData.tokens, actualInlineDecorations, lineRenderingData.tabSize, lineRenderingData.startVisibleColumn, 1, 1, 1, 500, 'none', true, true, null);
        const sb = new StringBuilder(2000);
        const renderOutput = renderViewLine(renderLineInput, sb);
        let newLine;
        if (_ttPolicy) {
            newLine = _ttPolicy.createHTML(sb.build());
        }
        else {
            newLine = sb.build();
        }
        const lineHTMLNode = document.createElement('span');
        lineHTMLNode.className = 'sticky-line-content';
        lineHTMLNode.classList.add(`stickyLine${line}`);
        lineHTMLNode.style.lineHeight = `${this._lineHeight}px`;
        lineHTMLNode.innerHTML = newLine;
        const lineNumberHTMLNode = document.createElement('span');
        lineNumberHTMLNode.className = 'sticky-line-number';
        lineNumberHTMLNode.style.lineHeight = `${this._lineHeight}px`;
        const lineNumbersWidth = minimapSide === 'left' ? layoutInfo.contentLeft - layoutInfo.minimap.minimapCanvasOuterWidth : layoutInfo.contentLeft;
        lineNumberHTMLNode.style.width = `${lineNumbersWidth}px`;
        const innerLineNumberHTML = document.createElement('span');
        if (lineNumberOption.renderType === 1 /* RenderLineNumbersType.On */ || lineNumberOption.renderType === 3 /* RenderLineNumbersType.Interval */ && line % 10 === 0) {
            innerLineNumberHTML.innerText = line.toString();
        }
        else if (lineNumberOption.renderType === 2 /* RenderLineNumbersType.Relative */) {
            innerLineNumberHTML.innerText = Math.abs(line - this._editor.getPosition().lineNumber).toString();
        }
        innerLineNumberHTML.className = 'sticky-line-number-inner';
        innerLineNumberHTML.style.lineHeight = `${this._lineHeight}px`;
        innerLineNumberHTML.style.width = `${layoutInfo.lineNumbersWidth}px`;
        innerLineNumberHTML.style.float = 'left';
        if (minimapSide === 'left') {
            innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft - layoutInfo.minimap.minimapCanvasOuterWidth}px`;
        }
        else if (minimapSide === 'right') {
            innerLineNumberHTML.style.paddingLeft = `${layoutInfo.lineNumbersLeft}px`;
        }
        lineNumberHTMLNode.appendChild(innerLineNumberHTML);
        const foldingIcon = this._renderFoldingIconForLine(lineNumberHTMLNode, foldingModel, index, line);
        this._editor.applyFontInfo(lineHTMLNode);
        this._editor.applyFontInfo(innerLineNumberHTML);
        lineHTMLNode.setAttribute('role', 'listitem');
        lineHTMLNode.setAttribute(STICKY_LINE_INDEX_ATTR, String(index));
        lineHTMLNode.tabIndex = 0;
        lineNumberHTMLNode.style.lineHeight = `${this._lineHeight}px`;
        lineHTMLNode.style.lineHeight = `${this._lineHeight}px`;
        lineNumberHTMLNode.style.height = `${this._lineHeight}px`;
        lineHTMLNode.style.height = `${this._lineHeight}px`;
        // Special case for the last line of sticky scroll
        const isLastLine = index === this._lineNumbers.length - 1;
        const lastLineZIndex = '0';
        const intermediateLineZIndex = '1';
        lineHTMLNode.style.zIndex = isLastLine ? lastLineZIndex : intermediateLineZIndex;
        lineNumberHTMLNode.style.zIndex = isLastLine ? lastLineZIndex : intermediateLineZIndex;
        const lastLineTop = `${index * this._lineHeight + this._lastLineRelativePosition + ((foldingIcon === null || foldingIcon === void 0 ? void 0 : foldingIcon.isCollapsed) ? 1 : 0)}px`;
        const intermediateLineTop = `${index * this._lineHeight}px`;
        lineHTMLNode.style.top = isLastLine ? lastLineTop : intermediateLineTop;
        lineNumberHTMLNode.style.top = isLastLine ? lastLineTop : intermediateLineTop;
        return new RenderedStickyLine(line, lineHTMLNode, lineNumberHTMLNode, foldingIcon, renderOutput.characterMapping);
    }
    _renderFoldingIconForLine(container, foldingModel, index, line) {
        const showFoldingControls = this._editor.getOption(108 /* EditorOption.showFoldingControls */);
        if (!foldingModel || showFoldingControls === 'never') {
            return;
        }
        const foldingRegions = foldingModel.regions;
        const indexOfFoldingRegion = foldingRegions.findRange(line);
        const startLineNumber = foldingRegions.getStartLineNumber(indexOfFoldingRegion);
        const isFoldingScope = line === startLineNumber;
        if (!isFoldingScope) {
            return;
        }
        const isCollapsed = foldingRegions.isCollapsed(indexOfFoldingRegion);
        const foldingIcon = new StickyFoldingIcon(isCollapsed, this._lineHeight);
        container.append(foldingIcon.domNode);
        foldingIcon.setVisible(this._isOnGlyphMargin ? true : (isCollapsed || showFoldingControls === 'always'));
        this._foldingIconStore.add(dom.addDisposableListener(foldingIcon.domNode, dom.EventType.CLICK, () => {
            toggleCollapseState(foldingModel, Number.MAX_VALUE, [line]);
            foldingIcon.isCollapsed = !isCollapsed;
            const scrollTop = (isCollapsed ?
                this._editor.getTopForLineNumber(startLineNumber)
                : this._editor.getTopForLineNumber(foldingRegions.getEndLineNumber(indexOfFoldingRegion)))
                - this._lineHeight * index + 1;
            this._editor.setScrollTop(scrollTop);
        }));
        return foldingIcon;
    }
    _updateMinContentWidth() {
        this._minContentWidthInPx = 0;
        for (const stickyLine of this._stickyLines) {
            if (stickyLine.lineDomNode.scrollWidth > this._minContentWidthInPx) {
                this._minContentWidthInPx = stickyLine.lineDomNode.scrollWidth;
            }
        }
        this._minContentWidthInPx += this._editor.getLayoutInfo().verticalScrollbarWidth;
    }
    getId() {
        return 'editor.contrib.stickyScrollWidget';
    }
    getDomNode() {
        return this._rootDomNode;
    }
    getPosition() {
        return {
            preference: null
        };
    }
    getMinContentWidthInPx() {
        return this._minContentWidthInPx;
    }
    focusLineWithIndex(index) {
        if (0 <= index && index < this._stickyLines.length) {
            this._stickyLines[index].lineDomNode.focus();
        }
    }
    /**
     * Given a leaf dom node, tries to find the editor position.
     */
    getEditorPositionFromNode(spanDomNode) {
        if (!spanDomNode || spanDomNode.children.length > 0) {
            // This is not a leaf node
            return null;
        }
        const renderedStickyLine = this._getRenderedStickyLineFromChildDomNode(spanDomNode);
        if (!renderedStickyLine) {
            return null;
        }
        const column = getColumnOfNodeOffset(renderedStickyLine.characterMapping, spanDomNode, 0);
        return new Position(renderedStickyLine.lineNumber, column);
    }
    getLineNumberFromChildDomNode(domNode) {
        var _a, _b;
        return (_b = (_a = this._getRenderedStickyLineFromChildDomNode(domNode)) === null || _a === void 0 ? void 0 : _a.lineNumber) !== null && _b !== void 0 ? _b : null;
    }
    _getRenderedStickyLineFromChildDomNode(domNode) {
        const index = this.getStickyLineIndexFromChildDomNode(domNode);
        if (index === null || index < 0 || index >= this._stickyLines.length) {
            return null;
        }
        return this._stickyLines[index];
    }
    /**
     * Given a child dom node, tries to find the line number attribute
     * that was stored in the node. Returns null if none is found.
     */
    getStickyLineIndexFromChildDomNode(domNode) {
        while (domNode && domNode !== this._rootDomNode) {
            const line = domNode.getAttribute(STICKY_LINE_INDEX_ATTR);
            if (line) {
                return parseInt(line, 10);
            }
            domNode = domNode.parentElement;
        }
        return null;
    }
}
class RenderedStickyLine {
    constructor(lineNumber, lineDomNode, lineNumberDomNode, foldingIcon, characterMapping) {
        this.lineNumber = lineNumber;
        this.lineDomNode = lineDomNode;
        this.lineNumberDomNode = lineNumberDomNode;
        this.foldingIcon = foldingIcon;
        this.characterMapping = characterMapping;
    }
}
class StickyFoldingIcon {
    constructor(isCollapsed, dimension) {
        this.isCollapsed = isCollapsed;
        this.dimension = dimension;
        this.domNode = document.createElement('div');
        this.domNode.style.width = `${dimension}px`;
        this.domNode.style.height = `${dimension}px`;
        this.domNode.className = ThemeIcon.asClassName(isCollapsed ? foldingCollapsedIcon : foldingExpandedIcon);
    }
    setVisible(visible) {
        this.domNode.style.cursor = visible ? 'pointer' : 'default';
        this.domNode.style.opacity = visible ? '1' : '0';
    }
}
