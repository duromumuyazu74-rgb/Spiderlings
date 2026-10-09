(() => {
    const restraints = KinkyDungeonRestraints.filter((restraint) => restraint.name.startsWith("Spiderlings"));
    const result = globalThis.inspectSpiderlingsEscapeText(restraints, TextGet);
    if (!result.keys.length || result.errors.length)
        throw new Error(`Native escape text contract: ${result.errors.join("; ") || "no custom messages registered"}`);
    return { restraints: restraints.length, keys: result.keys };
})();
