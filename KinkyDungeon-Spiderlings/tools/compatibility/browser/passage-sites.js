(async () => {
    const { setup, spawn, turn, frame, expect, save, restore, photo } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []),
        images = (globalThis.passageImages = {});
    const modes = globalThis.passageAcceptanceModes || ["corridor", "junction", "recruitment", "crowding", "breach"];
    const nativeField = Spiderlings.SpinnerNativeField,
        ai = Spiderlings.SpinnerAI;
    const key = (cell) => `${cell.x},${cell.y}`;
    const adjacent = (cell) => [
        { x: cell.x - 1, y: cell.y },
        { x: cell.x + 1, y: cell.y },
        { x: cell.x, y: cell.y - 1 },
        { x: cell.x, y: cell.y + 1 },
    ];
    const copy = (value) => (value === undefined ? undefined : structuredClone(value));
    const savedJSON = (value) =>
        JSON.stringify(value, (_key, entry) =>
            entry && typeof entry === "object" && !Array.isArray(entry)
                ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)))
                : entry,
        );
    const gateCells = (field) => Object.values(field.gates || {}).flatMap((gate) => gate.cells || []);
    let row,
        tick = 0;
    const inventoryWasOpen = KinkyDungeonShowInventory;
    const previousPink = KDModSettings.Spiderlings.spiderlingsPinkWebbing;
    const nativeAction = nativeField.applyPaidAction;
    const nativeHit = KDPlayerEffects.SpiderlingsWebbingEnemyBind;
    const nativeMove = KinkyDungeonEnemyTryMove;
    KinkyDungeonEnemyTryMove = function (source, direction, delta, x, y) {
        const before = { x: source.x, y: source.y, points: source.movePoints };
        const result = nativeMove.apply(this, arguments);
        if (row && source?.Enemy?.name === "Spinner")
            (row.moves ||= []).push({
                tick,
                source: source.id,
                direction,
                delta,
                target: { x, y },
                before,
                after: { x: source.x, y: source.y, points: source.movePoints },
                result,
            });
        return result;
    };
    nativeField.applyPaidAction = function (source, action) {
        const result = nativeAction.apply(this, arguments);
        if (row)
            row.actions.push({
                tick,
                nativeTick: KinkyDungeonCurrentTick,
                source: source.id,
                x: source.x,
                y: source.y,
                action: copy(action),
                result: copy(result),
                credit: source.SpinnerConstructionPoints,
            });
        return result;
    };
    KDPlayerEffects.SpiderlingsWebbingEnemyBind = function (target, damage, effect, spell, faction, bullet, source) {
        const before = Spiderlings.SpinnerCapture.phase();
        const result = nativeHit.apply(this, arguments);
        if (row && source?.Enemy?.name === "Spinner")
            row.melee.push({
                tick,
                nativeTick: KinkyDungeonCurrentTick,
                source: source.id,
                sourceCell: { x: source.x, y: source.y },
                playerCell: { x: KinkyDungeonPlayerEntity.x, y: KinkyDungeonPlayerEntity.y },
                before,
                after: Spiderlings.SpinnerCapture.phase(),
                result: copy(result),
            });
        return result;
    };
    const state = () => nativeField.state();
    const passagePlans = () =>
        Object.values(state()?.ai?.plans || {}).filter((plan) => plan.kind === "passage" && plan.status !== "retired");
    const fieldFor = (plan) => state()?.topology?.fields?.[plan?.fieldId];
    const recordTurn = () => {
        const encounter = state();
        row.turns.push({
            tick,
            nativeTick: KinkyDungeonCurrentTick,
            player: { x: KinkyDungeonPlayerEntity.x, y: KinkyDungeonPlayerEntity.y },
            capture: copy(Spiderlings.SpinnerCapture.state()),
            groups: copy(encounter?.ai?.groups),
            plans: copy(encounter?.ai?.plans),
            fields: copy(encounter?.topology?.fields),
            metrics: copy(encounter?.ai?.passageMetrics),
            actors: KDMapData.Entities.filter((entry) => entry.Enemy.name === "Spinner").map((entry) => ({
                id: entry.id,
                x: entry.x,
                y: entry.y,
                hp: entry.hp,
                aware: entry.aware,
                vp: entry.vp,
                bind: entry.bind,
                slow: entry.slow,
                stun: entry.stun,
                movePoints: entry.movePoints,
                flags: copy(entry.flags),
            })),
        });
    };
    const advance = async () => {
        tick++;
        await turn();
        recordTurn();
    };
    const room = (left, top, right, bottom) => {
        for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) KinkyDungeonMapSet(x, y, "0");
    };
    function terrain(mode) {
        setup(`passage-native-${mode}`);
        KDGameData.LastMapSeed = `passage-native-${mode}`;
        KDModSettings.Spiderlings.spiderlingsPinkWebbing = mode === "junction";
        KinkyDungeonBulletsVisual.clear();
        KDDamageQueue.length = 0;
        KinkyDungeonFloaters.length = 0;
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "1");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        room(2, 2, 2, 2);
        room(3, mode === "junction" ? 9 : 7, 8, mode === "junction" ? 11 : 13);
        room(20, mode === "junction" ? 9 : 7, 27, mode === "junction" ? 11 : 13);
        room(9, 10, 19, 10);
        if (mode === "junction") {
            room(9, 5, 19, 5);
            room(9, 5, 9, 10);
            room(19, 5, 19, 10);
            room(14, 4, 14, 9);
            room(12, 3, 16, 5);
            KinkyDungeonMapSet(9, 10, "d");
        }
        KDMapData.StartPosition = { x: 3, y: 10 };
        KDMapData.EndPosition = { x: 27, y: 10 };
        KDMapData.ShortcutPositions = {};
        KDMapData.JailPoints = [];
        KDPathCache = new Map();
        KDPathCacheIgnoreLocks = new Map();
        KDMovePlayer(2, 2, false);
        KDUpdateEnemyCache = true;
        row = { mode, seed: KDGameData.LastMapSeed, actions: [], melee: [], turns: [] };
        rows.push(row);
        tick = 0;
        const positions =
            mode === "crowding"
                ? Array.from({ length: 12 }, (_entry, index) => [3 + (index % 4), 7 + Math.floor(index / 4)])
                : mode === "recruitment"
                  ? [
                        [6, 8],
                        [24, 12],
                    ]
                  : [
                        [7, 9],
                        [7, 11],
                    ];
        const actors = positions.map(([x, y]) => spawn("Spinner", x, y));
        for (const actor of actors) {
            actor.aware = false;
            actor.vp = 0;
            actor.hostile = 999;
        }
        row.initialActors = actors.map((actor) => ({ id: actor.id, x: actor.x, y: actor.y }));
        ai.beginTurn({ activate: true });
        return actors;
    }
    async function snapshotReload(label) {
        await frame();
        await frame();
        const savedState = () =>
            copy({
                topology: state().topology,
                plans: state().ai.plans,
                groups: Object.fromEntries(
                    Object.entries(state().ai.groups).map(([id, group]) => [
                        id,
                        {
                            id,
                            memberIds: group.memberIds,
                            planId: group.planId,
                            source: group.source,
                            metrics: group.metrics,
                            incomingIds: group.incomingIds,
                            rallyGates: group.rallyGates,
                            rallyPhase: group.rallyPhase,
                        },
                    ]),
                ),
                actors: KDMapData.Entities.filter((entry) => entry.Enemy.name === "Spinner").map((entry) => ({
                    id: entry.id,
                    x: entry.x,
                    y: entry.y,
                    credit: entry.SpinnerConstructionPoints,
                })),
            });
        // Runtime assignments may be discarded and rederived during native load;
        // paid work, saved plans, membership and actor credit must stay intact.
        const before = savedState();
        const data = save();
        restore(data);
        const after = savedState();
        const beforeJSON = savedJSON(before),
            afterJSON = savedJSON(after);
        (row.reloads ||= []).push({ label, before, after });
        expect(beforeJSON === afterJSON, `${label} changed saved passage geometry or ownership`);
    }
    async function ready(maximum = 150) {
        for (let step = 0; step < maximum; step++) {
            await advance();
            const plan = passagePlans().find((entry) => fieldFor(entry)?.phase === "ready");
            if (!row.partialReload && row.actions.some((entry) => entry.result.applied)) {
                row.partialReload = true;
                await snapshotReload("paid preparation");
            }
            if (plan) return plan;
        }
        throw Error(
            `No naturally selected ready passage: ${JSON.stringify({ mode: row.mode, plans: state()?.ai?.plans, metrics: state()?.ai?.passageMetrics, last: row.turns.at(-1) })}`,
        );
    }
    function pathAcross() {
        return KinkyDungeonFindPath(
            4,
            10,
            26,
            10,
            false,
            false,
            false,
            KinkyDungeonMovableTilesEnemy,
            undefined,
            undefined,
            undefined,
        );
    }
    function projectionAudit() {
        const graph = state().topology,
            solids = Spiderlings.SpinnerTopology.solidCells(graph),
            proxies = KDMapData.Entities.filter(nativeField.isOwnedProxy);
        expect(
            solids.length === proxies.length && new Set(proxies.map(key)).size === proxies.length,
            "Passage has duplicate or stale native web proxies",
        );
        expect(
            proxies.every((proxy) => KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(proxy.x, proxy.y))),
            "Web was projected inside a native wall",
        );
    }
    async function cacheCheck() {
        // A native reload creates a new map object and may rebuild its transient
        // terrain index once; compare only the subsequent unchanged turns.
        await advance();
        const before = copy(state().ai.passageMetrics);
        expect(
            Number.isFinite(before?.analysisBuilds) && Number.isFinite(before?.candidateCells),
            "Passage analysis metrics are absent",
        );
        const actionCount = row.actions.length;
        KinkyDungeonAdvanceTime(0, true);
        expect(row.actions.length === actionCount, "Zero-time update spent passage construction");
        for (let step = 0; step < 20; step++) await advance();
        const after = copy(state().ai.passageMetrics);
        expect(
            after.analysisBuilds === before.analysisBuilds,
            "Unchanged terrain was analyzed again during idle turns",
        );
        expect(
            after.candidateCells === before.candidateCells,
            "Unchanged terrain rebuilt passage candidates during idle turns",
        );
        row.cache = { before, after };
    }
    async function enterAndCapture(plan) {
        // Pause only the automatic contest driver. Explicit native inputs and
        // world turns below retain their normal cost and enemy-loop behavior.
        KinkyDungeonShowInventory = true;
        let field = fieldFor(plan);
        const interior = new Set(field.interiorCells.map(key));
        const findAdmission = () => {
            const occupied = new Set(
                KDMapData.Entities.filter((entry) => entry.hp > 0 && !nativeField.isOwnedProxy(entry)).map(key),
            );
            return field.interiorCells
                .flatMap((inside) => adjacent(inside).map((outside) => ({ inside, outside })))
                .find(
                    ({ inside, outside }) =>
                        !interior.has(key(outside)) &&
                        !occupied.has(key(inside)) &&
                        !occupied.has(key(outside)) &&
                        KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(outside.x, outside.y)) &&
                        !nativeField.isSpiderlingsWebCell(outside),
                );
        };
        let admission = findAdmission();
        for (let settle = 0; settle < 20 && !admission; settle++) {
            await advance();
            admission = findAdmission();
        }
        expect(admission, "Prepared passage has no free native entrance");
        KDMovePlayer(admission.outside.x, admission.outside.y, false);
        const beforeActions = row.actions.length;
        KinkyDungeonMove(
            { x: admission.inside.x - admission.outside.x, y: admission.inside.y - admission.outside.y },
            1,
            false,
            true,
        );
        await frame();
        tick++;
        recordTurn();
        expect(interior.has(key(KinkyDungeonPlayerEntity)), "Native movement did not enter the prepared passage");
        row.admission = { ...admission, beforeActions };
        for (let step = 0; step < 45 && !Spiderlings.SpinnerCapture.state(); step++) {
            await advance();
            field = fieldFor(plan);
            if (!row.sealedReload && field?.phase === "sealed") {
                row.sealedReload = true;
                await snapshotReload("sealed passage");
            }
        }
        if (!Spiderlings.SpinnerCapture.state()) {
            row.captureFailure = KDMapData.Entities.filter((entry) => entry.Enemy.name === "Spinner").map((actor) => {
                const assignment = state().ai.groups[plan.groupId].assignments[actor.id];
                const target = assignment?.workCell;
                return {
                    actor: copy(actor),
                    assignment: copy(assignment),
                    snapshot: target && nativeField.snapshot(target),
                    path:
                        target &&
                        KinkyDungeonFindPath(
                            actor.x,
                            actor.y,
                            target.x,
                            target.y,
                            true,
                            false,
                            false,
                            KinkyDungeonMovableTilesEnemy,
                            undefined,
                            undefined,
                            undefined,
                            actor,
                        ),
                };
            });
        }
        expect(Spiderlings.SpinnerCapture.state(), "Prey inside a naturally selected passage was not captured");
        const closure = row.actions
            .slice(beforeActions)
            .filter((entry) => entry.result.applied && /close|connect/i.test(entry.action.type));
        expect(closure.length > 0, "Passage sealed without paid native closure");
        expect(
            row.melee.some(
                (entry) =>
                    entry.after &&
                    Math.max(
                        Math.abs(entry.sourceCell.x - entry.playerCell.x),
                        Math.abs(entry.sourceCell.y - entry.playerCell.y),
                    ) <= 1,
            ),
            "Capture did not begin from adjacent native Spinner melee",
        );
        row.capture = {
            phase: Spiderlings.SpinnerCapture.phase(),
            state: copy(Spiderlings.SpinnerCapture.state()),
            closure,
        };
        projectionAudit();
        await new Promise((resolve) => setTimeout(resolve, 700));
        KinkyDungeonShowInventory = inventoryWasOpen;
        images[`${row.mode}-sealed-capture`] = await photo();
    }
    async function preview(label, center) {
        await frame();
        await frame();
        const saved = save();
        KDMovePlayer(center.x, center.y, false);
        await new Promise((resolve) => setTimeout(resolve, 700));
        images[label] = await photo();
        restore(saved);
    }
    async function gateBypass(plan) {
        const field = fieldFor(plan),
            mouths = gateCells(field);
        const interior = new Set(field.interiorCells.map(key));
        const occupied = new Set(KDMapData.Entities.filter((entry) => entry.hp > 0).map(key));
        const bypass = mouths
            .flatMap((from) => mouths.map((to) => ({ from, to })))
            .find(
                ({ from, to }) =>
                    key(from) !== key(to) &&
                    Math.max(Math.abs(from.x - to.x), Math.abs(from.y - to.y)) === 1 &&
                    !occupied.has(key(from)) &&
                    !occupied.has(key(to)) &&
                    !interior.has(key(from)) &&
                    !interior.has(key(to)),
            );
        if (!bypass) {
            row.gateBypass = { available: false };
            return;
        }
        await frame();
        await frame();
        const saved = save();
        KDMovePlayer(bypass.from.x, bypass.from.y, false);
        KinkyDungeonMove({ x: bypass.to.x - bypass.from.x, y: bypass.to.y - bypass.from.y }, 1, false, true);
        await frame();
        tick++;
        recordTurn();
        expect(key(KinkyDungeonPlayerEntity) === key(bypass.to), "Native exterior-mouth movement was not walkable");
        expect(
            !state().topology.composites[plan.compositeId].closureArmed,
            "Crossing between exterior gate cells armed capture without entering the interior",
        );
        expect(!Spiderlings.SpinnerCapture.state(), "Exterior gate bypass triggered capture");
        row.gateBypass = { available: true, ...bypass };
        restore(saved);
    }
    async function breachAndRepair(plan) {
        Spiderlings.SpinnerCapture.cancel();
        await frame();
        await frame();
        const sealedCheckpoint = save();
        const sources = KDMapData.Entities.filter((entry) => entry.Enemy.name === "Spinner");
        for (const source of sources) source.stun = 999;
        const field = fieldFor(plan),
            interior = new Set(field.interiorCells.map(key));
        const mouth = gateCells(field)
            .flatMap((gate) => adjacent(gate).map((inside) => ({ gate, inside })))
            .find(
                ({ gate, inside }) =>
                    interior.has(key(inside)) &&
                    nativeField.isSpiderlingsWebCell(gate) &&
                    !KDMapData.Entities.some((entry) => entry.hp > 0 && key(entry) === key(inside)),
            );
        expect(mouth, "Sealed passage has no interior approach to a breakable mouth");
        KDMovePlayer(mouth.inside.x, mouth.inside.y, false);
        KDSetWeapon(null);
        KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
        const nativeDirection = { x: mouth.gate.x - mouth.inside.x, y: mouth.gate.y - mouth.inside.y };
        let attacks = 0;
        while (nativeField.isSpiderlingsWebCell(mouth.gate) && attacks < 20) {
            KinkyDungeonMove(nativeDirection, 1, true, true);
            await frame();
            tick++;
            recordTurn();
            attacks++;
        }
        expect(attacks > 0 && attacks < 20, "Native unarmed movement attacks could not breach the passage");
        projectionAudit();
        for (let step = 0; step < 4 && key(KinkyDungeonPlayerEntity) !== key(mouth.gate); step++) {
            KinkyDungeonMove(nativeDirection, 1, false, true);
            await frame();
            tick++;
            recordTurn();
        }
        expect(
            key(KinkyDungeonPlayerEntity) === key(mouth.gate),
            "Player could not walk into the actual native breach",
        );
        const outside = adjacent(mouth.gate).find(
            (cell) =>
                !interior.has(key(cell)) &&
                key(cell) !== key(mouth.inside) &&
                KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y)) &&
                !nativeField.isSpiderlingsWebCell(cell),
        );
        expect(outside, "Breach has no exterior continuation");
        KinkyDungeonMove(
            { x: outside.x - KinkyDungeonPlayerEntity.x, y: outside.y - KinkyDungeonPlayerEntity.y },
            1,
            false,
            true,
        );
        await frame();
        tick++;
        recordTurn();
        expect(
            key(KinkyDungeonPlayerEntity) === key(outside),
            "Native breach route did not lead outside the capture region",
        );
        row.breach = { mouth, attacks, outside, phase: fieldFor(plan).phase };
        await new Promise((resolve) => setTimeout(resolve, 700));
        images["passage-breached"] = await photo();
        await snapshotReload("escaped breached passage");
        // Escaping through a guarded mouth may kill its Spinner. Restore the
        // sealed checkpoint for the independent native repair branch.
        restore(sealedCheckpoint);
        const damagedProxy = KDMapData.Entities.find(
            (entry) => nativeField.isOwnedProxy(entry) && key(entry) === key(mouth.gate),
        );
        const originalHP = damagedProxy.hp;
        KinkyDungeonDamageEnemy(
            damagedProxy,
            { damage: 0.5, type: "slash", nocrit: true },
            true,
            true,
            undefined,
            undefined,
            KinkyDungeonPlayerEntity,
        );
        expect(
            damagedProxy.hp > 0 && damagedProxy.hp < originalHP,
            "Native repair fixture did not damage a surviving gate",
        );
        const gate = fieldFor(plan).gates.find((entry) => entry.cells.some((cell) => key(cell) === key(mouth.gate)));
        const currentLink = () => state().topology.links.find((link) => link.id === gate.linkId);
        const damagedHP = currentLink().hp;
        KDMovePlayer(2, 2, false);
        const before = row.actions.length;
        for (let step = 0; step < 60 && currentLink().hp < currentLink().maxHp; step++) await advance();
        const paid = row.actions
            .slice(before)
            .filter((entry) => entry.result.applied && entry.action.type.startsWith("repair"));
        expect(
            currentLink().hp === currentLink().maxHp && paid.length > 0,
            "Workers did not spend native work to repair a damaged gate",
        );
        row.repaired = { damagedHP, finalHP: currentLink().hp, paid, phase: fieldFor(plan).phase };
        projectionAudit();
    }
    try {
        for (const blockerX of [20, 40]) {
            setup(`passage-reachable-${blockerX}`);
            KDMapData.GridWidth = 65;
            KDMapData.GridHeight = 15;
            KDMapData.Grid =
                Array.from({ length: 15 }, (_, y) =>
                    Array.from({ length: 65 }, (_, x) =>
                        ((x >= 2 && x <= 7) || (x >= 57 && x <= 62)) && y >= 4 && y <= 10
                            ? "0"
                            : x >= 7 && x <= 57 && y === 7
                              ? "0"
                              : "1",
                    ).join(""),
                ).join("\n") + "\n";
            KDMapData.Tiles = {};
            KDMapData.StartPosition = { x: 3, y: 7 };
            KDMapData.EndPosition = { x: 61, y: 7 };
            KDMapData.ShortcutPositions = {};
            KDMapData.JailPoints = [];
            KDPathCache = new Map();
            KDPathCacheIgnoreLocks = new Map();
            const worker = spawn("Spinner", 60, 7);
            const blocker = spawn("Maidforce", blockerX, 7);
            worker.aware = false;
            worker.vp = 0;
            KDUpdateEnemyCache = true;
            ai.beginTurn({ activate: true });
            const plan = passagePlans()[0];
            expect(plan?.proof.kind === "mandatory", `Blocker at ${blockerX} hid all reachable native passages`);
            const gates = plan.gates.flatMap((gate) => gate.cells);
            expect(
                gates.every((cell) => cell.x > blockerX),
                "Selected passage lies beyond the occupied corridor",
            );
            expect(
                gates.some(
                    (cell) =>
                        KinkyDungeonFindPath(
                            worker.x,
                            worker.y,
                            cell.x,
                            cell.y,
                            true,
                            false,
                            false,
                            KinkyDungeonMovableTilesEnemy,
                            undefined,
                            undefined,
                            undefined,
                            worker,
                        )?.length,
                ),
                "Selected passage has no native actor-blocking approach",
            );
            rows.push({
                mode: "reachable-shortlist",
                blocker: { id: blocker.id, x: blockerX, y: 7 },
                plan: copy(plan),
            });
        }
        if (modes.includes("crowding")) {
            const actors = terrain("crowding"),
                ids = actors.map((actor) => actor.id);
            expect(
                row.initialActors.every((initial) =>
                    actors.some((actor) => actor.id === initial.id && actor.x === initial.x && actor.y === initial.y),
                ),
                "Staffing a crowded field moved an actor before a paid native turn",
            );
            const staffingAudit = () => {
                const groups = Object.values(state().ai.groups),
                    active = groups.filter((group) => {
                        const plan = state().ai.plans[group.planId];
                        return plan && !["invalid", "abandoned"].includes(plan.status);
                    });
                expect(active.length > 0, "Crowding fixture has no naturally planned field");
                expect(
                    active.every((group) => {
                        const plan = state().ai.plans[group.planId];
                        return (
                            group.staffing.capacity <= 8 &&
                            (plan.kind !== "passage" ||
                                plan.interiorCells.length >= 4 ||
                                group.staffing.capacity <= 2) &&
                            group.memberIds.length - group.staffing.busy <= group.staffing.capacity
                        );
                    }),
                    "A small native field recruited more workers than its legal space supports",
                );
                expect(
                    ids.every((id) => KDMapData.Entities.some((actor) => actor.id === id && actor.hp > 0)),
                    "Crowding was reduced by removing an existing Spinner",
                );
                const plans = active.map((group) => state().ai.plans[group.planId]);
                expect(
                    plans.every((plan, index) =>
                        plans.slice(index + 1).every((other) => !other.cells.some((cell) => plan.cells.includes(cell))),
                    ),
                    "Excess workers selected an overlapping field",
                );
                (row.staffing ||= []).push(copy(groups));
            };
            staffingAudit();
            for (let step = 0; step < 12; step++) {
                await advance();
                staffingAudit();
            }
            await snapshotReload("crowded field dispatch");
            staffingAudit();
            expect(
                row.moves?.some((move) => move.result),
                "Dispatched workers never used native movement",
            );
        }
        for (const mode of modes.filter((entry) => entry !== "breach" && entry !== "crowding")) {
            terrain(mode);
            const plan = await ready();
            const field = fieldFor(plan);
            expect(
                field.kind === "passage" && gateCells(field).length >= 2,
                "Natural plan is not a multi-mouth capture passage",
            );
            expect(
                gateCells(field).every((cell) => !nativeField.isSpiderlingsWebCell(cell)),
                "Prepared passage sealed a mouth before prey entry",
            );
            row.openPath = pathAcross();
            expect(row.openPath?.length, "Prepared passage blocks the original through-route");
            row.readyPlan = copy(plan);
            row.readyField = copy(field);
            if (plan.proof?.kind === "mandatory")
                expect(
                    plan.proof.interiorBypassDistance === null && plan.proof.blockedGateDistance === null,
                    "Mandatory route claim ignores a native exterior bypass",
                );
            if (mode === "junction") await gateBypass(plan);
            projectionAudit();
            if (mode === "recruitment") {
                const distantIds = row.initialActors.filter((actor) => actor.x > 14).map((actor) => actor.id);
                const converged = () => {
                    const group = state().ai.groups[plan.groupId];
                    return (
                        distantIds.every((id) => group.memberIds.includes(id)) &&
                        group.memberIds.every((id) => {
                            const assignment = group.assignments[id],
                                actor = KDMapData.Entities.find((entry) => entry.id === id);
                            return assignment?.type === "rally" && actor && key(actor) === key(assignment.workCell);
                        })
                    );
                };
                for (let step = 0; step < 60 && !converged(); step++) await advance();
                expect(converged(), "Recruited colleagues did not finish walking to their assigned waiting mouths");
                expect(
                    state().ai.groups[plan.groupId].memberIds.length <=
                        state().ai.groups[plan.groupId].staffing.capacity,
                    "Recruitment exceeded the shared passage's legal worker capacity",
                );
                row.recruited = { ids: distantIds, group: copy(state().ai.groups[plan.groupId]) };
            }
            await cacheCheck();
            await preview(`${mode}-prepared`, plan.center);
            if (mode === "corridor" || mode === "recruitment") await enterAndCapture(plan);
            if (mode === "recruitment") {
                // Only six paid actions are needed at a two-mouth site; nearby
                // members may finish them before recruited workers arrive.
                const participants = new Set(
                    row.actions
                        .filter((entry) => entry.result.applied && entry.action.fieldId === plan.fieldId)
                        .map((entry) => entry.source),
                );
                expect(participants.size >= 2, "Shared passage was not prepared and closed by multiple native workers");
                row.recruited.participants = [...participants];
            }
            if (mode === "junction") {
                const before = state().ai.passageMetrics.analysisBuilds;
                KinkyDungeonMapSet(14, 7, "1");
                await advance();
                const rebuilt = state().ai.passageMetrics.analysisBuilds;
                for (let step = 0; step < 4; step++) await advance();
                expect(
                    rebuilt === before + 1 && state().ai.passageMetrics.analysisBuilds === rebuilt,
                    "One terrain edit did not produce exactly one analysis rebuild",
                );
                row.changedTerrain = { before, rebuilt, after: state().ai.passageMetrics.analysisBuilds };
            }
        }
        if (modes.includes("breach")) {
            terrain("breach");
            const plan = await ready();
            for (let settle = 0; settle < 20; settle++) await advance();
            await enterAndCapture(plan);
            await breachAndRepair(plan);
            row.final = copy(state());
        }
    } finally {
        KinkyDungeonShowInventory = inventoryWasOpen;
        KDModSettings.Spiderlings.spiderlingsPinkWebbing = previousPink;
        nativeField.applyPaidAction = nativeAction;
        KDPlayerEffects.SpiderlingsWebbingEnemyBind = nativeHit;
        KinkyDungeonEnemyTryMove = nativeMove;
    }
    return { rows, images };
})();
