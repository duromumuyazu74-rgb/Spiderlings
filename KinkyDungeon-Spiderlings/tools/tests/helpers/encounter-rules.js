"use strict";

const { nativeEvents } = require("./native-events.js");
Object.assign(globalThis, nativeEvents());
require("../../../SpiderlingsCore.js");
require("../../../SpiderlingsEncounters.js");

module.exports = globalThis.Spiderlings;
