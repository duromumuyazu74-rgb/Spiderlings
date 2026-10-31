"use strict";

function nativeEvents() {
    return {
        KDEventMapGeneric: {},
        KDAddEvent(map, trigger, type, handler) {
            (map[trigger] ||= {})[type] = handler;
        },
    };
}

module.exports = { nativeEvents };
