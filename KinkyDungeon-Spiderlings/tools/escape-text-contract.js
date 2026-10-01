"use strict";

// Verified native consumers in KD 5.4.92 and 5.5: custom Impossible never adds Aroused.
function escapeTextKeys(restraints) {
    const keys = new Set();
    for (const restraint of restraints) {
        if (!restraint.name?.startsWith("Spiderlings")) continue;
        for (const [method, suffix] of Object.entries(restraint.failSuffix || {})) {
            if (!suffix) continue;
            for (const outcome of ["Fail", "Impossible", "ImpossibleBound"]) {
                const key = `KinkyDungeonStruggle${method}${outcome}${suffix}`;
                keys.add(key);
                if (outcome !== "Impossible") keys.add(key + "Aroused");
            }
        }
        if (restraint.customEscapeSucc)
            for (const method of Object.keys(restraint.escapeChance || {}))
                keys.add(`KinkyDungeonStruggle${method}Success${restraint.customEscapeSucc}`);
    }
    return [...keys].sort();
}

function inspectEscapeText(restraints, lookup) {
    const keys = escapeTextKeys(restraints);
    const errors = [];
    for (const key of keys) {
        const text = lookup(key);
        if (typeof text !== "string" || !text.trim() || text === key || text.startsWith("[NotFound]"))
            errors.push(`${key}: missing native escape text`);
        else if ((text.match(/TargetRestraint/g) || []).length !== 1)
            errors.push(`${key}: expected exactly one TargetRestraint placeholder`);
    }
    return { keys, errors };
}

if (typeof module !== "undefined") module.exports = { escapeTextKeys, inspectEscapeText };
else globalThis.inspectSpiderlingsEscapeText = inspectEscapeText;
