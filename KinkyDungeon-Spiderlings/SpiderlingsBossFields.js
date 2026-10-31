"use strict";

// Authored inward rings still use native topology, real workers and paid work.
(() => {
    const api = globalThis.Spiderlings;
    const GROUP = "spiderlings-boss-court";
    const RADII = [13, 12, 11, 10, 9, 8, 7, 6, 5];
    const STATIONS = [
        [-1, -1],
        [0, -1],
        [1, -1],
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
    ];
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const state = () => api.BossEncounter?.state();
    const group = () => `${GROUP}:${api.BossRoom.state().attempts}`;
    // Preserve the two paid rings from test.14; new intermediate rings have radius-based IDs.
    const idFor = (index) =>
        `${group()}:${RADII[index] === 13 ? 0 : RADII[index] === 9 ? 1 : "radius-" + RADII[index]}`;
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
            map: { ...map, protected: map.protected.filter((cell) => cell !== `${center.x},${center.y}`) },
        });
        return plan.added;
    }
    function initialize() {
        const saved = state(),
            ids = owners();
        if (!saved || !ids.length) return;
        if (saved.ringLayout !== 2) {
            saved.ringLayout = 2;
            saved.ringIndex = 0;
            saved.ringsComplete = false;
        }
        api.FieldCommand.syncManagedCrew(group(), saved.ringsComplete ? [] : ids);
        if (!api.SpinnerNativeField.compositeById(idFor(0))) addRing(0, ids);
        saved.ringIndex ||= 0;
    }
    function advance() {
        const saved = state(),
            ids = owners();
        if (!saved || saved.phase === "victory" || saved.ringsComplete || !ids.length) return;
        initialize();
        const current = api.SpinnerNativeField.compositeById(idFor(saved.ringIndex));
        const graph = api.SpinnerNativeField.state()?.topology;
        if (!current || !graph) return;
        // Existing test.14 saves used prey-triggered gates, which can stall outside the ring.
        api.SpinnerNativeField.sealEnclosure(current.id);
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
        const reserved = [];
        let action;
        for (const id of owners()) {
            const worker = KDMapData.Entities.find((actor) => actor.id === id);
            if (KinkyDungeonIsDisabled(worker) || KDHelpless(worker)) continue;
            const index = saved.builderIds.indexOf(id),
                [dx, dy] = STATIONS[index],
                radius = RADII[saved.ringIndex],
                center = api.BossRoom.CENTER,
                station = { x: center.x + dx * radius, y: center.y + dy * radius };
            const assigned = api.SpinnerTopology.nextWorkAction(graph, id, station, reserved, ring.layerIds);
            if (assigned) reserved.push(api.SpinnerTopology.workKey(assigned));
            if (id === enemy.id) {
                action = assigned;
                break;
            }
        }
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
        initialize,
        advance,
        ownsComposite: (id) => !!state() && id.startsWith(GROUP + ":"),
    });
})();
