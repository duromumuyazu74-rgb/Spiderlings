"use strict";

function placeholderMultiset(text) {
    return (
        String(text).match(
            /\{[A-Za-z_]\w*\}|TargetRestraint|RestraintAdded|DamageDealt|TargetLv\d+|(?<![A-Za-z0-9_])(?:CURRENT|TARGET)(?![A-Za-z0-9_])/g,
        ) || []
    ).sort();
}

function inspectTranslationPlaceholders(english, locales) {
    const errors = [];
    for (const [locale, texts] of Object.entries(locales)) {
        for (const [key, value] of Object.entries(english)) {
            if (!texts.has(key) || !String(texts.get(key)).trim()) {
                errors.push(`${locale} ${key}: missing registered text`);
                continue;
            }
            const expected = placeholderMultiset(value);
            const actual = placeholderMultiset(texts.get(key));
            if (JSON.stringify(expected) !== JSON.stringify(actual))
                errors.push(
                    `${locale} ${key}: placeholder mismatch; expected ${JSON.stringify(expected)}, found ${JSON.stringify(actual)}`,
                );
        }
    }
    return errors;
}

module.exports = { placeholderMultiset, inspectTranslationPlaceholders };
