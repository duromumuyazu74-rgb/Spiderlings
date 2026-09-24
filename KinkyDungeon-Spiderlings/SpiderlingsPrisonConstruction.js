"use strict";

// A chamber stay requests real builders; the shared Spinner topology owns the resulting walls.
(() => {
    const api = globalThis.Spiderlings;
    const COMPOSITE = "spiderlings-prison-chamber";
    const TEAM_SIZE = 4;
    const THRESHOLD = 50;
    const cellKey = (cell) => `${cell.x},${cell.y}`;
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const directions = [
        { x: 1, y: 0 },
        { x: -1, y: 0 },
        { x: 0, y: 1 },
        { x: 0, y: -1 },
        { x: 1, y: 1 },
        { x: 1, y: -1 },
        { x: -1, y: 1 },
        { x: -1, y: -1 },
    ];
    const result = (enemy) => ({ idle: false, defeat: false, defeatEnemy: enemy });

    function prison() {
        return api.Prison?.isPrison() ? KDMapData.SpiderlingsPrison : undefined;
    }

    function state() {
        const map = prison();
        if (!map) return undefined;
        map.chamberConstruction ||= {
            version: 1,
            placementOrdinal: 0,
            nextDispatchId: 1,
            stay: null,
            dispatches: [],
            ownerIds: [],
        };
        return map.chamberConstruction;
    }

    function insideChamber() {
        const bounds = prison()?.chamberBounds;
        const player = KinkyDungeonPlayerEntity;
        return (
            !!bounds &&
            player.x >= bounds.left &&
            player.x <= bounds.right &&
            player.y >= bounds.top &&
            player.y <= bounds.bottom
        );
    }

    function onPlaced() {
        const saved = state();
        if (!saved) return false;
        saved.placementOrdinal++;
        saved.stay = {
            placementOrdinal: saved.placementOrdinal,
            elapsed: 0,
            lastTick: KinkyDungeonCurrentTick,
            phase: "counting",
        };
        if (api.SpinnerNativeField.compositeById(COMPOSITE))
            api.SpinnerNativeField.onEntry(
                KinkyDungeonPlayerEntity,
                KinkyDungeonPlayerEntity.x,
                KinkyDungeonPlayerEntity.y,
            );
        return true;
    }

    function chamberMap() {
        const map = api.SpinnerNativeField.mapSnapshot();
        const start = cellKey(prison().chamber);
        return { ...map, protected: map.protected.filter((key) => key !== start) };
    }

    function layer(index) {
        const center = prison().chamber;
        const radius = 3 + index * 3;
        const left = center.x - radius;
        const right = center.x + radius;
        const top = center.y - radius;
        const bottom = center.y + radius;
        return {
            id: `${COMPOSITE}:layer:${index}`,
            vertices: [
                { x: left, y: top },
                { x: right, y: top },
                { x: right, y: bottom },
                { x: left, y: bottom },
            ],
            core: { ...center },
            gate: { x: right, y: center.y },
        };
    }

    function livingOwners(saved) {
        const actors = new Map(
            KDMapData.Entities.filter((enemy) => enemy.hp > 0).map((enemy) => [String(enemy.id), enemy]),
        );
        saved.ownerIds = saved.ownerIds.filter((id) => actors.get(String(id))?.Enemy?.name === "Spinner");
        return saved.ownerIds.map((id) => actors.get(String(id)));
    }

    function populationSlots() {
        const cap = api.getMapPopulationCap?.() ?? 0;
        if (cap === 0) return Infinity;
        const living = KDMapData.Entities.filter(
            (enemy) =>
                enemy.hp > 0 &&
                ["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"].includes(enemy.Enemy?.name),
        ).length;
        return Math.max(0, cap - living);
    }

    function spawnBuilder() {
        if (populationSlots() <= 0 || KDMapData.Entities.length >= 300) return undefined;
        const main = prison().mainNest;
        for (const [dx, dy] of [
            [-3, -4],
            [3, -4],
            [-3, 4],
            [3, 4],
            [-5, 0],
            [5, 0],
            [-4, -3],
            [4, 3],
        ]) {
            const x = main.x + dx;
            const y = main.y + dy;
            if (!KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(x, y)) || KinkyDungeonEntityAt(x, y))
                continue;
            const created = KinkyDungeonSummonEnemy(
                x,
                y,
                "Spinner",
                1,
                0,
                false,
                undefined,
                false,
                false,
                "Enemy",
                true,
                undefined,
                false,
                true,
            );
            if (created?.length === 1 && created[0].x === x && created[0].y === y) {
                created[0].SpiderlingsNestParentID = prison().mainNestIds?.[0];
                return created[0];
            }
        }
        return undefined;
    }

    function claimTeam(saved, dispatch) {
        const existing = new Set(livingOwners(saved).map((enemy) => String(enemy.id)));
        const claimed = new Set(saved.dispatches.flatMap((team) => team.memberIds).map(String));
        const main = prison().mainNest;
        const candidates = KDMapData.Entities.filter(
            (enemy) =>
                enemy.hp > 0 && enemy.Enemy?.name === "Spinner" && KDHostile(enemy) && !claimed.has(String(enemy.id)),
        ).sort((a, b) => distance(a, main) - distance(b, main) || String(a.id).localeCompare(String(b.id)));
        while (candidates.length < TEAM_SIZE && populationSlots() > 0) {
            const actor = spawnBuilder();
            if (!actor) break;
            candidates.push(actor);
        }
        const selected = candidates.slice(0, TEAM_SIZE);
        for (const actor of livingOwners(saved)) {
            if (selected.length >= TEAM_SIZE) break;
            if (!selected.some((candidate) => String(candidate.id) === String(actor.id))) selected.push(actor);
        }
        if (selected.length < TEAM_SIZE) return false;
        dispatch.memberIds = selected.map((actor) => actor.id);
        for (const actor of selected) {
            actor.SpiderlingsChamberBuilder = { dispatchId: dispatch.id, reachedNest: distance(actor, main) <= 5 };
            if (!existing.has(String(actor.id))) saved.ownerIds.push(actor.id);
        }
        return true;
    }

    function syncOwners(saved) {
        const ids = livingOwners(saved).map((enemy) => enemy.id);
        const composite = api.SpinnerNativeField.compositeById(COMPOSITE);
        if (composite)
            for (const fieldId of composite.layerIds) {
                const current = api.SpinnerNativeField.state().topology.fieldOwners[fieldId] || [];
                if (current.length !== ids.length || current.some((id, index) => id !== ids[index]))
                    api.SpinnerNativeField.setOwners(fieldId, ids);
            }
        return ids;
    }

    function ensureField(saved) {
        const owners = syncOwners(saved);
        if (owners.length < TEAM_SIZE) return false;
        if (api.SpinnerNativeField.compositeById(COMPOSITE)) return true;
        const added = api.SpinnerNativeField.addEnclosure({
            compositeId: COMPOSITE,
            groupId: COMPOSITE,
            owners,
            layers: [layer(0)],
            map: chamberMap(),
        });
        if (added.added)
            api.SpinnerNativeField.onEntry(
                KinkyDungeonPlayerEntity,
                KinkyDungeonPlayerEntity.x,
                KinkyDungeonPlayerEntity.y,
            );
        return added.added;
    }

    function extendWhileHeld(saved) {
        const composite = api.SpinnerNativeField.compositeById(COMPOSITE);
        const graph = api.SpinnerNativeField.state()?.topology;
        if (!composite || !graph || livingOwners(saved).length < TEAM_SIZE) return;
        const outer = composite.layerIds.at(-1);
        if (!api.SpinnerTopology.isLayerClosed(graph, outer)) return;
        api.SpinnerNativeField.extendEnclosure({
            compositeId: COMPOSITE,
            layer: layer(composite.layerIds.length),
            owners: saved.ownerIds,
            map: chamberMap(),
        });
    }

    function afterTurn(delta) {
        const saved = state();
        if (!saved || !(delta > 0)) return;
        if (!saved.stay && insideChamber()) onPlaced();
        const stay = saved.stay;
        if (!stay || stay.phase === "left") return;
        if (!insideChamber()) {
            stay.phase = "left";
            return;
        }
        if (stay.lastTick !== KinkyDungeonCurrentTick) {
            stay.elapsed += delta;
            stay.lastTick = KinkyDungeonCurrentTick;
        }
        if (stay.phase === "counting" && stay.elapsed >= THRESHOLD) {
            stay.phase = "triggered";
            saved.dispatches.push({
                id: saved.nextDispatchId++,
                placementOrdinal: stay.placementOrdinal,
                memberIds: [],
            });
        }
        if (stay.phase !== "triggered") return;
        const dispatch = saved.dispatches.at(-1);
        if (
            dispatch &&
            dispatch.memberIds.filter((id) => KDMapData.Entities.some((enemy) => enemy.id === id && enemy.hp > 0))
                .length < TEAM_SIZE
        )
            claimTeam(saved, dispatch);
        if (ensureField(saved)) extendWhileHeld(saved);
    }

    function passable(cell) {
        return (
            cell.x > 0 &&
            cell.y > 0 &&
            cell.x < KDMapData.GridWidth - 1 &&
            cell.y < KDMapData.GridHeight - 1 &&
            KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y))
        );
    }

    function pathTo(enemy, destination) {
        const start = cellKey(enemy);
        const goal = cellKey(destination);
        if (start === goal) return [];
        const nativePath = KinkyDungeonFindPath(
            enemy.x,
            enemy.y,
            destination.x,
            destination.y,
            false,
            false,
            false,
            KinkyDungeonMovableTilesEnemy,
            undefined,
            undefined,
            undefined,
            enemy,
        );
        if (nativePath?.length && nativePath.every((cell) => passable(cell) && !KinkyDungeonEntityAt(cell.x, cell.y)))
            return nativePath;
        const queue = [{ x: enemy.x, y: enemy.y }];
        const parents = new Map([[start, null]]);
        for (let index = 0; index < queue.length && !parents.has(goal); index++) {
            const current = queue[index];
            for (const step of directions) {
                const next = { x: current.x + step.x, y: current.y + step.y };
                if (!passable(next)) continue;
                if (
                    step.x &&
                    step.y &&
                    (!passable({ x: current.x + step.x, y: current.y }) ||
                        !passable({ x: current.x, y: current.y + step.y }))
                )
                    continue;
                const occupant = KinkyDungeonEntityAt(next.x, next.y);
                let landing = next;
                let via;
                if (occupant) {
                    if (!api.SpinnerNativeField.canTraverse(enemy, occupant)) continue;
                    const beyond = { x: next.x + step.x, y: next.y + step.y };
                    landing = { x: beyond.x + step.x, y: beyond.y + step.y };
                    via = [next, beyond];
                    if (
                        !passable(beyond) ||
                        KinkyDungeonEntityAt(beyond.x, beyond.y) ||
                        !passable(landing) ||
                        KinkyDungeonEntityAt(landing.x, landing.y)
                    )
                        continue;
                }
                const key = cellKey(landing);
                if (parents.has(key)) continue;
                parents.set(key, { from: cellKey(current), via });
                queue.push(landing);
            }
        }
        if (!parents.has(goal)) return [];
        const path = [];
        for (let key = goal; key !== start; key = parents.get(key).from) {
            const [x, y] = key.split(",").map(Number);
            path.push({ x, y });
            if (parents.get(key).via) path.push(...parents.get(key).via.slice().reverse());
        }
        return path.reverse();
    }

    function moveToward(enemy, destination, delta) {
        const next = pathTo(enemy, destination).find((cell) => cell.x !== enemy.x || cell.y !== enemy.y);
        if (!next) return false;
        const occupant = KinkyDungeonEntityAt(next.x, next.y);
        if (occupant && !api.SpinnerNativeField.canTraverse(enemy, occupant)) return false;
        KinkyDungeonEnemyTryMove(enemy, { x: next.x - enemy.x, y: next.y - enemy.y }, delta, next.x, next.y, false);
        return true;
    }

    function workSite(enemy, cell) {
        const sites = [];
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const candidate = { x: cell.x + dx, y: cell.y + dy };
                const snapshot = api.SpinnerNativeField.snapshot(candidate);
                if (!snapshot.inBounds || !snapshot.floor || snapshot.protected) continue;
                if (snapshot.occupied && distance(enemy, candidate) > 0) continue;
                const path = pathTo(enemy, candidate);
                if (path.length || distance(enemy, candidate) === 0)
                    sites.push({ cell: candidate, steps: path.length });
            }
        sites.sort((a, b) => a.steps - b.steps || cellKey(a.cell).localeCompare(cellKey(b.cell)));
        return sites[0]?.cell;
    }

    function handleEnemyTurn(enemy, target, delta) {
        const saved = state();
        const marker = enemy?.SpiderlingsChamberBuilder;
        if (!saved || !marker || !saved.ownerIds.includes(enemy.id) || !(enemy.hp > 0)) return undefined;
        if (KinkyDungeonIsDisabled(enemy) || KDHelpless(enemy)) return result(enemy);
        if (enemy.aware && target?.hp > 0 && KDHostile(enemy, target) && distance(enemy, target) <= 2) return undefined;
        if (!marker.reachedNest) {
            if (distance(enemy, prison().mainNest) <= 5) marker.reachedNest = true;
            else {
                moveToward(enemy, prison().mainNest, delta);
                return result(enemy);
            }
        }
        const graph = api.SpinnerNativeField.state()?.topology;
        if (!graph?.composites?.[COMPOSITE]) return undefined;
        const action = api.SpinnerTopology.nextWorkAction(graph, enemy.id, enemy, [], COMPOSITE);
        if (!action?.cell) return undefined;
        const site = workSite(enemy, action.cell);
        if (!site) return result(enemy);
        if (distance(enemy, site) > 0) moveToward(enemy, site, delta);
        else if (api.SpinnerNativeField.accrueConstructionAction(enemy, delta))
            api.SpinnerNativeField.applyPaidAction(enemy, { ...action, ownerId: enemy.id });
        return result(enemy);
    }

    if (typeof KDEventMapGeneric !== "undefined" && typeof KDAddEvent === "function") {
        KDAddEvent(KDEventMapGeneric, "tickAfter", "SpiderlingsPrisonConstruction", (_event, data) =>
            afterTurn(data?.delta),
        );
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", "SpiderlingsPrisonConstruction", () => {
            const saved = state();
            if (saved) syncOwners(saved);
        });
    }
    api.PrisonConstruction = Object.freeze({
        COMPOSITE,
        THRESHOLD,
        onPlaced,
        afterTurn,
        handleEnemyTurn,
        layer,
        state,
    });
})();
