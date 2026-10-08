/* global KDMods */
(() => {
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const setup = (seed = "normal-acceptance") => {
        globalThis.compatibilitySetSeed(seed);
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
        globalThis.compatibilitySetSeed(seed);
        KDSetWeapon("Knife");
        KinkyDungeonUpdateStats(0);
        KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
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
    const registerPackagedScript = async (filename) => {
        const name = Object.keys(KDMods).find((entry) => entry.startsWith("Spiderlings_"));
        const entries = await model.getEntries(KDMods[name], {});
        const script = entries.find((entry) => entry.filename === filename);
        expect(script, `Packaged script is missing: ${filename}`);
        const response = await fetch(await model.getURL(script, {}));
        expect(response.ok, `Packaged script could not load: ${filename}`);
        (0, eval)(await response.text());
        return { filename, registered: true };
    };
    const withPopulationBudget = async (kind, cap, action) => {
        const original = Spiderlings.Population.prepareFloor;
        Spiderlings.Population.prepareFloor = function (...args) {
            const result = original.apply(this, args);
            return args[0] === kind ? { ...result, cap } : result;
        };
        try {
            return await action();
        } finally {
            Spiderlings.Population.prepareFloor = original;
        }
    };
    const addDisabledSpinnerReserves = (minimumPermits = 1) => {
        // A small active crew still needs the new map-wide population permit.
        // These distant disabled enemies count as living population without
        // joining work, pressure or capture in the behavior under test.
        const living = KDMapData.Entities.filter(
            (actor) =>
                actor.hp > 0 &&
                actor.Enemy.name === "Spinner" &&
                KDHostile(actor) &&
                !KDAllied(actor) &&
                !KDIsInParty(actor) &&
                !KDIsImprisoned(actor),
        );
        const count = Math.max(0, minimumPermits * 4 - living.length);
        const cells = [];
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++)
                if (
                    KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(x, y)) &&
                    !KinkyDungeonEntityAt(x, y) &&
                    (x !== KDPlayer().x || y !== KDPlayer().y)
                )
                    cells.push({
                        x,
                        y,
                        clearance: [-1, 0, 1].reduce(
                            (total, dx) =>
                                total +
                                [-1, 0, 1].filter((dy) =>
                                    KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(x + dx, y + dy)),
                                ).length,
                            0,
                        ),
                        distance: Math.min(
                            ...living.map((actor) => Math.max(Math.abs(actor.x - x), Math.abs(actor.y - y))),
                        ),
                    });
        cells.sort(
            (left, right) =>
                right.clearance - left.clearance ||
                right.distance - left.distance ||
                left.y - right.y ||
                left.x - right.x,
        );
        expect(cells.length >= count, "Field permit fixture has no room for disabled reserve population");
        const reserves = cells.slice(0, count).map((cell) => {
            const actor = spawn("Spinner", cell.x, cell.y);
            actor.hostile = 999;
            actor.aware = false;
            actor.vp = 0;
            actor.stun = 10000;
            return actor;
        });
        expect(
            Spiderlings.FieldProjects.permits() >= minimumPermits,
            "Disabled living reserves did not supply population permits",
        );
        return reserves;
    };
    globalThis.normalAcceptance = {
        setup,
        spawn,
        turn,
        frame,
        expect,
        save,
        restore,
        enemy,
        pin,
        photo,
        line,
        registerPackagedScript,
        withPopulationBudget,
        addDisabledSpinnerReserves,
    };
    return { initialized: true };
})();
