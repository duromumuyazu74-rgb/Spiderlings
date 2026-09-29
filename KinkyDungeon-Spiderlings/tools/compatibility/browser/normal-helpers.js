(() => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const setup = (seed = "normal-acceptance") => {
        KinkyDungeonStartNewGame(false);
        Spiderlings.SpinnerField.enter();
        KDMapData.Entities = [];
        KDMapData.Bullets = [];
        KDMapData.EffectTiles = {};
        KDMapData.GroundItems = [];
        for (const key of Object.keys(KDMapData)) if (key.startsWith("Spiderlings")) delete KDMapData[key];
        for (const key of Object.keys(KDGameData)) if (key.startsWith("Spiderlings")) delete KDGameData[key];
        KDMapData.RoomType = "";
        KDGameData.RoomType = "";
        KDGameData.MapMod = "";
        KDMovePlayer(2, 2, false);
        KDUpdateEnemyCache = true;
        KDToggles.Sound = false;
        KDsetSeed(seed);
    };
    const spawn = (name, x, y, faction) => {
        const enemy = DialogueCreateEnemy(x, y, name);
        if (faction) enemy.faction = faction;
        enemy.aware = true;
        enemy.vp = 10;
        return enemy;
    };
    const turn = async () => {
        KinkyDungeonLastAction = "Wait";
        KinkyDungeonAdvanceTime(1, true);
        await frame();
    };
    const save = () => {
        const data = KinkyDungeonSaveGame(true);
        return typeof data === "string" ? data : LZString.compressToBase64(JSON.stringify(data));
    };
    const restore = (data) => expect(KinkyDungeonLoadGame(data, true), "Native save reload failed");
    const enemy = (id) => KDMapData.Entities.find((entry) => entry.id === id);
    const pin = (target, source) => {
        for (let count = 0; count < 60 && Spiderlings.NPCAdhesion.status(target) !== "full"; count++) {
            Spiderlings.Combat.hitNPC(source, target, "direct");
            if (KDHelpless(target)) break;
        }
        expect(
            Spiderlings.NPCAdhesion.status(target) === "full",
            `Cannot prepare capable full pin: ${JSON.stringify({ name: target.Enemy.name, hp: target.hp, shield: target.shield, bound: target.boundLevel, slime: target.specialBoundLevel, ledger: target.SpiderlingsNPCAdhesion, hostile: KDHostile(source, target) })}`,
        );
        expect(!KDHelpless(target), "Full pin fixture is independently helpless");
    };
    const photo = async () => {
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) KinkyDungeonVisionSet(x, y, 5);
        await new Promise((resolve) => setTimeout(resolve, 200));
        await frame();
        await frame();
        return document.querySelector("canvas").toDataURL("image/png");
    };
    const line = (owner, start, end) => {
        const field = Spiderlings.SpinnerNativeField.initializeMap({
            fieldId: "acceptance-line",
            owners: [owner.id],
            anchors: [start, end],
        });
        const link = field.topology.links[0];
        const actions = [
            ...field.topology.anchors.map((anchor) => ({ type: "placeAnchor", anchorId: anchor.id, cell: anchor })),
            ...link.plannedCells.map((cell) => ({ type: "extendLink", linkId: link.id, cell })),
        ];
        for (const action of actions) {
            const result = Spiderlings.SpinnerTopology.applyAction(
                field.topology,
                { ...action, ownerId: owner.id },
                Spiderlings.SpinnerNativeField.snapshot(action.cell),
            );
            expect(
                result.outcome.legal,
                `Fixture web geometry was rejected: ${JSON.stringify({ action, outcome: result.outcome })}`,
            );
            field.topology = result.state;
        }
        Spiderlings.SpinnerNativeField.reconcile();
        return field;
    };
    globalThis.normalAcceptance = { setup, spawn, turn, frame, expect, save, restore, enemy, pin, photo, line };
    return { initialized: true };
})();
