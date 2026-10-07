"use strict";

// Native notes own discovery, journal persistence, enemy statistics and image rendering.
(() => {
    const api = globalThis.Spiderlings;
    if (typeof KDNewLore !== "function" || typeof KDLore === "undefined") return;
    const entries = [
        [
            "Spinner",
            "Spinner",
            "Danger Level: Low alone; high in groups|One alone gives me little trouble. Several work together: one occupies a visitor while others close the web and add soft, close-fitting layers. I watch their companions as carefully as the small spider in front of me.||-Silk-Path Field Notes",
        ],
        [
            "Jumper",
            "Jumper",
            "Danger Level: Normal|A quick-footed cousin of the Spinner. It gathers its legs before a short leap, then brushes its target with silk as it lands. I watch the gap ahead of it; following its little footprints only tells me where it has been.||-Silk-Path Field Notes",
        ],
        [
            "WebCaster",
            "Web Caster",
            "Danger Level: Low alone; high in groups|A lone sprayer gives me little trouble. Among other spiderlings, its soft fans of silk shorten a visitor's steps while the weavers draw closer. I have watched loose threads become a much greater danger through their quiet cooperation.||-Silk-Path Field Notes",
        ],
        [
            "Tunneler",
            "Tunneler",
            "Danger Level: None directly|This little digger does not fight visitors. It opens nest entrances and lines their rims with silk, then slips away. I listen for the soft scraping; the new opening, rather than its maker, may soon bring other little feet.||-Silk-Path Field Notes",
        ],
        [
            "MageSpiderlings",
            "Mage",
            "Danger Level: High|A small spellcaster with a neat hat and dull red runes on its back. The runes brighten when it casts and remain lit while delayed magic gathers. I watch both its patient little steps and the circles it leaves; soft silk can reach me from either.||-Silk-Path Field Notes",
        ],
        [
            "NestEntrance",
            "Nest Entrance",
            "Danger Level: High|A dark opening with a rim so carefully lined that it looks almost inviting. Small shapes inside keep its silk fresh. I have learnt to count the footsteps, not trust the quiet: another spiderling may emerge while its neighbours are busy with a visitor.||-Silk-Path Field Notes",
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
    function refreshDiscovery() {
        const explored = JSON.parse(localStorage.getItem("kdexpLore") || "{}");
        if (typeof KinkyDungeonUpdateTabs === "function") KinkyDungeonUpdateTabs(explored);
        if (typeof KinkyDungeonUpdateLore === "function") KinkyDungeonUpdateLore(explored);
    }
    const ids = entries.map(([enemy]) => `spiderlings.${enemy}`);
    api.Bestiary = {
        ids,
        unlockAll() {
            const explored = JSON.parse(localStorage.getItem("kdexpLore") || "{}");
            const unread = new Set(JSON.parse(localStorage.getItem("kdnewLore") || "[]"));
            let added = 0;
            for (const id of ids) {
                if (!explored[id]) {
                    explored[id] = 1;
                    unread.add(id);
                    added++;
                }
            }
            localStorage.setItem("kdexpLore", JSON.stringify(explored));
            const pending = [...unread];
            localStorage.setItem("kdnewLore", JSON.stringify(pending));
            if (typeof KinkyDungeonNewLoreList !== "undefined") KinkyDungeonNewLoreList = pending;
            refreshDiscovery();
            return { discovered: ids.length, added };
        },
    };
    // Native startup computes visible tabs before Mod entries are registered.
    refreshDiscovery();
    const portraitRune = "SpiderlingsBestiaryMageRune";
    const hidePortraitRune = () => {
        if (typeof kdpixisprites !== "undefined") {
            const sprite = kdpixisprites.get(portraitRune);
            if (sprite) sprite.visible = false;
        }
    };
    if (typeof KinkyDungeonDrawLore === "function") {
        KinkyDungeonDrawLore = api.Hooks.wrap(
            "SpiderlingsBestiaryPortrait",
            KinkyDungeonDrawLore,
            (native) =>
                function (...args) {
                    hidePortraitRune();
                    const result = native.apply(this, args);
                    if (KinkyDungeonCurrentLore !== "spiderlings.MageSpiderlings") return result;
                    const body = kdpixisprites.get("kdlorimage0");
                    if (!body?.visible || !KDLoreImg[KinkyDungeonCurrentLore]) return result;
                    const rune = KDDraw(
                        body.parent,
                        kdpixisprites,
                        portraitRune,
                        KinkyDungeonRootDirectory + "Enemies/MageSpiderlingsRegular.png",
                        body.position.x,
                        body.position.y,
                        Math.abs(body.width),
                        Math.abs(body.height),
                        undefined,
                        { zIndex: body.zIndex + 0.001, blendMode: PIXI.BLEND_MODES.NORMAL, alpha: 1 },
                        undefined,
                        undefined,
                        undefined,
                        true,
                    );
                    if (rune) rune.scale.x = Math.abs(rune.scale.x) * (body.scale.x < 0 ? -1 : 1);
                    return result;
                },
        );
    }
    // Both supported native Titles draws also read the selected Journal image.
    // Mask only our image during that draw; discovery and the Journal selection stay intact.
    if (typeof KinkyDungeonDrawTitles === "function" && typeof KDLoreImg !== "undefined") {
        KinkyDungeonDrawTitles = api.Hooks.wrap(
            "SpiderlingsBestiaryTitles",
            KinkyDungeonDrawTitles,
            (native) =>
                function (...args) {
                    hidePortraitRune();
                    const id = KinkyDungeonCurrentLore;
                    if (!api.Bestiary.ids.includes(id)) return native.apply(this, args);
                    const image = KDLoreImg[id];
                    delete KDLoreImg[id];
                    try {
                        return native.apply(this, args);
                    } finally {
                        KDLoreImg[id] = image;
                    }
                },
        );
    }
})();
