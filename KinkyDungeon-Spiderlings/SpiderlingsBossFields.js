"use strict";

// Authored inward rings still use native topology, real workers and paid work.
(() => {
    const api = globalThis.Spiderlings;
    const GROUP = "spiderlings-boss-court";
    // The outermost ring stands on the arena edge; the last one leaves a 9x9 interior.
    const RADII = [11, 10, 9, 8, 7, 6, 5];
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const state = () => api.BossEncounter?.state();
    const group = () => `${GROUP}:${api.BossRoom.state().attempts}`;
    const idFor = (index) => `${group()}:radius-${RADII[index]}`;
    const owners = () =>
        (state()?.builderIds || []).filter((id) => KDMapData.Entities.some((enemy) => enemy.id === id && enemy.hp > 0));
    function addRing(index, ids) {
        const center = api.BossRoom.CENTER,
            radius = RADII[index];
        const left = center.x - radius,
            right = center.x + radius,
            top = center.y - radius,
            bottom = center.y + radius;
        const map = api.SpinnerNativeField.mapSnapshot();
        const plan = api.SpinnerNativeField.addEnclosure({
            compositeId: idFor(index),
            groupId: group(),
            owners: ids,
            autoSeal: true,
            layers: [
                {
                    id: `${idFor(index)}:layer`,
                    maxDimension: 27,
                    vertices: [
                        { x: left, y: top },
                        { x: right, y: top },
                        { x: right, y: bottom },
                        { x: left, y: bottom },
                    ],
                    core: { ...center },
                    gate: { x: right, y: center.y },
                },
            ],
            // Anyone standing on the line only delays that cell; the ring is still planned.
            map: {
                ...map,
                occupied: [],
                protected: map.protected.filter((cell) => cell !== `${center.x},${center.y}`),
            },
        });
        return plan.added;
    }
    function initialize() {
        const saved = state(),
            ids = owners();
        if (!saved || !ids.length) return;
        saved.ringIndex ||= 0;
        api.FieldCommand.syncManagedCrew(group(), saved.ringsComplete ? [] : ids);
        if (!api.SpinnerNativeField.compositeById(idFor(0))) addRing(0, ids);
    }
    // The ring under construction, or the innermost one once all are closed.
    function currentRadius() {
        const saved = state();
        if (!saved) return RADII[0];
        return saved.ringsComplete ? RADII.at(-1) : RADII[Math.min(saved.ringIndex || 0, RADII.length - 1)];
    }
    function advance() {
        const saved = state(),
            ids = owners();
        if (!saved || saved.phase === "victory" || saved.ringsComplete || !ids.length) return;
        initialize();
        const current = api.SpinnerNativeField.compositeById(idFor(saved.ringIndex));
        const graph = api.SpinnerNativeField.state()?.topology;
        if (!current || !graph) return;
        for (const id of current.layerIds) api.SpinnerNativeField.setOwners(id, ids);
        if (!current.layerIds.every((id) => api.SpinnerTopology.isLayerClosed(graph, id))) return;
        if (saved.ringIndex < RADII.length - 1) {
            if (api.SpinnerNativeField.compositeById(idFor(saved.ringIndex + 1)) || addRing(saved.ringIndex + 1, ids))
                saved.ringIndex++;
        } else {
            saved.ringsComplete = true;
            api.FieldCommand.syncManagedCrew(group(), []);
        }
    }
    // Once per world turn, pair each able builder with remaining work, closest pair first,
    // so the last cells and the gate go to whoever is nearest instead of by roster order.
    let plan;
    function assignments(saved, graph, ring) {
        if (plan?.clock === saved.clock && plan.ring === ring.id && plan.graph === graph) return plan.actions;
        const actions = new Map(),
            reserved = [],
            pending = owners()
                .map((id) => KDMapData.Entities.find((actor) => actor.id === id))
                .filter((worker) => !KinkyDungeonIsDisabled(worker) && !KDHelpless(worker));
        while (pending.length) {
            let best;
            for (const worker of pending) {
                const action = api.SpinnerTopology.nextWorkAction(graph, worker.id, worker, reserved, ring.layerIds);
                if (action?.cell && (!best || distance(worker, action.cell) < best.distance))
                    best = { worker, action, distance: distance(worker, action.cell) };
            }
            if (!best) break;
            actions.set(best.worker.id, best.action);
            reserved.push(api.SpinnerTopology.workKey(best.action));
            pending.splice(pending.indexOf(best.worker), 1);
        }
        plan = { clock: saved.clock, ring: ring.id, graph, actions };
        return actions;
    }
    function handleEnemyTurn(enemy, _target, delta) {
        const saved = state();
        if (
            !saved ||
            !saved.builderIds.includes(enemy.id) ||
            saved.ringsComplete ||
            !(delta > 0) ||
            saved.phase === "victory"
        )
            return undefined;
        const result = { idle: false, defeat: false, defeatEnemy: enemy };
        if (KinkyDungeonIsDisabled(enemy) || KDHelpless(enemy)) return result;
        const graph = api.SpinnerNativeField.state()?.topology;
        const ring = graph?.composites?.[idFor(saved.ringIndex || 0)];
        if (!ring) return result;
        const action = assignments(saved, graph, ring).get(enemy.id);
        if (!action?.cell) return result;
        if (distance(enemy, action.cell) <= 1) {
            if (api.SpinnerNativeField.accrueConstructionAction(enemy, delta))
                api.SpinnerNativeField.applyPaidAction(enemy, { ...action, ownerId: enemy.id });
            return result;
        }
        const sites = [];
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const point = { x: action.cell.x + dx, y: action.cell.y + dy };
                const snapshot = api.SpinnerNativeField.snapshot(point);
                if (
                    !snapshot.inBounds ||
                    !snapshot.floor ||
                    snapshot.protected ||
                    (snapshot.actorOccupied && distance(enemy, point))
                )
                    continue;
                sites.push(point);
            }
        const next = sites.length && api.SpinnerAI.occupancyRoute(enemy, sites).find((cell) => distance(enemy, cell));
        if (next)
            KinkyDungeonEnemyTryMove(enemy, { x: next.x - enemy.x, y: next.y - enemy.y }, delta, next.x, next.y, false);
        return result;
    }
    api.NativeActions.registerBehavior("BossFields", { handleEnemyTurn });
    api.BossFields = Object.freeze({
        RADII,
        initialize,
        advance,
        currentRadius,
        ownsComposite: (id) => !!state() && id.startsWith(GROUP + ":"),
    });
})();
