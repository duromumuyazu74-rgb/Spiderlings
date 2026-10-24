(async () => {
    const { setup, spawn, turn, frame, expect, save, restore, photo } = globalThis.normalAcceptance;
    const settings = KDModSettings.Spiderlings,
        previous = { ...settings };
    const rows = (globalThis.normalTrace = []);
    try {
        for (const testSite of ["upper", "middle-a", "middle-b", "storage", "nest", "exit"]) {
            setup("prison-v6-homefield-" + testSite);
            KDMapData.GridWidth = 40;
            KDMapData.GridHeight = 30;
            KDMapData.Grid = Array.from(
                { length: 30 },
                (_, y) =>
                    Array.from({ length: 40 }, (_, x) => (x && y && x < 39 && y < 29 ? "0" : "1")).join("") + "\n",
            ).join("");
            Object.assign(KDMapData, {
                Tiles: {},
                JailPoints: [],
                SpecialAreas: [],
                ShortcutPositions: {},
                UsedEntrances: {},
                PotentialEntrances: [],
                StartPosition: { x: 2, y: 2 },
                EndPosition: { x: 37, y: 27 },
            });
            KDMovePlayer(14, 10, false);
            KinkyDungeonGenNavMap();
            const slot = KDGetWorldMapLocation({ x: KDMapData.mapX, y: KDMapData.mapY });
            slot.main = "";
            slot.data[""] = KDMapData;
            Object.assign(KDGameData.JourneyMap[KDGameData.JourneyX + "," + KDGameData.JourneyY], {
                RoomType: "",
                Checkpoint: "grv",
                type: "basic",
            });
            save();
            const entrance = spawn("NestEntrance", 16, 10, "Enemy");
            const level = MiniGameKinkyDungeonLevel;
            expect(Spiderlings.Prison.enter({ entrance, mode: "voluntary" }), "V6 native entry failed");
            const prison = KDMapData.SpiderlingsPrison;
            const site = prison.fieldSites.find((candidate) => candidate.id === testSite);
            expect(KDMapData.GridWidth === 81 && KDMapData.GridHeight === 63, "V6 fixed scene dimensions were scaled");
            expect(prison.layoutVersion === 2 && prison.fieldSites.length === 6, "Authored field sites missing");
            const residentIds = Object.values(prison.residentIds);
            expect(residentIds.length === prison.residents.length, "Regional native residents were not placed");
            expect(Spiderlings.getMapPopulationCap() === 40, "Prison population floor changed");
            rows.push({
                name: "generated-" + testSite,
                dimensions: [KDMapData.GridWidth, KDMapData.GridHeight],
                residentIds,
                nestIds: [...prison.mainNestIds],
                fields: prison.fieldSites,
                exit: prison.exit,
            });

            // Open a real adjacent native chest through player input before the work fixture.
            const chest = { x: 77, y: 8 };
            expect(KinkyDungeonMapGet(chest.x, chest.y) === "C", "Native chest not generated");
            for (let n = 0; n < 4 && KinkyDungeonMapGet(chest.x, chest.y) === "C"; n++) {
                KDSendInput(
                    "move",
                    {
                        dir: { x: Math.sign(chest.x - KDPlayer().x), y: Math.sign(chest.y - KDPlayer().y), delta: 0 },
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
            expect(KinkyDungeonMapGet(chest.x, chest.y) === "c", "Native loot interaction did not open chest");
            restore(save());
            expect(KinkyDungeonMapGet(chest.x, chest.y) === "c", "Reload recreated chest loot");
            expect(
                JSON.stringify(Object.values(KDMapData.SpiderlingsPrison.residentIds)) === JSON.stringify(residentIds),
                "Reload duplicated regional residents",
            );

            // Isolate one real crew to measure native paid work, separately from map population and difficulty.
            for (const name of ["Spinner", "Jumper", "WebCaster", "Tunneler", "Mage"])
                settings["spiderlingsNest" + name + "Weight"] = "0";
            for (const actor of [...KDMapData.Entities])
                if (!actor.Enemy.immobile) KDRemoveEntity(actor, false, false, true);
            const { x: cx, y: cy } = site.center;
            const positions =
                testSite === "nest"
                    ? [
                          [cx - 1, cy - 1],
                          [cx + 1, cy - 1],
                          [cx - 1, cy + 1],
                          [cx + 1, cy + 1],
                      ]
                    : [
                          [cx - 1, cy - 1],
                          [cx, cy + 1],
                          [cx + 1, cy + 1],
                          [cx - 1, cy],
                      ];
            const crew = positions.map(([x, y]) => spawn("Spinner", x, y, "Enemy"));
            for (const actor of crew) actor.SpiderlingsNestParentID = KDMapData.SpiderlingsPrison.mainNestIds[0];
            KDMovePlayer(cx + 1, cy, false);
            KDUpdateEnemyCache = true;
            KDSendInput(
                "move",
                {
                    dir: { x: -1, y: 0, delta: 0 },
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
            const work = { name: "native-paid-" + testSite, crew: crew.map((actor) => actor.id), steps: [] };
            rows.push(work);
            let composite;
            for (
                let n = 0;
                n < Math.max(240, (site.bounds.right - site.bounds.left + (site.bounds.bottom - site.bounds.top)) * 16);
                n++
            ) {
                KinkyDungeonStatWill = KinkyDungeonStatWillMax;
                KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
                await turn();
                const encounter = Spiderlings.SpinnerNativeField.state();
                composite = Object.values(encounter?.topology?.composites || {}).find(
                    (candidate) => candidate.core.x === site.center.x && candidate.core.y === site.center.y,
                );
                if (n % 5 === 0)
                    work.steps.push({
                        tick: KinkyDungeonCurrentTick,
                        plans: encounter?.ai?.plans,
                        composite: composite && { ...composite },
                        actions: encounter?.topology?.actionLog?.length || 0,
                        crew: crew.map((actor) => ({ id: actor.id, x: actor.x, y: actor.y, hp: actor.hp })),
                    });
                if (
                    composite &&
                    Spiderlings.SpinnerTopology.captureGeometryReady(encounter.topology, composite.id, KDPlayer())
                )
                    break;
            }
            expect(composite, "Native AI did not select the authored upper cross");
            const encounter = Spiderlings.SpinnerNativeField.state();
            expect(
                Spiderlings.SpinnerTopology.captureGeometryReady(encounter.topology, composite.id, KDPlayer()),
                "Native paid cross did not close",
            );
            const field = encounter.topology.fields[composite.layerIds[0]];
            expect(
                field.bounds.left === site.bounds.left &&
                    field.bounds.right === site.bounds.right &&
                    field.bounds.top === site.bounds.top &&
                    field.bounds.bottom === site.bounds.bottom,
                "Native plan used another field shape",
            );
            expect(encounter.topology.actionLog.length > 0, "No actual paid native construction actions recorded");
            const solids = Spiderlings.SpinnerTopology.solidCells(encounter.topology);
            for (const cell of field.boundaryCells)
                expect(
                    solids.some((point) => point.x === cell.x && point.y === cell.y),
                    "A native cross arm remains open",
                );
            expect(
                KDMapData.Entities.some((actor) => Spiderlings.SpinnerNativeField.isOwnedProxy(actor)),
                "No native physical web projection",
            );
            work.final = {
                player: { x: KDPlayer().x, y: KDPlayer().y },
                tick: KinkyDungeonCurrentTick,
                compositeId: composite.id,
                bounds: field.bounds,
                solidCells: solids,
                actions: encounter.topology.actionLog,
                permits: Spiderlings.FieldProjects.permits(),
                limit: Spiderlings.FieldProjects.limit(),
            };
            const graph = JSON.stringify(encounter.topology);
            restore(save());
            expect(
                JSON.stringify(Spiderlings.SpinnerNativeField.state().topology) === graph,
                "Reload changed paid cross structure",
            );
            expect(
                KDPlayer().x === work.final.player.x && KDPlayer().y === work.final.player.y,
                "Reload moved player out of the cross",
            );
            expect(
                Spiderlings.SpinnerTopology.captureGeometryReady(
                    Spiderlings.SpinnerNativeField.state().topology,
                    composite.id,
                    KDPlayer(),
                ),
                "Reload lost closed cross geometry at the player",
            );
            expect(KinkyDungeonMapGet(chest.x, chest.y) === "c", "Field reload reset opened chest");
            expect(MiniGameKinkyDungeonLevel === level, "Prison scene advanced journey level");
        }
        return { passed: true, rows, image: await photo() };
    } finally {
        Object.assign(settings, previous);
    }
})();
