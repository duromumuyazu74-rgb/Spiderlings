(async () => {
    const { setup, spawn, turn, expect, prepareCrew, save, restore } = globalThis.normalAcceptance;
    const oldLimit = KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit;
    const rows = (globalThis.normalTrace = []);
    try {
        setup("layer-resident-floor");
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = "2";
        KDMapData.GridWidth = 44;
        KDMapData.GridHeight = 26;
        KDMapData.Grid =
            Array.from({ length: 26 }, (_, y) =>
                Array.from({ length: 44 }, (_, x) => (x && y && x < 43 && y < 25 ? "0" : "1")).join(""),
            ).join("\n") + "\n";
        KDMapData.Tiles = {};
        KDMapData.StartPosition = { x: 1, y: 1 };
        KDMapData.EndPosition = { x: 42, y: 24 };
        KDMapData.ShortcutPositions = {};
        KDMapData.JailPoints = [];
        KDMovePlayer(2, 24, false);
        KinkyDungeonGenNavMap();
        const first = spawn("Spinner", 10, 12),
            second = spawn("Spinner", 32, 12);
        const pool = Array.from({ length: 11 }, (_, i) => spawn("Spinner", 20 + (i % 5), 7 + Math.floor(i / 5)));
        const actors = [first, second, ...pool];
        prepareCrew({ actors, fieldPermits: 2 });
        for (const actor of actors) Object.assign(actor, { hostile: 999, aware: false, vp: 0 });
        const field = Spiderlings.SpinnerNativeField,
            command = Spiderlings.FieldCommand;
        const enclosure = (id, x, owner) => ({
            compositeId: id,
            owners: [owner.id],
            built: true,
            layers: [2, 3, 4].map((radius, index) => ({
                id: id + index,
                vertices: [
                    { x: x - radius, y: 12 - radius },
                    { x: x + radius, y: 12 - radius },
                    { x: x + radius, y: 12 + radius },
                    { x: x - radius, y: 12 + radius },
                ],
                gate: { x: x + radius, y: 12 },
            })),
        });
        field.initializeEnclosure(enclosure("resident-a", 10, first));
        field.addEnclosure(enclosure("resident-b", 32, second));
        field.state().builders = {};
        Spiderlings.SpinnerAI.beginTurn({ activate: true, adoptExisting: true });
        const e = field.state(),
            ai = e.ai;
        const a = Object.values(ai.groups).find((group) => ai.plans[group.planId]?.compositeId === "resident-a");
        const b = Object.values(ai.groups).find((group) => ai.plans[group.planId]?.compositeId === "resident-b");
        expect(a && b, "Fixture needs two actual layered field commands");
        // Model the sparse command distribution in an older save. All actors
        // are real, actionable population; no permit top-up supplies workers.
        const reserve = command.newGroup(ai),
            other = command.newGroup(ai),
            state = command.ensure(e);
        for (const actor of pool)
            state.members[actor.id] = { id: actor.id, home: reserve.id, commander: reserve.id, phase: "home" };
        state.members[first.id] = { id: first.id, home: a.id, commander: a.id, phase: "home" };
        state.members[second.id] = { id: second.id, home: b.id, commander: b.id, phase: "home" };
        command.reconcile(e, KDMapData.Entities, {}, false);
        const distances = (left, right) => {
            const path = KinkyDungeonFindPath(
                left.x,
                left.y,
                right.x,
                right.y,
                false,
                false,
                false,
                KinkyDungeonMovableTilesEnemy,
            );
            return path ? path.length : Infinity;
        };
        command.request(e, other.id, "defense", 2, { x: 22, y: 20 }, { urgency: 2 });
        const before = actors.map((actor) => [actor.id, actor.x, actor.y]);
        command.allocate(e, distances);
        expect(
            JSON.stringify(before) === JSON.stringify(actors.map((actor) => [actor.id, actor.x, actor.y])),
            "Allocation moved actors for free",
        );
        expect(
            command.residency(e, a.id).minimum === 6 && command.residency(e, b.id).minimum === 6,
            "Three layers did not require six residents",
        );
        expect(
            command.residency(e, a.id).committed === 6 && command.residency(e, b.id).committed === 6,
            "Minimum residency was not assigned first",
        );
        expect(other.memberIds.length === 1, "Optional urgency consumed a minimum resident");
        expect(
            command.residency(e, a.id).usable === 1 && command.residency(e, b.id).usable === 1,
            "Incoming residents were counted on site",
        );
        rows.push({
            mode: "allocation",
            a: command.residency(e, a.id),
            b: command.residency(e, b.id),
            other: other.memberIds,
        });
        let paidMoves = 0;
        const nativeMove = KinkyDungeonEnemyTryMove;
        KinkyDungeonEnemyTryMove = function (actor, ...args) {
            const start = { x: actor.x, y: actor.y };
            const positive = args[1] > 0;
            const result = nativeMove.call(this, actor, ...args);
            if (actors.some((entry) => entry.id === actor.id) && (actor.x !== start.x || actor.y !== start.y)) {
                expect(positive, "Residency used a zero-time move");
                paidMoves++;
            }
            return result;
        };
        const arrived = new Set([first.id, second.id]);
        try {
            for (let i = 0; i < 60 && arrived.size < 12; i++) {
                await turn();
                const now = field.state();
                for (const actor of actors) {
                    const member = now.command.members[actor.id];
                    if (member && [a.id, b.id].includes(member.home) && member.phase === "home") arrived.add(actor.id);
                }
            }
        } finally {
            KinkyDungeonEnemyTryMove = nativeMove;
        }
        expect(paidMoves > 0 && arrived.size >= 12, "Permanent residents did not arrive through paid native movement");
        restore(save());
        const current = field.state();
        expect(
            command.residency(current, a.id).committed >= 6 && command.residency(current, b.id).committed >= 6,
            "Reload lost permanent resident command",
        );
        const victim = KDMapData.Entities.find(
            (actor) => current.command.members[actor.id]?.home === a.id && actor.hp > 0,
        );
        victim.hp = 0;
        KDRemoveEntity(victim, false, false);
        command.reconcile(current, KDMapData.Entities, {}, false);
        expect(command.residency(current, a.id).unassigned === 1, "Death did not report the resident deficit");
        await turn();
        expect(
            command.residency(field.state(), a.id).committed === 6,
            "The minimum gap did not preempt optional support",
        );
        rows.push({
            mode: "arrival-and-loss",
            paidMoves,
            arrived: [...arrived],
            a: command.residency(field.state(), a.id),
            b: command.residency(field.state(), b.id),
        });
        return { rows };
    } finally {
        KDModSettings.Spiderlings.spiderlingsCaptureFieldLimit = oldLimit;
    }
})();
