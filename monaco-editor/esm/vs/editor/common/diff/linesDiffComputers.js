/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { LegacyLinesDiffComputer } from './legacyLinesDiffComputer.js';
import { AdvancedLinesDiffComputer } from './advancedLinesDiffComputer.js';
export const linesDiffComputers = {
    getLegacy: () => new LegacyLinesDiffComputer(),
    getAdvanced: () => new AdvancedLinesDiffComputer(),
};
