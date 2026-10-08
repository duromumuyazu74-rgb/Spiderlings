(async () => {
    const { setup, spawn, expect } = globalThis.normalAcceptance;
    const oldLimit = KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit;
    const projects = Spiderlings.FieldProjects;
    const native = Spiderlings.SpinnerNativeField;
    const rows = (globalThis.normalTrace = []);
    const open = (seed, count, setting) => {
        setup(seed);
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = String(setting);
        KDMapData.GridWidth = 44;
        KDMapData.GridHeight = 26;
        KDMapData.Grid =
            Array.from({ length: 26 }, (_, y) =>
                Array.from({ length: 44 }, (_, x) => (x && y && x < 43 && y < 25 ? "0" : "1")).join(""),
            ).join("\n") + "\n";
        KDMapData.Tiles = {};
        KDMapData.StartPosition = { x: 1, y: 1 };
        KDMapData.EndPosition = { x: 42, y: 24 };
        KDMovePlayer(2, 23, false);
        KinkyDungeonGenNavMap();
        return Array.from({ length: count }, (_, index) => {
            const site = { x: index < 4 ? 8 : 30, y: 10 };
            const actor = spawn("Spinner", site.x + (index % 2), site.y + (Math.floor(index / 2) % 2));
            actor.SpiderlingsPresetFieldCenter = site;
            actor.hostile = 999;
            actor.aware = false;
            actor.vp = 0;
            actor.Enemy = { ...actor.Enemy, visionRadius: 0 };
            actor.modified = true;
            return actor;
        });
    };
    try {
        for (const [count, setting] of [
            [0, 3],
            [3, 3],
            [4, 3],
            [7, 3],
            [8, 3],
            [8, 0],
            [8, 1],
            [8, 2],
        ]) {
            open(`field-permits-${count}-${setting}`, count, setting);
            const expected = Math.min(setting, Math.floor(count / 4));
            expect(projects.limit() === setting, "Population changed the configured field setting");
            expect(
                projects.permits() === Math.floor(count / 4),
                "Field permits did not use floor(living Spinners / 4)",
            );
            expect(projects.capacity() === expected, "Setting and population permits did not share the creation gate");
            const placed = Spiderlings.SpinnerAI.initializeMapgenField({
                maxFields: 3,
                preferredSites: [
                    { x: 8, y: 10 },
                    { x: 30, y: 10 },
                ],
            });
            const fields = Object.values(native.state()?.topology.composites || {});
            expect(
                fields.length === expected,
                `Native preplacement ignored field permits: ${JSON.stringify({ count, setting, expected, placed })}`,
            );
            if (fields.length) {
                expect(
                    fields.every((field) => field.layerIds.length > 1),
                    "Permit fixture lost its nested rings and no longer checks one permit per field",
                );
                expect(
                    native.state().topology.actionLog.length === 0,
                    "Counting field permits granted an unpaid construction action",
                );
            }
            rows.push({
                count,
                setting,
                permits: projects.permits(),
                capacity: projects.capacity(),
                fields: fields.length,
            });
        }

        for (const count of [3, 4, 8]) {
            open(`normal-planning-permits-${count}`, count, 3);
            const ai = Spiderlings.SpinnerAI.beginTurn({ activate: true });
            const plans = Object.values(ai.plans).filter(
                (plan) => !["invalid", "abandoned", "retired"].includes(plan.status),
            );
            expect(
                count < 4 ? plans.length === 0 : plans.length > 0 && plans.length <= Math.floor(count / 4),
                `Normal planning ignored population permits: ${JSON.stringify({ count, plans: plans.length })}`,
            );
            expect(
                native.state().topology?.actionLog.length === 0 || !native.state().topology,
                "Ordinary permit reconciliation paid for construction",
            );
            rows.push({ mode: "normal-planning", count, capacity: projects.capacity(), fields: plans.length });
        }

        const crew = open("retained-field-after-permit-loss", 8, 3);
        const placed = Spiderlings.SpinnerAI.initializeMapgenField({
            maxFields: 2,
            preferredSites: [
                { x: 8, y: 10 },
                { x: 30, y: 10 },
            ],
        });
        expect(placed.fields?.length === 2, "Retention fixture did not start with two fields");
        const encounter = native.state();
        const retainedFields = Object.keys(encounter.topology.fields);
        const retainedAnchors = encounter.topology.anchors.map((anchor) => ({ id: anchor.id, built: anchor.built }));
        const paid = encounter.topology.actionLog.length;
        for (const actor of crew.slice(2)) actor.hp = 0;
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = "0";
        Spiderlings.SpinnerAI.beginTurn({ activate: true });
        expect(projects.permits() === 0 && projects.capacity() === 0, "Population loss kept a stale creation permit");
        expect(
            retainedFields.every((id) => encounter.topology.fields[id] && !encounter.topology.fields[id].retired),
            "Losing permits or setting zero dismantled retained fields",
        );
        expect(
            retainedAnchors.every((before) => {
                const after = encounter.topology.anchors.find((anchor) => anchor.id === before.id);
                return after?.built === before.built;
            }),
            "Permit loss removed retained construction investment",
        );
        expect(encounter.topology.actionLog.length === paid, "Permit reconciliation paid for field work");
        const before = Object.keys(encounter.topology.composites).length;
        const refused = Spiderlings.SpinnerAI.initializeMapgenField({ maxFields: 3 });
        expect(
            Object.keys(encounter.topology.composites).length === before && refused.status === "skipped",
            "Setting zero let native preplacement add another field",
        );
        rows.push({ mode: "retained", permits: projects.permits(), capacity: projects.capacity(), fields: before });
        return { rows };
    } finally {
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = oldLimit;
    }
})();
