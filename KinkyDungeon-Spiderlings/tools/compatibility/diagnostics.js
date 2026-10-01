"use strict";
/* global window, KDsetSeed */

function createDiagnostics() {
    let context = { scenario: "bootstrap", seed: null };
    const requests = new Map();
    const events = [];
    const record = (type, details, origin = context) => {
        const entry = { type, at: new Date().toISOString(), ...origin, ...details };
        events.push(entry);
        return entry;
    };
    return {
        events,
        setContext(value) {
            context = { ...value };
        },
        startRequest(request, url, resourceType) {
            const origin = { ...context };
            requests.set(request, { origin, url, resourceType });
        },
        response(request, status) {
            const entry = requests.get(request);
            if (entry && status >= 400)
                record("resource", { url: entry.url, resourceType: entry.resourceType, status }, entry.origin);
        },
        finishRequest(request, details = {}) {
            const entry = requests.get(request);
            if (entry && details.error)
                record("resource", { url: entry.url, resourceType: entry.resourceType, ...details }, entry.origin);
            requests.delete(request);
        },
        pendingAssets() {
            return [...requests.values()].filter((entry) =>
                ["image", "script", "stylesheet", "font"].includes(entry.resourceType),
            );
        },
        record,
    };
}

function browserDiagnostics() {
    globalThis.compatibilityContext = { scenario: "bootstrap", seed: null };
    globalThis.compatibilityDiagnostics = [];
    globalThis.compatibilityRejections = [];
    globalThis.compatibilitySetSeed = (seed) => {
        globalThis.compatibilityContext.seed = seed;
        console.debug("SpiderlingsCompatibilityContext:" + JSON.stringify(globalThis.compatibilityContext));
        KDsetSeed(seed);
    };
    const capture = (type, event, reason) => {
        const target = reason?.target || event.target;
        const entry = {
            type,
            at: new Date().toISOString(),
            ...globalThis.compatibilityContext,
            message: reason?.message || String(reason),
            stack: reason?.stack || null,
            url: target?.currentSrc || target?.src || target?.href || event.filename || null,
        };
        globalThis.compatibilityDiagnostics.push(entry);
        return entry;
    };
    window.addEventListener("unhandledrejection", (event) => {
        const entry = capture("rejection", event, event.reason);
        globalThis.compatibilityRejections.push(entry.message);
    });
    window.addEventListener(
        "error",
        (event) => capture(event.error ? "javascript" : "resource-error", event, event.error || event),
        true,
    );
    localStorage.setItem("KDResolution", "10");
    localStorage.setItem("PlayerName", "Spiderlings compatibility");
}

module.exports = { createDiagnostics, browserDiagnostics };
