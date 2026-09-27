(async () => {
    KinkyDungeonStartNewGame(false);
    for (let i = 0; i < 10; i++) KinkyDungeonAdvanceTime(1);
    KinkyDungeonGoddessRep.Ghost = 50;
    if (typeof KDGetGenericDialogueParams === "function") KDGetGenericDialogueParams(KDPlayer(), KDPlayer());
    KDMapData.Entities = [];
    KDMapData.Bullets = [];
    KDUpdateEnemyCache = true;
    const caster = DialogueCreateEnemy(KDPlayer().x + 1, KDPlayer().y, "WebCaster");
    caster.aware = true;
    const names = () => KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name);
    let hits = 0;
    for (; hits < 100 && !names().includes("SpiderlingsWebbingCocoon"); hits++) {
        KinkyDungeonDressPlayer();
        UpdateModels(KinkyDungeonPlayer);
        KDPlayerEffects[Spiderlings.Webbing.WEBSPRAY_EFFECT](
            KDPlayer(),
            "glue",
            {
                provenance: Spiderlings.Webbing.WEBSPRAY_PROVENANCE,
                triggerSource: "direct",
            },
            undefined,
            "Enemy",
            undefined,
            caster,
        );
        KinkyDungeonSendEvent("tickAfter", { delta: 1 });
    }
    if (!names().includes("SpiderlingsWebbingCocoon")) throw new Error("Webbing progression did not reach the cocoon.");
    DrawCharacter(KinkyDungeonPlayer, 0, 0, 1);
    const before = names();
    const save = KinkyDungeonSaveGame(true);
    if (!KinkyDungeonLoadGame(typeof save === "string" ? save : LZString.compressToBase64(JSON.stringify(save)), true))
        throw new Error("Save reload failed.");
    if (JSON.stringify(before) !== JSON.stringify(names())) throw new Error("Reload changed equipped Webbing.");
    return { turns: 10, hits, items: names(), saveReload: true };
})();
