(async () => {
    const { setup, spawn, turn, expect, save, restore, frame } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const prison = Spiderlings.Prison,
        escort = Spiderlings.PrisonEscort;
    const field = Spiderlings.SpinnerNativeField,
        topology = Spiderlings.SpinnerTopology;
    const settings = KDModSettings.Spiderlings;
    const previous = { ...settings };
    const mobiles = () =>
        KDMapData.Entities.filter(
            (actor) =>
                actor.hp > 0 &&
                ["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"].includes(actor.Enemy.name),
        );
    const item = () =>
        KinkyDungeonAllRestraintDynamic().find(({ item }) => item.name === "SpiderlingsWebbingCocoon")?.item;
    const equip = (anchored = true) => {
        KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("SpiderlingsWebbingCocoon"), 0, false, "");
        const cocoon = item();
        expect(cocoon, "Cannot equip native Cocoon");
        cocoon.data ||= {};
        cocoon.data.SpiderlingsCocoonOuterWebs = { anchored, attemptAges: [] };
        return cocoon;
    };
    const arena = (seed) => {
        setup(seed);
        KDMapData.GridWidth = 40;
        KDMapData.GridHeight = 30;
        KDMapData.Grid =
            Array.from({ length: 30 }, (_, y) =>
                Array.from({ length: 40 }, (_, x) => (x && y && x < 39 && y < 29 ? "0" : "1")).join(""),
            ).join("\n") + "\n";
        KDMapData.Tiles = {};
        KDMapData.JailPoints = [];
        KDMapData.StartPosition = { x: 2, y: 2 };
        KDMapData.EndPosition = { x: 37, y: 27 };
        KDMapData.ShortcutPositions = {};
        KDMapData.UsedEntrances = {};
        KDMapData.PotentialEntrances = [];
        KDMapData.SpecialAreas = [];
        KDMovePlayer(14, 10, false);
        KinkyDungeonGenNavMap();
        // The controlled arena becomes an ordinary source map in the native
        // world cache; resetting RoomType alone leaves the lab's cached map.
        const slot = KDGetWorldMapLocation({ x: KDMapData.mapX, y: KDMapData.mapY });
        slot.main = "";
        slot.data[KDGameData.RoomType] = KDMapData;
        const journey = KDGameData.JourneyMap[KDGameData.JourneyX + "," + KDGameData.JourneyY];
        journey.RoomType = "";
        journey.Checkpoint = "grv";
        journey.type = "basic";
        save();
        settings.spiderlingsMapPopulationCap = "25";
        settings.spiderlingsNestReinforcementCap = "8";
        settings.spiderlingsNestReinforcementInterval = "10";
        for (const name of ["Spinner", "Jumper", "WebCaster", "Tunneler", "Mage"])
            settings["spiderlingsNest" + name + "Weight"] = name === "Spinner" ? "1" : "0";
    };
    const healthyTurn = async () => {
        KinkyDungeonStatWill = KinkyDungeonStatWillMax;
        KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
        await turn();
    };
    const snapshot = () => ({
        tick: KinkyDungeonCurrentTick,
        position: { x: KDPlayer().x, y: KDPlayer().y },
        identity: KDGameData.PrisonerState,
        stage: KDMapData.PrisonState,
        escort: escort.state() && JSON.parse(JSON.stringify(escort.state())),
        population: mobiles().length,
        cap: Spiderlings.getMapPopulationCap(),
        stay: Spiderlings.PrisonConstruction.state()?.stay,
        layers: field.compositeById(Spiderlings.PrisonConstruction.COMPOSITE)?.layerIds.length || 0,
        builders: (Spiderlings.PrisonConstruction.state()?.ownerIds || []).map((id) => {
            const actor = KDMapData.Entities.find((candidate) => candidate.id === id);
            if (!actor) return { id, missing: true };
            const graph = field.state()?.topology;
            const action =
                graph &&
                topology.nextWorkAction(
                    graph,
                    id,
                    actor,
                    [],
                    graph.composites[Spiderlings.PrisonConstruction.COMPOSITE]?.layerIds,
                );
            return {
                id,
                x: actor.x,
                y: actor.y,
                hp: actor.hp,
                movePoints: actor.movePoints,
                disabled: KinkyDungeonIsDisabled(actor),
                helpless: KDHelpless(actor),
                marker: actor.SpiderlingsChamberBuilder,
                action,
            };
        }),
    });
    try {
        arena("prison-review-source-rooms");
        const mainRoom = KDGameData.RoomType;
        const sourceSlot = { x: KDMapData.mapX, y: KDMapData.mapY };
        const mainEntrance = spawn("NestEntrance", 16, 10, "Enemy");
        expect(prison.enter({ entrance: mainEntrance, mode: "voluntary" }), "Main-room review entry failed");
        const mainPrison = KDGameData.RoomType;
        const mainVictim = KDMapData.SpiderlingsPrison.mainNestIds[0];
        KDMapData.Entities.find((actor) => actor.id === mainVictim).hp = 0;

        // Crouching uses the real zero-time input path; no patrol movement or
        // waypoint progress is allowed until a paid turn follows.
        KDMovePlayer(KDMapData.SpiderlingsPrison.exit.x, KDMapData.SpiderlingsPrison.exit.y + 1, false);
        const patrolFacts = () =>
            Object.keys(KDMapData.SpiderlingsPrison.patrols).map((id) => {
                const actor = KDMapData.Entities.find((enemy) => String(enemy.id) === id);
                return { id, x: actor.x, y: actor.y, ...KDMapData.SpiderlingsPrison.patrols[id] };
            });
        const idlePatrols = patrolFacts(),
            idleTick = KinkyDungeonCurrentTick;
        for (let n = 0; n < 3; n++) {
            KDSendInput("crouch", {});
            await frame();
        }
        expect(KinkyDungeonCurrentTick === idleTick, "Crouch unexpectedly advanced world time");
        expect(JSON.stringify(patrolFacts()) === JSON.stringify(idlePatrols), "Zero-time crouch moved a patrol");
        for (let n = 0; n < 3; n++) await healthyTurn();
        expect(JSON.stringify(patrolFacts()) !== JSON.stringify(idlePatrols), "Paid patrol movement stopped");
        rows.push({ name: "zero-time-patrol", before: idlePatrols, paid: patrolFacts(), idleTick });
        KDGoThruTile(KDMapData.SpiderlingsPrison.exit.x, KDMapData.SpiderlingsPrison.exit.y, true, true, true, true);

        // Prepare a second cached source room at the same native world slot.
        // Both admissions, saves, revisits and returns use native map transitions.
        const sideRoom = "SpiderlingsReviewSideRoom";
        alts[sideRoom] = { name: sideRoom, persist: true, noAdvance: true, startatstartpos: true };
        const sideMap = JSON.parse(JSON.stringify(KDMapData));
        Object.assign(sideMap, {
            RoomType: sideRoom,
            Entities: [],
            ShortcutPositions: {},
            UsedEntrances: {},
            PotentialEntrances: [],
            Tiles: {},
            LairsToPlace: [],
        });
        sideMap.Grid = sideMap.Grid.replaceAll("H", "0");
        KDMapData = sideMap;
        KDGameData.RoomType = sideRoom;
        KDGetWorldMapLocation(sourceSlot).data[sideRoom] = sideMap;
        KDGameData.JourneyMap[KDGameData.JourneyX + "," + KDGameData.JourneyY].SideRooms.push(sideRoom);
        KDMovePlayer(14, 10, false);
        KinkyDungeonGenNavMap();
        const sideEntrance = spawn("NestEntrance", 16, 10, "Enemy");
        expect(prison.enter({ entrance: sideEntrance, mode: "captured" }), "Side-room review entry failed");
        const sidePrison = KDGameData.RoomType;
        expect(sidePrison !== mainPrison, "Different source rooms shared one prison");
        expect(KDMapData.SpiderlingsPrison.source.room === sideRoom, "Side prison retained main source");
        const sideVictim = KDMapData.SpiderlingsPrison.mainNestIds[0];
        KDMapData.Entities.find((actor) => actor.id === sideVictim).hp = 0;
        restore(save());
        KDGoThruTile(KDMapData.SpiderlingsPrison.exit.x, KDMapData.SpiderlingsPrison.exit.y, true, true, true, true);
        expect(KDGameData.RoomType === sideRoom, "Side prison returned to the main room");
        expect(!KDGameData.SpiderlingsPrisonIdentity, "Side-room exit retained captured identity");
        expect(
            prison.enter({
                entrance: KDMapData.Entities.find((actor) => actor.id === sideEntrance.id),
                mode: "voluntary",
            }),
            "Side prison revisit failed",
        );
        expect(KDGameData.RoomType === sidePrison, "Side revisit generated a third prison");
        expect(
            !KDMapData.Entities.some((actor) => actor.id === sideVictim && actor.hp > 0),
            "Side revisit lost destruction",
        );
        KDGoThruTile(KDMapData.SpiderlingsPrison.exit.x, KDMapData.SpiderlingsPrison.exit.y, true, true, true, true);
        // Add a test-owned side-to-main stair to exercise the second source's
        // revisit without replacing the native world cache or prison records.
        KinkyDungeonMapSet(14, 10, "H");
        KinkyDungeonTilesSet("14,10", { RoomType: mainRoom, EscapeMethod: "None" });
        KDGoThruTile(14, 10, true, true, true, true);
        expect(KDGameData.RoomType === mainRoom, "Fixture could not return to main source");
        expect(
            prison.enter({
                entrance: KDMapData.Entities.find((actor) => actor.id === mainEntrance.id),
                mode: "voluntary",
            }),
            "Original prison revisit failed",
        );
        expect(KDGameData.RoomType === mainPrison, "Original prison ID was replaced");
        expect(
            !KDMapData.Entities.some((actor) => actor.id === mainVictim && actor.hp > 0),
            "Main revisit lost destruction",
        );
        rows.push({ name: "separate-source-rooms", mainPrison, sidePrison, mainVictim, sideVictim });

        arena("prison-review-cast-wrap");
        const wrappedCocoon = equip();
        escort.onAnchored(wrappedCocoon);
        for (let n = 0; n < 60 && escort.state()?.phase !== "building"; n++) await healthyTurn();
        expect(escort.state()?.phase === "building", "Clock-wrap fixture did not dispatch a builder");
        const interruptedId = escort.state().builderId;
        const interruptedBuilder = KDMapData.Entities.find((actor) => actor.id === interruptedId);
        KDMoveEntity(interruptedBuilder, escort.state().buildSite.x, escort.state().buildSite.y, false);
        const wrap = { name: "cast-clock-wrap", dispatch: snapshot(), steps: [] };
        rows.push(wrap);
        // Model a rejected delayed summon at the native spawn boundary. The
        // real Tunneler still casts, pays and consumes itself normally.
        const nativeSummon = KinkyDungeonSummonEnemy;
        KinkyDungeonSummonEnemy = function (x, y, name, ...args) {
            if ((typeof name === "string" ? name : name?.name) === "NestEntrance") return [];
            return nativeSummon.call(this, x, y, name, ...args);
        };
        try {
            for (let n = 0; n < 240 && escort.state().buildCastTick === undefined; n++) {
                await healthyTurn();
                if (n < 10 || n % 20 === 0)
                    wrap.steps.push({
                        ...snapshot(),
                        actor: {
                            x: interruptedBuilder.x,
                            y: interruptedBuilder.y,
                            hp: interruptedBuilder.hp,
                            aware: interruptedBuilder.aware,
                            vp: interruptedBuilder.vp,
                            spellCooldown: interruptedBuilder.spellCooldown,
                            channel: interruptedBuilder.channel,
                            movePoints: interruptedBuilder.movePoints,
                            ignore: interruptedBuilder.ignore,
                        },
                    });
            }
            const originalCastTick = escort.state().buildCastTick;
            expect(originalCastTick !== undefined, "Clock-wrap fixture did not observe a real Tunneler cast");
            // Move this actual pending cast to the clock boundary without
            // changing its age. Subsequent wrap, save/load and retry are native.
            const offset = 99999 - originalCastTick;
            KinkyDungeonCurrentTick += offset;
            escort.state().lastTick += offset;
            escort.state().buildCastTick += offset;
            const castTick = escort.state().buildCastTick;
            restore(save());
            for (let n = 0; n < 6 && escort.state().builderId === interruptedId; n++) await healthyTurn();
            expect(KinkyDungeonCurrentTick < 10, "Native clock did not wrap");
            expect(escort.state().builderId !== interruptedId, "Lost builder stalled after clock wrap");
            expect(
                !KDMapData.Entities.some((actor) => actor.hp > 0 && actor.Enemy.name === "NestEntrance"),
                "Retry directly created a nest",
            );
            Object.assign(wrap, { castTick, interruptedId, replacement: snapshot() });
        } finally {
            KinkyDungeonSummonEnemy = nativeSummon;
        }
        return { passed: true, rows };
    } finally {
        Object.assign(settings, previous);
    }
})();
