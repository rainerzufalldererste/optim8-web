/*!-----------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Version: 0.43.0(94c055bcbdd49f04a0fa15515e848542a79fb948)
 * Released under the MIT license
 * https://github.com/microsoft/monaco-editor/blob/main/LICENSE.txt
 *-----------------------------------------------------------------------------*/

// src/basic-languages/csp/csp.contribution.ts
import { registerLanguage } from "../_.contribution.js";
registerLanguage({
  id: "csp",
  extensions: [],
  aliases: ["CSP", "csp"],
  loader: () => {
    if (false) {
      return new Promise((resolve, reject) => {
        __require(["vs/basic-languages/csp/csp"], resolve, reject);
      });
    } else {
      return import("./csp.js");
    }
  }
});
