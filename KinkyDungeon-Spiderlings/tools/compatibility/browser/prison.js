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
    const inventory = () => JSON.stringify(KinkyDungeonAllRestraintDynamic().map(({ item }) => item));
    try {
        arena("prison-voluntary");
        const nest = spawn("NestEntrance", 16, 10, "Enemy");
        nest.hostile = 999;
        KDMovePlayer(15, 10, false);
        KDGameData.PrisonerState = "parole";
        // The registered native Nest dialogue is the product entry point.
        KinkyDungeonVisionSet(nest.x, nest.y, 5);
        const menus = KDGetContextActions.Game;
        const nativeTarget = KinkyDungeonSetTargetLocation;
        KinkyDungeonSetTargetLocation = () => {
            KinkyDungeonTargetX = nest.x;
            KinkyDungeonTargetY = nest.y;
        };
        let menu;
        try {
            menu = menus(false, 0, 0);
        } finally {
            KinkyDungeonSetTargetLocation = nativeTarget;
        }
        expect(menu.options.includes("SpiderlingsNestVisit"), "Hostile nest has no voluntary entry context action");
        menu.optionActions.SpiderlingsNestVisit();
        expect(KDGameData.CurrentDialog === "SpiderlingsNestVisit", "Context action did not open native nest dialogue");
        KDDialogue.SpiderlingsNestVisit.options.Enter.clickFunction(false, KDPlayer());
        KDResetDialogue();
        expect(
            prison.isPrison(),
            "Native Nest dialogue did not enter prison: " +
                JSON.stringify({
                    speaker: KDGetSpeaker()?.id,
                    nestId: nest.id,
                    mapX: KDMapData.mapX,
                    mapY: KDMapData.mapY,
                    slot: !!KDGetWorldMapLocation({ x: KDMapData.mapX, y: KDMapData.mapY }),
                    journey: KDGameData.JourneyMap?.[KDGameData.JourneyX + "," + KDGameData.JourneyY],
                    room: KDGameData.RoomType,
                    mapRoom: KDMapData.RoomType,
                    shortcut: KDMapData.ShortcutPositions,
                    data: KDMapData.SpiderlingsPrison,
                }),
        );
        const voluntary = { name: "voluntary", arrival: snapshot() };
        rows.push(voluntary);
        expect(
            KDPlayer().x === KDMapData.SpiderlingsPrison.exit.x && KDPlayer().y === KDMapData.SpiderlingsPrison.exit.y,
            "Visitor did not spawn at external entrance",
        );
        expect(KDMapData.PrisonState === "Visit" && !prison.captured(), "Visitor acquired captivity stage");
        expect(KDGameData.PrisonerState === "parole", "Visitor overwrote prior identity");
        expect(!Spiderlings.PrisonConstruction.state()?.stay, "Visitor started chamber timer");
        const room = KDGameData.RoomType,
            floor = MiniGameKinkyDungeonLevel;
        const ids = [...KDMapData.SpiderlingsPrison.mainNestIds];
        expect(ids.length === 10, "Prison lacks ten main nests");
        expect(
            KDMapData.Entities.filter((actor) => ids.includes(actor.id)).every((a, _, all) =>
                all.every((c) => Math.hypot(a.x - c.x, a.y - c.y) <= 5),
            ),
            "Main nests exceed proximity radius",
        );
        expect(
            KDMapData.Entities.filter((actor) => ids.includes(actor.id)).every((actor) => KDHostile(actor)),
            "Visitor has hostile-spider immunity",
        );
        KDGoThruTile(KDMapData.SpiderlingsPrison.exit.x, KDMapData.SpiderlingsPrison.exit.y, true, true, true, true);
        expect(!prison.isPrison() && MiniGameKinkyDungeonLevel === floor, "Visitor return advanced journey");
        expect(KDGameData.PrisonerState === "parole", "Visitor return erased prior identity");
        voluntary.immediateReturn = snapshot();
        const sourceNest = KDMapData.Entities.find((actor) => actor.id === nest.id);
        expect(prison.enter({ entrance: sourceNest, mode: "voluntary" }), "Visitor revisit failed");
        expect(KDGameData.RoomType === room, "Revisit generated another prison");
        KDMovePlayer(KDMapData.SpiderlingsPrison.chamber.x, KDMapData.SpiderlingsPrison.chamber.y, false);
        for (let n = 0; n < 55; n++) await healthyTurn();
        expect(!Spiderlings.PrisonConstruction.state()?.stay, "Uncaptured chamber walk started escalation");
        voluntary.chamberNegative = snapshot();
        const destroyed = KDMapData.Entities.find((actor) => actor.id === ids[0]);
        destroyed.hp = 0;
        const retainedGrid = KDMapData.Grid;
        restore(save());
        expect(KDMapData.Grid === retainedGrid && !prison.captured(), "Visitor reload lost map or changed identity");
        expect(
            !KDMapData.Entities.some((actor) => actor.id === ids[0] && actor.hp > 0),
            "Reload respawned destroyed nest",
        );
        // Captured admission is also exercised independently of transport.
        const cocoon = equip();
        cocoon.cutProgress = 0.23;
        cocoon.struggleProgress = 0.31;
        KinkyDungeonInventoryAdd({ name: "PotionMana", type: Consumable, quantity: 3, id: KinkyDungeonGetItemID() });
        const equipment = inventory();
        expect(prison.recapture(), "Captured admission failed");
        expect(inventory() === equipment, "Captured admission changed equipped item state");
        expect(
            KDGameData.PrisonerState === "jail" && KDMapData.PrisonState === "Intro",
            "Captured admission did not use native identity and Intro",
        );
        expect(
            KinkyDungeonAllConsumable().some((entry) => entry.name === "PotionMana" && entry.quantity >= 3),
            "Captured admission removed backpack contents",
        );
        const captured = { name: "captured-construction", arrival: snapshot(), steps: [] };
        rows.push(captured);
        for (let n = 0; n < 49; n++) await healthyTurn();
        expect(Spiderlings.PrisonConstruction.state().stay.elapsed === 49, "Stay did not count 49 world turns");
        expect(Spiderlings.PrisonConstruction.state().dispatches.length === 0, "Builders dispatched early");
        restore(save());
        await healthyTurn();
        expect(Spiderlings.PrisonConstruction.state().stay.elapsed === 50, "Reload rerolled/reset 50-turn stay");
        expect(Spiderlings.PrisonConstruction.state().dispatches.length === 1, "Threshold did not dispatch one team");
        captured.threshold = snapshot();
        for (let n = 0; n < 1200; n++) {
            await healthyTurn();
            if (n % 20 === 0) captured.steps.push(snapshot());
            const composite = field.compositeById(Spiderlings.PrisonConstruction.COMPOSITE);
            if (
                composite?.layerIds.length >= 4 &&
                topology.isLayerClosed(field.state().topology, composite.layerIds[3])
            )
                break;
        }
        const composite = field.compositeById(Spiderlings.PrisonConstruction.COMPOSITE);
        captured.final = snapshot();
        captured.actions = field.state()?.topology?.actionLog?.slice(-120);
        expect(
            composite?.layerIds.length >= 4 && topology.isLayerClosed(field.state().topology, composite.layerIds[3]),
            "Fourth paid physical chamber layer did not close",
        );
        const beforeLoad = JSON.stringify(field.state().topology);
        restore(save());
        expect(JSON.stringify(field.state().topology) === beforeLoad, "Native reload changed constructed field");
        const matureSave = save();
        // Record mature pressure, including failed escape attempts, without forcing success.
        captured.breach = [];
        for (let n = 0; n < 50 && item(); n++) {
            KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
            KinkyDungeonStatWill = KinkyDungeonStatWillMax;
            KDSendInput("struggle", { group: "ItemDevices", type: "Cut", index: 0 });
            await frame();
            captured.breach.push({ tick: KinkyDungeonCurrentTick, remaining: !!item(), progress: item()?.cutProgress });
        }
        captured.breachOutcome = { escapedCocoon: !item(), chamber: Spiderlings.PrisonConstruction.state()?.stay };
        KDMovePlayer(27, KDMapData.SpiderlingsPrison.chamber.y, false);
        await healthyTurn();
        expect(Spiderlings.PrisonConstruction.state().stay.phase === "left", "Chamber departure retained timer");
        const layerCount = field.compositeById(Spiderlings.PrisonConstruction.COMPOSITE).layerIds.length;
        for (let n = 0; n < 3; n++) await healthyTurn();
        expect(
            field.compositeById(Spiderlings.PrisonConstruction.COMPOSITE).layerIds.length === layerCount,
            "Departed player caused new chamber layer dispatch",
        );
        const population = { name: "population", cap40: snapshot(), steps: [] };
        rows.push(population);
        settings.spiderlingsMapPopulationCap = "60";
        expect(Spiderlings.getMapPopulationCap() === 60, "Higher prison cap lost");
        settings.spiderlingsMapPopulationCap = "0";
        expect(Spiderlings.getMapPopulationCap() === 0, "Zero prison cap is not unlimited");
        for (let n = 0; n < 200 && mobiles().length <= 60; n++) {
            await healthyTurn();
            if (n % 10 === 0) population.steps.push(snapshot());
        }
        population.unlimited = snapshot();
        expect(mobiles().length > 60, "Unlimited prison did not exceed 60 real living actors");
        expect(
            Spiderlings.PrisonNest.livingExtraEntrances() <= Spiderlings.PrisonNest.EXTRA_ENTRANCE_CAP,
            "Extra simultaneous nest limit exceeded",
        );
        settings.spiderlingsMapPopulationCap = "40";
        KDMovePlayer(KDMapData.SpiderlingsPrison.exit.x, KDMapData.SpiderlingsPrison.exit.y, false);
        KDGoThruTile(KDMapData.SpiderlingsPrison.exit.x, KDMapData.SpiderlingsPrison.exit.y, true, true, true, true);
        expect(!prison.isPrison() && MiniGameKinkyDungeonLevel === floor, "Captured exit advanced journey");
        expect(
            !["jail", "chase"].includes(KDGameData.PrisonerState) && !KDGameData.SpiderlingsPrisonIdentity,
            "Exit did not clean only established identity",
        );
        captured.return = snapshot();
        expect(
            prison.enter({ entrance: KDMapData.Entities.find((actor) => actor.id === nest.id), mode: "captured" }),
            "Same-floor recapture failed",
        );
        expect(
            KDGameData.RoomType === room &&
                Math.abs(KDPlayer().x - KDMapData.SpiderlingsPrison.chamber.x) <= 3 &&
                Math.abs(KDPlayer().y - KDMapData.SpiderlingsPrison.chamber.y) <= 3,
            "Recapture did not use original chamber/map",
        );
        expect(
            !KDMapData.Entities.some((actor) => actor.id === ids[0] && actor.hp > 0),
            "Recapture restored destroyed nest",
        );
        expect(
            field.compositeById(Spiderlings.PrisonConstruction.COMPOSITE).layerIds.length >= 4,
            "Recapture deleted construction",
        );
        expect(Spiderlings.PrisonConstruction.state().stay.elapsed === 0, "Recapture retained old stay deadline");
        captured.recapture = snapshot();

        for (const fallback of [false, true]) {
            arena(fallback ? "prison-tunneler-transport" : "prison-existing-transport");
            const transport = { name: fallback ? "tunneler-transport" : "existing-transport", steps: [], casts: [] };
            rows.push(transport);
            const cocoon = equip(false);
            for (let n = 0; n < 3; n++) await healthyTurn();
            expect(!escort.state(), "Ordinary Cocoon started dispatch");
            cocoon.data.SpiderlingsCocoonOuterWebs.anchored = true;
            const random = KDRandom;
            KDRandom = () => (fallback ? 0.999 : 0);
            try {
                escort.onAnchored(cocoon);
            } finally {
                KDRandom = random;
            }
            const deadline = escort.state().deadline;
            expect(deadline === (fallback ? 50 : 30), "Dispatch deadline boundary changed");
            restore(save());
            expect(escort.state().deadline === deadline, "Load rerolled dispatch");
            if (!fallback) spawn("NestEntrance", 18, 10, "Enemy");
            if (fallback) {
                settings.spiderlingsMapPopulationCap = "1";
                spawn("Tunneler", 10, 10, "Enemy");
            } else spawn("Spinner", 12, 10, "Enemy");
            KDAddEvent(KDEventMapGeneric, "enemyCast", "PrisonAcceptance", (_event, data) => {
                if (data.spell?.name === "SummonNestEntrance")
                    transport.casts.push({
                        tick: KinkyDungeonCurrentTick,
                        id: data.enemy.id,
                        x: data.enemy.x,
                        y: data.enemy.y,
                    });
            });
            for (let n = 0; n < 240 && !prison.isPrison(); n++) {
                await healthyTurn();
                transport.steps.push(snapshot());
                const current = escort.state();
                if (current?.phase === "escort") {
                    const carrier = KinkyDungeonGetRestraintItem("ItemNeckRestraints");
                    expect(
                        carrier?.data?.[Spiderlings.ModelRuntime.SILK_ART_MARKER],
                        "The prison escort retained placeholder leash artwork",
                    );
                    transport.silkCarrier = { name: carrier.name, id: carrier.id };
                }
                if (fallback && !prison.isPrison()) expect(mobiles().length <= 1, "Fallback bypassed capacity");
                if (current && current.elapsed < deadline)
                    expect(current.phase === "pending", "Dispatch occurred before saved deadline");
            }
            delete KDEventMapGeneric.enemyCast.PrisonAcceptance;
            expect(prison.isPrison() && prison.captured(), "Physical transport did not admit captured player");
            expect(
                transport.steps.some((step) => step.escort?.phase === "escort"),
                "No physical native tether escort observed",
            );
            if (fallback) expect(transport.casts.length > 0, "Tunneler fallback did not use native building spell");
            transport.arrival = snapshot();
        }

        arena("prison-selection-interruption");
        const selection = { name: "selection-and-interruption", steps: [] };
        rows.push(selection);
        const boundary = spawn("NestEntrance", 26, 10, "Enemy");
        expect(escort.selectEntrance()?.id === boundary.id, "Reachable nest at Euclidean distance 12 rejected");
        boundary.x = 27;
        KDUpdateEnemyCache = true;
        expect(!escort.selectEntrance(), "Out-of-range nest accepted");
        boundary.x = 26;
        KDUpdateEnemyCache = true;
        for (let y = 9; y <= 11; y++) for (let x = 25; x <= 27; x++) KinkyDungeonMapSet(x, y, "1");
        KinkyDungeonGenNavMap();
        expect(!escort.selectEntrance(), "Blocked approach accepted");
        KDRemoveEntity(boundary, false, false, true);
        const cocoon2 = equip();
        settings.spiderlingsMapPopulationCap = "1";
        const stranded = spawn("Spinner", 12, 10, "Enemy");
        const lostDestination = spawn("NestEntrance", 18, 10, "Enemy");
        escort.onAnchored(cocoon2);
        const deadline2 = escort.state().deadline;
        for (let n = 0; n <= deadline2; n++) await healthyTurn();
        expect(
            escort.state().entranceId === lostDestination.id && escort.state().phase === "approach",
            "Native destination-loss fixture did not dispatch a real escort",
        );
        lostDestination.hp = 0;
        await healthyTurn();
        selection.destroyedDestination = {
            id: lostDestination.id,
            deadline: escort.state().deadline,
            phase: escort.state().phase,
            liveNests: KDMapData.Entities.filter((actor) => actor.hp > 0 && actor.Enemy.name === "NestEntrance").length,
        };
        expect(
            escort.state().deadline === deadline2 && selection.destroyedDestination.liveNests === 0,
            "Destination destruction rerolled dispatch or directly spawned a replacement nest",
        );
        expect(
            escort.state().phase === "pending" && mobiles().length === 1,
            "Full source capacity without Tunneler did not wait",
        );
        expect(
            !KDMapData.Entities.some((actor) => actor.hp > 0 && actor.Enemy.name === "NestEntrance"),
            "Full-cap wait created a nest",
        );
        KDRemoveEntity(stranded, false, false, true);
        for (let n = 0; n < 4 && escort.state().phase !== "building"; n++) await healthyTurn();
        expect(escort.state().phase === "building", "Freed capacity did not dispatch Tunneler");
        const builder = KDMapData.Entities.find((actor) => actor.id === escort.state().builderId);
        builder.freeze = 3;
        restore(save());
        const frozen = KDMapData.Entities.find((actor) => actor.id === builder.id);
        const frozenPosition = { x: frozen.x, y: frozen.y };
        await healthyTurn();
        expect(
            frozen.x === frozenPosition.x && frozen.y === frozenPosition.y,
            "Disabled builder performed construction travel",
        );
        KDRemoveEntity(frozen, false, false, true);
        await healthyTurn();
        expect(escort.state().deadline === deadline2, "Builder loss rerolled capture deadline");
        expect(
            !KDMapData.Entities.some((actor) => actor.hp > 0 && actor.Enemy.name === "NestEntrance"),
            "Builder death created a nest",
        );
        item().data.SpiderlingsCocoonOuterWebs.anchored = false;
        await healthyTurn();
        expect(!escort.state(), "Loss of eligibility retained a task");
        selection.final = snapshot();

        restore(matureSave);
        const mage = { name: "mature-prepared-mage-escape", casts: [], cuts: [], moves: [] };
        rows.push(mage);
        const escapeFloor = MiniGameKinkyDungeonLevel;
        const escapeRoom = KDGameData.RoomType;
        KDPushSpell(KinkyDungeonFindSpell("Fireball", true));
        KinkyDungeonStatMana = KinkyDungeonStatManaMax;
        for (let n = 0, paid = 0; n < 28 && paid < 8; n++) {
            const spell = KinkyDungeonFindSpell("Fireball", true);
            for (let wait = 0; wait < 120 && !KinkyDungeonHasMana(KinkyDungeonGetManaCost(spell)); wait++)
                await healthyTurn();
            const manaBefore = KinkyDungeonStatMana;
            const result = KDSendInput(
                "tryCastSpell",
                {
                    tx: KDMapData.SpiderlingsPrison.chamber.x + (paid % 2 ? 3 : 0),
                    ty: KDMapData.SpiderlingsPrison.chamber.y,
                    spellname: "Fireball",
                    player: KDPlayer(),
                },
                false,
                true,
            );
            await frame();
            mage.casts.push({ result, manaBefore, manaAfter: KinkyDungeonStatMana, tick: KinkyDungeonCurrentTick });
            if (KinkyDungeonStatMana < manaBefore) paid++;
            for (let wait = 0; wait < 4; wait++) await healthyTurn();
        }
        expect(
            mage.casts.some((cast) => cast.manaAfter < cast.manaBefore),
            "Prepared Mage did not pay native spell cost",
        );
        for (let n = 0; n < 100 && item(); n++) {
            KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
            KinkyDungeonStatWill = KinkyDungeonStatWillMax;
            KDSendInput("struggle", { group: "ItemDevices", type: "Cut", index: 0 }, false, true);
            await frame();
            mage.cuts.push({ tick: KinkyDungeonCurrentTick, remaining: !!item(), progress: item()?.cutProgress });
        }
        mage.cocoonEscaped = !item();
        if (!item()) {
            mageRoute: for (const goal of KDMapData.SpiderlingsPrison.routes.upper) {
                for (let n = 0; n < 160 && KDGameData.RoomType === escapeRoom; n++) {
                    if (KDPlayer().x === goal.x && KDPlayer().y === goal.y) break;
                    const route = KinkyDungeonFindPath(
                        KDPlayer().x,
                        KDPlayer().y,
                        goal.x,
                        goal.y,
                        true,
                        false,
                        false,
                        KinkyDungeonMovableTilesSmartEnemy,
                    );
                    if (!route?.length) {
                        mage.failedAt = "field-breach-no-route";
                        break mageRoute;
                    }
                    const next = route[0],
                        before = { x: KDPlayer().x, y: KDPlayer().y };
                    KDSendInput(
                        "move",
                        {
                            dir: { x: Math.sign(next.x - before.x), y: Math.sign(next.y - before.y), delta: 0 },
                            delta: 1,
                            AllowInteract: true,
                            AutoDoor: false,
                            AutoPass: true,
                            sprint: false,
                            SuppressSprint: false,
                        },
                        false,
                        true,
                    );
                    await frame();
                    mage.moves.push({
                        before,
                        after: { x: KDPlayer().x, y: KDPlayer().y },
                        tick: KinkyDungeonCurrentTick,
                    });
                    KinkyDungeonStatWill = KinkyDungeonStatWillMax;
                    KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
                }
            }
            for (let n = 0; n < 3 && KDGameData.RoomType === escapeRoom; n++) {
                KDSendInput(
                    "move",
                    {
                        dir: { x: 0, y: 0, delta: 0 },
                        delta: 1,
                        AllowInteract: true,
                        AutoDoor: false,
                        AutoPass: true,
                        sprint: false,
                        SuppressSprint: false,
                    },
                    false,
                    true,
                );
                await frame();
            }
            mage.final = snapshot();
            if (!mage.failedAt)
                expect(
                    KDGameData.RoomType !== escapeRoom && MiniGameKinkyDungeonLevel === escapeFloor,
                    "Prepared Mage did not return through native exit without journey advancement",
                );
            if (!mage.failedAt)
                expect(!KDGameData.SpiderlingsPrisonIdentity, "Natural escape retained imprisonment identity");
        } else {
            mage.failedAt = "native-cocoon-escape";
            mage.final = snapshot();
        }

        return { passed: true, scenarios: rows.length, rows };
    } finally {
        Object.assign(settings, previous);
    }
})();
