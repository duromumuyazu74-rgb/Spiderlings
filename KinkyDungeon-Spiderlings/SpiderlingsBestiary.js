"use strict";

// Native notes own discovery, journal persistence, enemy statistics and image rendering.
(() => {
    const api = globalThis.Spiderlings;
    if (typeof KDNewLore !== "function" || typeof KDLore === "undefined") return;
    const entries = [
        [
            "Spinner",
            "Spinner",
            "Fine threads tremble between its feet as it tests the edges of its web. Once a visitor steps inside, the loose mesh draws taut. It tends a torn strand as patiently as it wraps a struggling guest.",
        ],
        [
            "Jumper",
            "Jumper",
            "It folds its legs beneath a small, restless body, then springs across the gap in a single bound. A soft brush of feet is followed by a sticky loop. The next leap leaves a trembling thread behind.",
        ],
        [
            "WebCaster",
            "Web Caster",
            "Silk gathers at its mouth before spreading in a pale fan. The spray settles over boots and hems, joining stray threads into a clinging mesh. It keeps its distance while the silk draws the visitor's steps shorter.",
        ],
        [
            "Tunneler",
            "Tunneler",
            "A faint scraping beneath the floor precedes its arrival. It noses through the stone and lines the new opening with silk. The passage stays warm with movement long after it slips below again.",
        ],
        [
            "MageSpiderlings",
            "Mage",
            "The marks on its back brighten as it gathers a spell. A glimmer remains while the waiting circle hums, then fades with the released magic. Fine silk drifts through the light before settling against its visitor.",
        ],
        [
            "NestEntrance",
            "Nest Entrance",
            "Layers of silk soften the rim of a dark opening. Small feet stir beyond it, and fresh threads appear wherever the lining has frayed. The nest feels quiet until another pair of eyes glints from within.",
        ],
    ];
    const checkpoints = Object.keys(KDLore).filter((tab) => tab !== "Spiderlings" && tab !== "Enemy");
    addTextKey("KinkyDungeonCheckpointLoreSpiderlings", "Spiderlings");
    for (const [enemy, label, text] of entries) {
        const id = `spiderlings.${enemy}`;
        KDNewLore(
            ["Spiderlings", ...checkpoints],
            id,
            label,
            enemy === "NestEntrance" ? label : `Spiderling ${label}`,
            text,
            () => !JSON.parse(localStorage.getItem("kdexpLore") || "{}")[id],
            `Enemies/${enemy}.png`,
            checkpoints,
            enemy,
        );
    }
    api.Bestiary = { ids: entries.map(([enemy]) => `spiderlings.${enemy}`) };
})();
