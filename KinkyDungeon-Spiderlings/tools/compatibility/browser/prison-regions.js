(async () => {
    const { setup, spawn, turn, expect, save, restore } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    const settings = KDModSettings.Spiderlings,
        prior = { ...settings };
    try {
        setup("prison-regional-orders");
        KDMapData.GridWidth = 40;
        KDMapData.GridHeight = 30;
        KDMapData.Grid =
            Array.from({ length: 30 }, (_, y) =>
                Array.from({ length: 40 }, (_, x) => (x && y && x < 39 && y < 29 ? "0" : "1")).join(""),
            ).join("\n") + "\n";
        KDMapData.Tiles = {};
        KDMapData.JailPoints = [];
        KDMapData.SpecialAreas = [];
        KDMapData.StartPosition = { x: 2, y: 2 };
        KDMapData.EndPosition = { x: 37, y: 27 };
        KDMapData.ShortcutPositions = {};
        KDMapData.UsedEntrances = {};
        KDMapData.PotentialEntrances = [];
        KDMovePlayer(14, 10, false);
        KinkyDungeonGenNavMap();
        save();
        const slot = KDGetWorldMapLocation({ x: KDMapData.mapX, y: KDMapData.mapY });
        slot.main = "";
        slot.data[""] = KDMapData;
        const journey = KDGameData.JourneyMap[KDGameData.JourneyX + "," + KDGameData.JourneyY];
        journey.RoomType = "";
        journey.Checkpoint = "grv";
        journey.type = "basic";
        const entrance = spawn("NestEntrance", 16, 10, "Enemy");
        settings.spiderlingsCaptureFieldLimit = "3";
        expect(Spiderlings.Prison.enter({ entrance, mode: "voluntary" }), "Regional fixture admission failed");
        for (const name of ["Spinner", "Jumper", "WebCaster", "Tunneler", "Mage"])
            settings["spiderlingsNest" + name + "Weight"] = "0";
        const point = Spiderlings.PrisonAlerts.planningPoint;
        const lower = [];
        for (let y = 37; y < 42 && lower.length < 12; y++)
            for (let x = 30; x < 46 && lower.length < 12; x++)
                if (KinkyDungeonMapGet(x, y) === "0" && !KinkyDungeonEntityAt(x, y))
                    lower.push(spawn("Spinner", x, y, "Enemy"));
        expect(lower.length === 12, "Regional fixture lacks legal workforce for three shared field permits");
        for (const actor of lower) Object.assign(actor, { aware: false, vp: 0 });
        const observer = spawn("WebCaster", 24, 8, "Enemy");
        KDMovePlayer(24, 10, false);
        const remoteIds = lower.map((actor) => actor.id);
        const row = { name: "regional-native", steps: [] };
        rows.push(row);
        for (let n = 0; n < 100; n++) {
            KinkyDungeonStatWill = KinkyDungeonStatWillMax;
            await turn();
            const groups = Object.values(Spiderlings.SpinnerNativeField.state()?.ai?.groups || {}).filter((group) =>
                group.memberIds.some((id) => remoteIds.includes(id)),
            );
            const report = Spiderlings.PrisonAlerts.currentReport();
            row.steps.push({
                tick: KinkyDungeonCurrentTick,
                report,
                groups: groups.map((group) => ({
                    id: group.id,
                    region: group.homeRegion,
                    focus: group.planningFocus,
                    metrics: { ...group.metrics },
                    plan: group.planId,
                    details: JSON.parse(JSON.stringify(group)),
                    projects: Spiderlings.SpinnerNativeField.state()?.ai?.projects,
                })),
                remote: lower.map((actor) => ({
                    id: actor.id,
                    x: actor.x,
                    y: actor.y,
                    region: Spiderlings.PrisonAlerts.regionAt(actor),
                    alert: actor.SpiderlingsPrisonAlert,
                })),
            });
        }
        expect(
            row.steps.some((step) => step.report),
            "Actual native observation did not produce regional alarm",
        );
        expect(
            row.steps.every((step) => step.remote.every((actor) => actor.region === "lower" && !actor.alert)),
            "Distant builders pursued or received the local alarm",
        );
        expect(
            row.steps.some((step) =>
                step.groups.some((group) => group.metrics.travel > 0 && group.metrics.construction > 0),
            ),
            "Distant builders performed no paid travel/work",
        );
        const old = Spiderlings.PrisonAlerts.currentReport();
        KDMovePlayer(25, 10, false);
        await turn();
        const newer = Spiderlings.PrisonAlerts.currentReport();
        expect(newer?.serial > old?.serial, "Later sighting did not update report");
        const planning = point("lower");
        expect(
            planning?.reported?.x === newer.x && planning?.reported?.y === newer.y,
            "Distant planning did not consume latest reported position",
        );
        restore(save());
        const report = Spiderlings.PrisonAlerts.currentReport();
        expect(report?.serial === newer.serial, "Report lost or duplicated on reload");
        // This probe measures report expiry, independently of a fresh capture.
        // Remove the Cocoon gained during the hostile observation fixture.
        if (KinkyDungeonGetRestraintItem("ItemDevices")?.name === "SpiderlingsWebbingCocoon")
            KinkyDungeonRemoveRestraint("ItemDevices", false, false, false);
        for (const { item } of KinkyDungeonAllRestraintDynamic())
            if (item.name === "SpiderlingsWebbingCocoon" && item.data?.SpiderlingsCocoonOuterWebs)
                item.data.SpiderlingsCocoonOuterWebs.anchored = false;
        Spiderlings.PrisonEscort.clear();
        KDMovePlayer(51, 22, false);
        KDGoThruTile(51, 22, true, true, true, true);
        row.immediateExit = { room: KDGameData.RoomType, position: { x: KDPlayer().x, y: KDPlayer().y } };
        // Wait off the connection; native waiting on the return stair confirms
        // another visit and would measure prison time rather than source time.
        const landing = { x: KDPlayer().x, y: KDPlayer().y - 1 };
        expect(KinkyDungeonMapGet(landing.x, landing.y) === "0", "Source wait landing is not legal floor");
        KDMovePlayer(landing.x, landing.y, false);
        row.sourceTurns = [];
        for (let n = 0; n < 20; n++) {
            await turn();
            row.sourceTurns.push({
                tick: KinkyDungeonCurrentTick,
                room: KDGameData.RoomType,
                identity: KDGameData.PrisonerState,
                escort: Spiderlings.PrisonEscort.state(),
                cocoons: KinkyDungeonAllRestraintDynamic()
                    .filter(({ item }) => item.name === "SpiderlingsWebbingCocoon")
                    .map(({ item }) => ({ id: item.id, outer: item.data?.SpiderlingsCocoonOuterWebs })),
            });
        }
        const nest = KDMapData.Entities.find((actor) => actor.id === entrance.id);
        row.sourceReturn = {
            room: KDGameData.RoomType,
            mapRoom: KDMapData.RoomType,
            nest: nest && { id: nest.id, hp: nest.hp, x: nest.x, y: nest.y },
            sourceNestId: entrance.id,
            shortcut: KDMapData.ShortcutPositions,
        };
        expect(
            Spiderlings.Prison.enter({ entrance: nest, mode: "voluntary" }),
            "Regional revisit failed: " + JSON.stringify(row.sourceReturn),
        );
        const revisited = Spiderlings.PrisonAlerts.currentReport();
        row.revisitReport = revisited;
        expect(
            !revisited || revisited.serial !== newer.serial,
            "Source-floor time retained old tracking: " + JSON.stringify({ newer, revisited }),
        );
        if (revisited)
            expect(
                KDMapData.Entities.some(
                    (actor) =>
                        actor.hp > 0 &&
                        actor.Enemy?.tags?.spiderlings &&
                        Math.hypot(actor.x - KDPlayer().x, actor.y - KDPlayer().y) <= (actor.Enemy.visionRadius || 0) &&
                        KinkyDungeonCheckLOS(
                            actor,
                            KDPlayer(),
                            Math.hypot(actor.x - KDPlayer().x, actor.y - KDPlayer().y),
                            actor.Enemy.visionRadius || 0,
                            true,
                            true,
                        ),
                ),
                "Revisit report has no actual local observer",
            );
        expect(
            !Spiderlings.PrisonConstruction.state()?.stay ||
                Spiderlings.PrisonConstruction.state().stay.phase === "left",
            "Regional visitor started chamber escalation",
        );
        row.lastObserver = observer.id;
        return { passed: true, rows };
    } finally {
        Object.assign(settings, prior);
    }
})();
