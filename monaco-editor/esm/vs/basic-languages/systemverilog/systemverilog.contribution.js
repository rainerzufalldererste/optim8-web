/*!-----------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Version: 0.43.0(94c055bcbdd49f04a0fa15515e848542a79fb948)
 * Released under the MIT license
 * https://github.com/microsoft/monaco-editor/blob/main/LICENSE.txt
 *-----------------------------------------------------------------------------*/

// src/basic-languages/systemverilog/systemverilog.contribution.ts
import { registerLanguage } from "../_.contribution.js";
registerLanguage({
  id: "systemverilog",
  extensions: [".sv", ".svh"],
  aliases: ["SV", "sv", "SystemVerilog", "systemverilog"],
  loader: () => {
    if (false) {
      return new Promise((resolve, reject) => {
        __require(["vs/basic-languages/systemverilog/systemverilog"], resolve, reject);
      });
    } else {
      return import("./systemverilog.js");
    }
  }
});
registerLanguage({
  id: "verilog",
  extensions: [".v", ".vh"],
  aliases: ["V", "v", "Verilog", "verilog"],
  loader: () => {
    if (false) {
      return new Promise((resolve, reject) => {
        __require(["vs/basic-languages/systemverilog/systemverilog"], resolve, reject);
      });
    } else {
      return import("./systemverilog.js");
    }
  }
});
