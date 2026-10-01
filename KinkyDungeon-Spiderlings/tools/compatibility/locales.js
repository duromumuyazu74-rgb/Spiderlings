"use strict";

const languages = Object.freeze(["CN", "DE", "ES", "JP", "KR", "PL", "RU"]);
const { placeholderMultiset } = require("../translation-contract.js");

function inspectLocale(loaded) {
    const errors = [];
    const rows = String(loaded.csv || "")
        .replace(/\r\n?/g, "\n")
        .trim()
        .split("\n")
        .map((line) => {
            const comma = line.indexOf(",");
            const key = line.slice(0, comma);
            let expected = line.slice(comma + 1);
            if (
                (expected.startsWith('"') && expected.endsWith('"')) ||
                (expected.startsWith("'") && expected.endsWith("'"))
            )
                expected = expected.slice(1, -1);
            if (comma < 1 || !expected.trim()) errors.push(`${key || "CSV row"}: invalid native CSV entry`);
            return { key, expected };
        });
    if (!loaded.csv || !rows.length) errors.push("Selected ZIP CSV is empty");
    if (new Set(rows.map(({ key }) => key)).size !== rows.length) errors.push("Selected ZIP CSV has duplicate keys");
    if (!loaded.nativeLoads?.some((entry) => entry.language === loaded.language && entry.matchingSelectedZIPCSV))
        errors.push("Native KDLoadTranslations did not load the selected ZIP CSV");
    const actual = new Map((loaded.values || []).map((entry) => [entry.key, entry]));
    const values = rows.map(({ key, expected }) => {
        const entry = actual.get(key) || {};
        if (entry.source !== expected) errors.push(`${key}: native source text differs from the ZIP CSV`);
        if (entry.rendered !== expected) errors.push(`${key}: TextGet differs from the ZIP CSV`);
        if (typeof entry.english !== "string") errors.push(`${key}: missing registered English fallback`);
        else if (JSON.stringify(placeholderMultiset(entry.english)) !== JSON.stringify(placeholderMultiset(expected)))
            errors.push(`${key}: placeholder mismatch with the registered English fallback`);
        return { ...entry, key, expected };
    });
    return {
        language: loaded.language,
        csvFile: loaded.csvFile,
        count: rows.length,
        nativeLoads: loaded.nativeLoads,
        nativeBaseLanguageAvailable: loaded.nativeBaseLanguageAvailable,
        values,
        errors,
        passed: errors.length === 0,
    };
}

module.exports = { languages, inspectLocale };
