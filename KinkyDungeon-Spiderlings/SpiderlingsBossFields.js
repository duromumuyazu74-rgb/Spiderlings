"use strict";

// Authored inward rings still use native topology, real workers and paid work.
(() => {
    const api = globalThis.Spiderlings;
    const GROUP = "spiderlings-boss-court";
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const state = () => api.BossEncounter?.state();
    const group = () => `${GROUP}:${api.BossRoom.state().attempts}`;
    const idFor = (index) => `${group()}:${index}`;
    const owners = () =>
        (state()?.builderIds || []).filter((id) => KDMapData.Entities.some((enemy) => enemy.id === id && enemy.hp > 0));
    function addRing(index, ids) {
        const center = api.BossRoom.CENTER,
            radius = index ? 9 : 13;
        const left = center.x - radius,
            right = center.x + radius,
            top = center.y - radius,
            bottom = center.y + radius;
        const map = api.SpinnerNativeField.mapSnapshot();
        const plan = api.SpinnerNativeField.addEnclosure({
            compositeId: idFor(index),
            groupId: group(),
            owners: ids,
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
        api.FieldCommand.syncManagedCrew(group(), ids);
        if (!api.SpinnerNativeField.compositeById(idFor(0))) addRing(0, ids);
        saved.ringIndex ||= 0;
    }
    function advance() {
        const saved = state(),
            ids = owners();
        if (!saved || saved.phase === "victory" || !ids.length) return;
        initialize();
        const current = api.SpinnerNativeField.compositeById(idFor(saved.ringIndex));
        const graph = api.SpinnerNativeField.state()?.topology;
        if (!current || !graph) return;
        for (const id of current.layerIds) api.SpinnerNativeField.setOwners(id, ids);
        if (
            saved.ringIndex === 0 &&
            current.layerIds.every((id) => api.SpinnerTopology.isLayerClosed(graph, id)) &&
            addRing(1, ids)
        )
            saved.ringIndex = 1;
    }
    function handleEnemyTurn(enemy, _target, delta) {
        const saved = state();
        if (!saved || !saved.builderIds.includes(enemy.id) || !(delta > 0) || saved.phase === "victory")
            return undefined;
        const result = { idle: false, defeat: false, defeatEnemy: enemy };
        if (KinkyDungeonIsDisabled(enemy) || KDHelpless(enemy)) return result;
        const graph = api.SpinnerNativeField.state()?.topology;
        const ring = graph?.composites?.[idFor(saved.ringIndex || 0)];
        if (!ring) return result;
        const action = api.SpinnerTopology.nextWorkAction(graph, enemy.id, enemy, [], ring.layerIds);
        if (!action?.cell) return saved.ringIndex === 1 ? undefined : result;
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
                    (snapshot.occupied && distance(enemy, point))
                )
                    continue;
                const path = distance(enemy, point)
                    ? KinkyDungeonFindPath(
                          enemy.x,
                          enemy.y,
                          point.x,
                          point.y,
                          false,
                          false,
                          false,
                          KinkyDungeonMovableTilesEnemy,
                          undefined,
                          undefined,
                          undefined,
                          enemy,
                      )
                    : [];
                if (!distance(enemy, point) || path?.length) sites.push({ point, path });
            }
        sites.sort((a, b) => a.path.length - b.path.length);
        const site = sites[0];
        if (!site) return result;
        if (!distance(enemy, site.point)) {
            if (api.SpinnerNativeField.accrueConstructionAction(enemy, delta))
                api.SpinnerNativeField.applyPaidAction(enemy, { ...action, ownerId: enemy.id });
        } else {
            const next = site.path[0];
            if (next)
                KinkyDungeonEnemyTryMove(
                    enemy,
                    { x: next.x - enemy.x, y: next.y - enemy.y },
                    delta,
                    next.x,
                    next.y,
                    false,
                );
        }
        return result;
    }
    api.NativeActions.registerBehavior("BossFields", { handleEnemyTurn });
    api.BossFields = Object.freeze({
        initialize,
        advance,
        ownsComposite: (id) => !!state() && id.startsWith(GROUP + ":"),
    });
})();
