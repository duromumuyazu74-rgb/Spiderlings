/* global KDMods */
(() => {
    let ownedIds = new Set(),
        reserveIds = new Set(),
        originalMapSize,
        reserveArea,
        preparationSeed;
    globalThis.compatibilityEnvironment = { preparations: [] };
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const renderFrame = async () => {
        await frame();
        await frame();
    };
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    const setup = (seed = "normal-acceptance") => {
        ownedIds = new Set();
        reserveIds = new Set();
        originalMapSize = undefined;
        reserveArea = undefined;
        preparationSeed = seed;
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
        ownedIds.add(enemy.id);
        return enemy;
    };
    const turn = async () => {
        KinkyDungeonLastAction = "Wait";
        KinkyDungeonAdvanceTime(1, true);
        await frame();
    };
    const save = () => {
        // Fresh runtimes can save before their first character render. Native
        // save data reads ModelContainer.Poses, created by DrawCharacter.
        if (!KDCurrentModels.get(KinkyDungeonPlayer)) {
            KinkyDungeonDressPlayer();
            DrawCharacter(KinkyDungeonPlayer, 0, 0, 1);
        }
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
    const population = () =>
        KDMapData.Entities.filter(
            (actor) =>
                actor.hp > 0 &&
                actor.Enemy.name === "Spinner" &&
                KDHostile(actor) &&
                !KDAllied(actor) &&
                !KDIsInParty(actor) &&
                !KDIsImprisoned(actor),
        );
    const walkable = (x, y) =>
        x > 0 &&
        y > 0 &&
        x < KDMapData.GridWidth - 1 &&
        y < KDMapData.GridHeight - 1 &&
        KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(x, y));
    const connectedCells = (actors) => {
        const visited = new Set(),
            queue = actors.map(({ x, y }) => ({ x, y }));
        for (let index = 0; index < queue.length; index++) {
            const { x, y } = queue[index],
                key = `${x},${y}`;
            if (visited.has(key) || !walkable(x, y)) continue;
            visited.add(key);
            for (const dx of [-1, 0, 1])
                for (const dy of [-1, 0, 1]) if (dx || dy) queue.push({ x: x + dx, y: y + dy });
        }
        return visited;
    };
    const reservePocket = (count) => {
        // Extend only the test-owned map. Original cells, exits and connectivity
        // stay intact; the new pocket has no route into any construction site.
        const width = KDMapData.GridWidth,
            height = KDMapData.GridHeight,
            rows = Math.ceil(count / 2);
        expect(width > 5, "Reserve pocket does not fit beneath this fixture map");
        originalMapSize ||= { width, height };
        const grid = Array.from({ length: height + rows + 2 }, (_, y) =>
            y < height ? Array.from({ length: width }, (_, x) => KinkyDungeonMapGet(x, y)).join("") : "1".repeat(width),
        );
        const cells = Array.from({ length: count }, (_, index) => ({
            x: 2 + (index % 2),
            y: height + 1 + Math.floor(index / 2),
        }));
        for (const { x, y } of cells) grid[y] = grid[y].slice(0, x) + "0" + grid[y].slice(x + 1);
        KDMapData.GridHeight = height + rows + 2;
        KDMapData.Grid = grid.join("\n") + "\n";
        reserveArea = { kind: "test-owned-extension", original: originalMapSize, cells };
        KDPathCache = new Map();
        KDPathCacheIgnoreLocks = new Map();
        KinkyDungeonGenNavMap();
        return cells;
    };
    const prepareCrew = ({ actors, fieldPermits = 0, reserveCells } = {}) => {
        expect(Number.isInteger(fieldPermits) && fieldPermits >= 0, "Field permits must be a nonnegative integer");
        const owned = KDMapData.Entities.filter((actor) => ownedIds.has(actor.id)),
            crew = actors || owned.filter((actor) => !reserveIds.has(actor.id)),
            count = Math.max(0, fieldPermits * 4 - population().length);
        expect(
            crew.every((actor) => owned.includes(actor)),
            "Action crew must contain test-owned live map actors",
        );
        if (count) {
            originalMapSize ||= { width: KDMapData.GridWidth, height: KDMapData.GridHeight };
            const cells = reserveCells || reservePocket(count),
                connected = connectedCells([
                    KDPlayer(),
                    ...KDMapData.Entities.filter((actor) => !reserveIds.has(actor.id)),
                ]);
            expect(cells.length >= count, "Field permit fixture has too few isolated reserve cells");
            const selected = cells.slice(0, count);
            expect(
                new Set(selected.map(({ x, y }) => `${x},${y}`)).size === count &&
                    selected.every(
                        ({ x, y }) => walkable(x, y) && !KinkyDungeonEntityAt(x, y) && !connected.has(`${x},${y}`),
                    ),
                "Permit reserves must occupy free floor disconnected from the player and action crew",
            );
            reserveArea ||= { kind: "authored-isolated-cells", original: originalMapSize, cells: selected };
            for (const { x, y } of selected) {
                const actor = spawn("Spinner", x, y);
                Object.assign(actor, { hostile: 999, aware: false, vp: 0, stun: 10000 });
                reserveIds.add(actor.id);
            }
            KDUpdateEnemyCache = true;
        }
        expect(
            Spiderlings.FieldProjects.permits() >= fieldPermits,
            "Disabled living reserves did not supply the declared field permits",
        );
        const result = {
            owned: KDMapData.Entities.filter((actor) => ownedIds.has(actor.id)),
            actors: crew,
            actionable: crew.filter((actor) => Spiderlings.SpinnerAI.eligibleSpinner(actor)),
            population: population(),
            reserves: KDMapData.Entities.filter((actor) => reserveIds.has(actor.id)),
            reserveArea,
        };
        globalThis.compatibilityEnvironment.preparations.push({
            seed: preparationSeed,
            fieldPermits,
            owned: result.owned.map((actor) => actor.id),
            actors: result.actors.map((actor) => actor.id),
            actionable: result.actionable.map((actor) => actor.id),
            population: result.population.map((actor) => actor.id),
            reserves: result.reserves.map(({ id, x, y }) => ({ id, x, y })),
            reserveArea,
        });
        return result;
    };
    const waitForVisualStage = async (select) => {
        const deadline = performance.now() + 12000;
        let bullets;
        do {
            await renderFrame();
            bullets = select();
        } while (
            (!bullets.length ||
                bullets.some(
                    (bullet) =>
                        KinkyDungeonBulletsVisual.get(bullet.spriteID)?.alpha !== 1 ||
                        !kdpixisprites.get(bullet.spriteID)?.texture?.baseTexture?.valid,
                )) &&
            performance.now() < deadline
        );
        return bullets;
    };
    // Transport-only scenes seed a saved, qualified crossing; admission scenes
    // separately exercise actual native movement without injecting a hit.
    const seedRecoveryDeparture = (compositeId, sourceIds) => {
        const field = Spiderlings.SpinnerNativeField,
            from = field.commonCore(compositeId);
        expect(from && field.containsComposite(compositeId, from), "Departure snapshot needs a real field interior");
        let to;
        for (let y = 1; y < KDMapData.GridHeight - 1 && !to; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1 && !to; x++)
                if (KinkyDungeonMapGet(x, y) === "0" && !field.containsComposite(compositeId, { x, y })) to = { x, y };
        expect(to, "Departure snapshot needs a point outside the whole field");
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("SpiderlingsSpinnerLegbinder"), 0, false, "");
        const bag = Spiderlings.SpinnerCapture.item();
        expect(bag, "Recovery transport requires its leg bag");
        (bag.data ||= {}).wrapProgress = 1;
        KDGameData[Spiderlings.SpinnerRecovery.DEPARTURE] = {
            version: 1,
            compositeId,
            legBagId: bag.id,
            eligibleSourceIds: sourceIds,
            boundaryExit: { compositeId, from: { ...from }, to },
        };
    };
    globalThis.normalAcceptance = {
        seedRecoveryDeparture,
        setup,
        spawn,
        turn,
        frame,
        renderFrame,
        expect,
        save,
        restore,
        enemy,
        pin,
        photo,
        line,
        registerPackagedScript,
        withPopulationBudget,
        prepareCrew,
        waitForVisualStage,
    };
    return { initialized: true };
})();
