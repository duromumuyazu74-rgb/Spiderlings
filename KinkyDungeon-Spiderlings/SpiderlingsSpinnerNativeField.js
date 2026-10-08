"use strict";

// KD 5.5 adapter for the JSON Spinner topology. The topology owns truth; enemies are attackable projections.
(() => {
    const api = globalThis.Spiderlings,
        KEY = "SpiderlingsSpinnerEncounter",
        PROXY = "SpiderlingsSpinnerTrap",
        LEGACY_PROXY = "SpiderlingsSpinnerWebCell",
        PATH = "SpiderlingsWebTraversal";
    const topology = () => api.SpinnerTopology;
    const state = (map = KDMapData) => map?.[KEY];
    const cellKey = (cell) => `${cell.x},${cell.y}`;
    const result = (enemy) => ({ idle: false, defeat: false, defeatEnemy: enemy });
    let activeMove;
    const artworkByGraph = new WeakMap();
    const preparedByGraph = new WeakMap();

    function fieldById(encounter, fieldId) {
        const graph = encounter?.topology;
        if (!graph || !fieldId) return undefined;
        if (graph.fields?.[fieldId] || (graph.fieldId === fieldId && !graph.lineFields?.[fieldId])) return graph;
        const line = graph.lineFields?.[fieldId];
        if (!line || line.retired) return undefined;
        return {
            ...graph,
            fieldId,
            kind: "line",
            owners: [...(graph.fieldOwners?.[fieldId] || [])],
            anchors: graph.anchors.filter((anchor) => anchor.owners.includes(fieldId)),
            links: graph.links.filter((link) => link.owners.includes(fieldId)),
            junctions: graph.junctions.filter((junction) => junction.owners.includes(fieldId)),
            collapsed: false,
        };
    }

    function isSpiderling(entity) {
        return entity?.Enemy?.tags?.spiderlings === true;
    }

    function proxyMarker(entity) {
        return entity?.SpiderlingsSpinnerProxy;
    }

    function isOwnedProxy(entity) {
        return [PROXY, LEGACY_PROXY].includes(entity?.Enemy?.name) && !!proxyMarker(entity);
    }

    function invalidateNavigation() {
        KDUpdateEnemyCache = true;
        KDPathCache = new Map();
        KDPathCacheIgnoreLocks = new Map();
        api.WebMobility?.invalidateNavigation(true);
    }

    function hpAtCell(field, physical, property = "hp") {
        const anchorHP = physical.anchorIds.map(
                (id) => field.anchors.find((anchor) => anchor.id === id)?.[property] || 0,
            ),
            linkHP = physical.linkIds.map((id) => field.links.find((link) => link.id === id)?.[property] || 0);
        return Math.max(0, ...anchorHP, ...linkHP);
    }

    function syncProxyHP(enemy, field, physical) {
        const definition = KinkyDungeonEnemies.find((entry) => entry.name === PROXY);
        const maxhp = hpAtCell(field, physical, "maxHp");
        // Native bars and tooltips read Enemy.maxhp, not the entity's maxhp.
        // Each web cell can project structures of different lengths/durability.
        if (enemy.Enemy?.name !== PROXY || enemy.Enemy.maxhp !== maxhp) enemy.Enemy = { ...definition, maxhp };
        // KDUnPackEnemy otherwise replaces the per-cell definition on native refresh/load.
        enemy.modified = true;
        enemy.hp = hpAtCell(field, physical);
        enemy.maxhp = maxhp;
    }

    function createProxy(field, physical) {
        // DialogueCreateEnemy kicks an occupant before spawning. A web is allowed under a spider.
        const addEntity = globalThis.KDAddNewEntity || globalThis.KDAddEntity;
        const occupied = KDMapData.Entities.some(
                (entity) => !isOwnedProxy(entity) && entity.hp > 0 && cellKey(entity) === cellKey(physical),
            ),
            enemy = occupied
                ? typeof globalThis.DialogueGetEnemy === "function" && typeof addEntity === "function"
                    ? addEntity(
                          { ...globalThis.DialogueGetEnemy(PROXY), x: physical.x, y: physical.y },
                          false,
                          false,
                          true,
                      )
                    : undefined
                : DialogueCreateEnemy(physical.x, physical.y, PROXY);
        if (!enemy) return undefined;
        enemy.hostile = 999;
        KinkyDungeonSetEnemyFlag(enemy, "targetedForAttack", -1);
        enemy.SpiderlingsSpinnerProxy = { fieldId: field.fieldId, cell: cellKey(physical) };
        syncProxyHP(enemy, field, physical);
        return enemy;
    }

    function prioritizeActors(map) {
        const proxies = map.Entities.filter(isOwnedProxy);
        if (!proxies.length || map.Entities.slice(0, proxies.length).every(isOwnedProxy)) return;
        map.Entities = [...proxies, ...map.Entities.filter((entity) => !isOwnedProxy(entity))];
        invalidateNavigation();
    }

    function reconcile(map = KDMapData) {
        const encounter = state(map);
        if (!encounter?.topology || map !== KDMapData) return { created: 0, removed: 0, reused: 0 };
        auditPassageTerrain();
        const expected = new Map(),
            owned = map.Entities.filter(isOwnedProxy),
            kept = new Map();
        const field = encounter.topology;
        for (const cell of topology().solidCells(field)) expected.set(cellKey(cell), cell);
        let removed = 0,
            created = 0,
            reused = 0;
        for (const enemy of owned) {
            const marker = proxyMarker(enemy),
                expectedKey = marker.cell,
                physical = marker.fieldId === field.fieldId && expected.get(expectedKey);
            if (!physical || kept.has(expectedKey)) {
                map.Entities.splice(map.Entities.indexOf(enemy), 1);
                removed++;
                continue;
            }
            enemy.x = physical.x;
            enemy.y = physical.y;
            syncProxyHP(enemy, field, physical);
            enemy.hostile = 999;
            KinkyDungeonSetEnemyFlag(enemy, "targetedForAttack", -1);
            kept.set(expectedKey, enemy);
            reused++;
        }
        for (const [key, physical] of expected) if (!kept.has(key) && createProxy(field, physical)) created++;
        prioritizeActors(map);
        if (created || removed) invalidateNavigation();
        return { created, removed, reused };
    }

    function initializeMap(input) {
        const owners = input.owners.map((owner) => (typeof owner === "object" ? owner.id : owner)),
            line = topology().createLine({
                fieldId: input.fieldId,
                owners,
                anchors: input.anchors,
            });
        KDMapData[KEY] = {
            version: topology().VERSION,
            scenario: input.scenario || "doorway",
            topology: line,
            builders: input.builders || {},
        };
        reconcile();
        return state();
    }

    function mapSnapshot() {
        const floor = [],
            walls = [],
            locked = [],
            protectedCells = [];
        for (let y = 0; y < KDMapData.GridHeight; y++)
            for (let x = 0; x < KDMapData.GridWidth; x++) {
                const cell = { x, y },
                    key = cellKey(cell),
                    tile = KinkyDungeonTilesGet(key);
                const mapTile = KinkyDungeonMapGet(x, y);
                if (KinkyDungeonMovableTilesEnemy.includes(mapTile) || (mapTile === "D" && !tile?.Lock))
                    floor.push(key);
                if (isNativeWall(cell)) walls.push(key);
                if (tile?.Lock) locked.push(key);
                if (protectedCell(cell, tile)) protectedCells.push(key);
            }
        return {
            width: KDMapData.GridWidth,
            height: KDMapData.GridHeight,
            floor,
            walls,
            locked,
            protected: protectedCells,
            occupied: [
                ...KDMapData.Entities.filter((entity) => !isOwnedProxy(entity) && !isSpiderling(entity)).map(cellKey),
                cellKey(KinkyDungeonPlayerEntity),
            ],
            exit: KDMapData.EndPosition,
        };
    }

    function protectedCell(cell, tile = KinkyDungeonTilesGet(cellKey(cell))) {
        return !!(
            ["D", "d"].includes(KinkyDungeonMapGet(cell.x, cell.y)) ||
            tile?.OL ||
            tile?.OffLimits ||
            tile?.Jail ||
            tile?.Protected ||
            tile?.Priority ||
            tile?.Lock ||
            ["Shrine", "Chest", "Door", "JailPoint", "Stairs"].includes(tile?.Type) ||
            [
                KDMapData.StartPosition,
                KDMapData.EndPosition,
                ...Object.values(KDMapData.ShortcutPositions || {}),
                ...(KDMapData.JailPoints || []),
            ].some((candidate) => candidate?.x === cell.x && candidate?.y === cell.y)
        );
    }

    function isNativeWall(cell) {
        const tile = KinkyDungeonMapGet(cell.x, cell.y);
        return (
            !KinkyDungeonMovableTilesEnemy.includes(tile) &&
            (typeof KinkyDungeonWallTiles === "string" ? KinkyDungeonWallTiles : "14,6f").includes(tile)
        );
    }

    function auditPassageTerrain() {
        const graph = state()?.topology;
        if (!graph) return;
        let changed = false;
        for (const field of Object.values(graph.fields || {}))
            if (field.kind === "passage" && !field.retired) {
                const valid =
                    field.nativeWallCells.every(isNativeWall) &&
                    [...field.interiorCells, ...field.gates.flatMap((gate) => gate.cells)].every(
                        (cell) =>
                            KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y)) &&
                            !protectedCell(cell),
                    );
                if (field.nativeTerrainValid !== valid) {
                    field.nativeTerrainValid = valid;
                    changed = true;
                }
            }
        if (changed) topology().refresh(graph);
    }

    function initializeEnclosure(input) {
        const owners = input.owners.map((owner) => (typeof owner === "object" ? owner.id : owner)),
            graph = topology().createEnclosure({ ...input, owners, map: input.map || mapSnapshot() });
        KDMapData[KEY] = {
            version: topology().VERSION,
            scenario: input.scenario || "enclosure",
            topology: graph,
            builders: Object.fromEntries(owners.map((id) => [id, { auto: true }])),
            timing: { started: KinkyDungeonCurrentTick || 0, operations: 0, moves: 0, blocked: [] },
        };
        reconcile();
        return state();
    }

    function ensureMap(input = {}) {
        if (!state())
            KDMapData[KEY] = {
                version: topology().VERSION,
                scenario: input.scenario || "autonomous-line",
                topology: undefined,
                builders: {},
            };
        return state();
    }

    function addLine(input) {
        const encounter = ensureMap(input),
            existing = fieldById(encounter, input.fieldId);
        if (existing) return existing;
        const owners = input.owners.map((owner) => (typeof owner === "object" ? owner.id : owner)),
            line = topology().createLine({ fieldId: input.fieldId, owners, anchors: input.anchors });
        if (!encounter.topology) encounter.topology = line;
        else
            encounter.topology = topology().addLine(encounter.topology, {
                fieldId: input.fieldId,
                owners,
                anchors: input.anchors,
            });
        reconcile();
        return fieldById(encounter, input.fieldId);
    }

    function addEnclosure(input) {
        const encounter = ensureMap(input),
            owners = input.owners.map((owner) => (typeof owner === "object" ? owner.id : owner)),
            added = topology().addEnclosure(encounter.topology, {
                ...input,
                owners,
                map: input.map || mapSnapshot(),
            });
        if (!added.added) return { added: false, reason: added.reason };
        encounter.topology = added.state;
        if (input.prebuiltOuter) {
            const graph = encounter.topology,
                composite = graph.composites[input.compositeId],
                outer = composite && graph.fields[composite.layerIds.at(-1)];
            if (outer) {
                const gate = cellKey(outer.gateCell);
                for (const anchor of graph.anchors)
                    if (anchor.owners.includes(outer.id) && cellKey(anchor) !== gate) anchor.built = true;
                for (const link of graph.links) {
                    if (!link.owners.includes(outer.id)) continue;
                    link.builtCells = link.plannedCells
                        .filter((cell) => cellKey(cell) !== gate)
                        .map((cell) => ({ ...cell }));
                    link.connected = link.builtCells.length === link.plannedCells.length;
                }
                composite.closureArmed = false;
                composite.autoSeal = false;
                outer.silkActivated = false;
                composite.provenance = "mapgen";
                topology().refresh(graph);
            }
        }
        reconcile();
        return { added: true, compositeId: input.compositeId };
    }

    function addPassage(input) {
        const encounter = ensureMap(input),
            owners = input.owners.map((owner) => (typeof owner === "object" ? owner.id : owner)),
            added = topology().addPassage(encounter.topology, { ...input, owners, map: input.map || mapSnapshot() });
        if (!added.added) return { added: false, reason: added.reason };
        encounter.topology = added.state;
        reconcile();
        return { added: true, compositeId: input.compositeId, fieldId: input.fieldId };
    }

    function setEnclosureGate(fieldId, cell) {
        const encounter = state();
        if (!encounter?.topology) return { changed: false };
        const changed = topology().setEnclosureGate(encounter.topology, fieldId, cell);
        if (changed.changed) encounter.topology = changed.state;
        return { changed: changed.changed };
    }

    function setPassageOpenGates(fieldId, gateIds) {
        const encounter = state();
        if (!encounter?.topology) return { changed: false, reason: "inactive" };
        const changed = topology().setPassageOpenGates(encounter.topology, fieldId, gateIds);
        if (changed.changed) encounter.topology = changed.state;
        return { changed: changed.changed, reason: changed.reason };
    }

    function prepareEnclosureProject(compositeId, groupId) {
        const encounter = state();
        if (!encounter?.topology) return false;
        const result = topology().prepareEnclosureProject(encounter.topology, compositeId, groupId);
        if (result.changed) encounter.topology = result.state;
        return result.changed;
    }

    function commitProjectStructure(kind, input, replaceFieldIds = []) {
        const encounter = ensureMap(input),
            previous = encounter.topology;
        const create = { line: "addLine", enclosure: "addEnclosure", passage: "addPassage" }[kind];
        if (!create) return { added: false, reason: "field-kind" };
        const result = api.SpinnerNativeField[create](input);
        if (result?.added === false) {
            if (replaceFieldIds.length) {
                encounter.topology = previous;
                reconcile();
            }
            return result;
        }
        for (const id of replaceFieldIds) retireField(id, { residual: true });
        return result;
    }

    function addEnclosureLayer(input) {
        const encounter = state();
        if (!encounter?.topology) return { added: false, reason: "inactive" };
        const added = topology().addEnclosureLayer(encounter.topology, {
            ...input,
            map: input.map || mapSnapshot(),
        });
        if (!added.added) return { added: false, reason: added.reason };
        encounter.topology = added.state;
        reconcile();
        return { added: true, fieldId: input.layer.id };
    }

    function retireField(fieldId, options) {
        const encounter = state(),
            field = fieldById(encounter, fieldId);
        if (!field) return false;
        encounter.topology = topology().retireField(encounter.topology, fieldId, options);
        reconcile();
        invalidateNavigation();
        return true;
    }

    function setOwners(fieldId, ownerIds) {
        const encounter = state(),
            field = fieldById(encounter, fieldId);
        if (!field) return false;
        const owners = Array.from(new Set(ownerIds || [])),
            current = encounter.topology.fieldOwners[fieldId];
        // Planning refreshes every retained crew each turn. Only an actual
        // membership change needs the topology's immutable ownership update.
        if (current?.length === owners.length && owners.every((id, index) => id === current[index])) return true;
        encounter.topology = topology().setFieldOwners(encounter.topology, fieldId, owners);
        return true;
    }

    function snapshot(cell) {
        const tile = KinkyDungeonTilesGet(cellKey(cell)),
            occupants = KDMapData.Entities.filter(
                (entity) => entity.hp > 0 && !isOwnedProxy(entity) && cellKey(entity) === cellKey(cell),
            ),
            player = KinkyDungeonPlayerEntity.x === cell.x && KinkyDungeonPlayerEntity.y === cell.y;
        return {
            cell: { x: cell.x, y: cell.y },
            inBounds: cell.x > 0 && cell.y > 0 && cell.x < KDMapData.GridWidth - 1 && cell.y < KDMapData.GridHeight - 1,
            floor: KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y)),
            wall: isNativeWall(cell),
            protected: protectedCell(cell, tile),
            locked: !!tile?.Lock,
            occupied: occupants.some((entity) => !isSpiderling(entity)) || player,
            actorOccupied: occupants.length > 0 || player,
            web: !!KDMapData.Entities.find((entity) => isOwnedProxy(entity) && cellKey(entity) === cellKey(cell)),
        };
    }

    function applyPaidAction(actor, action) {
        auditPassageTerrain();
        const encounter = state(),
            graph = encounter?.topology,
            field = fieldById(encounter, action.fieldId) || graph;
        if (!graph || !field) return { paid: false, applied: false, reason: "inactive" };
        const work = topology().inspectWorkAction(graph, action),
            cell = work.cell;
        if (!cell) return { paid: false, applied: false, reason: "action" };
        if (
            Math.hypot(cell.x - actor.x, cell.y - actor.y) > 5 ||
            (!work.allowsOccupiedTarget &&
                Math.max(Math.abs(cell.x - actor.x), Math.abs(cell.y - actor.y)) > 1 &&
                !KinkyDungeonCheckPath(actor.x, actor.y, cell.x, cell.y, false, true, 1, false))
        )
            return { paid: true, applied: false, reason: "range" };
        const applied = topology().applyAction(graph, action, snapshot(cell));
        encounter.topology = applied.state;
        if (applied.outcome.legal) {
            reconcile();
            const proxy = KDMapData.Entities.find((enemy) => isOwnedProxy(enemy) && cellKey(enemy) === cellKey(cell));
            if (proxy) api.SpellVisuals?.built(proxy);
        }
        return { paid: true, applied: applied.outcome.legal, reason: applied.outcome.reason, effects: applied.effects };
    }

    function moveTowardAction(enemy, cell) {
        const options = [];
        for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) if (x || y) options.push({ x, y });
        options.sort(
            (a, b) =>
                Math.hypot(cell.x - enemy.x - a.x, cell.y - enemy.y - a.y) -
                    Math.hypot(cell.x - enemy.x - b.x, cell.y - enemy.y - b.y) ||
                Math.abs(a.x) + Math.abs(a.y) - Math.abs(b.x) - Math.abs(b.y),
        );
        for (const direction of options) {
            const x = enemy.x + direction.x,
                y = enemy.y + direction.y;
            if (KinkyDungeonEntityAt(x, y)) continue;
            if (
                typeof KinkyDungeonEnemyCanMove === "function" &&
                !KinkyDungeonEnemyCanMove(
                    enemy,
                    { ...direction, delta: 1 },
                    KinkyDungeonMovableTilesSmartEnemy,
                    "",
                    false,
                    0,
                )
            )
                continue;
            if (typeof KinkyDungeonEnemyTryMove === "function")
                KinkyDungeonEnemyTryMove(enemy, { ...direction, delta: 1 }, enemy.Enemy.movePoints, x, y, false);
            else KDMoveEntity(enemy, x, y, true, undefined, true, false);
            return enemy.x === x && enemy.y === y;
        }
        return false;
    }

    // This mirrors KinkyDungeonEnemyTryMove's pinned 5.5.0 movement accumulator and threshold.
    function accrueConstructionAction(enemy, delta) {
        if (!(delta > 0)) return false;
        let speed = KinkyDungeonGetBuffedStat(enemy.buffs, "MoveSpeed")
            ? KinkyDungeonMultiplicativeStat(-KinkyDungeonGetBuffedStat(enemy.buffs, "MoveSpeed"))
            : 1;
        if (enemy.bind > 0)
            enemy.SpinnerConstructionPoints = (enemy.SpinnerConstructionPoints || 0) + (speed * delta) / 10;
        else if (enemy.slow > 0)
            enemy.SpinnerConstructionPoints = (enemy.SpinnerConstructionPoints || 0) + (speed * delta) / 2;
        else
            enemy.SpinnerConstructionPoints =
                (enemy.SpinnerConstructionPoints || 0) +
                (KDGameData.SleepTurns > 0 ? 4 * delta * speed : delta * speed);
        const boundCost = KDBoundEffects(enemy) * 0.5,
            needed = enemy.Enemy.movePoints + boundCost;
        if (enemy.SpinnerConstructionPoints < needed) return false;
        enemy.SpinnerConstructionPoints = Math.max(
            0,
            enemy.SpinnerConstructionPoints - enemy.Enemy.movePoints + boundCost,
        );
        return true;
    }

    function handleEnemyTurn(enemy, _target, delta) {
        const encounter = state(),
            builder = encounter?.builders?.[enemy?.id];
        if (!builder || (!builder.auto && (!Array.isArray(builder.actions) || builder.actions.length === 0)))
            return undefined;
        if (!isSpiderling(enemy) || enemy.hp <= 0 || KinkyDungeonIsDisabled(enemy) || KDHelpless(enemy))
            return result(enemy);
        if (accrueConstructionAction(enemy, delta)) {
            encounter.timing = encounter.timing || {
                started: KinkyDungeonCurrentTick || 0,
                operations: 0,
                moves: 0,
                blocked: [],
            };
            encounter.topology.workCreditByMember[enemy.id] = enemy.SpinnerConstructionPoints || 0;
            const assigned = encounter.topology.assignmentByMember[enemy.id],
                reserved = Object.entries(encounter.topology.assignmentByMember)
                    .filter(([ownerId]) => String(ownerId) !== String(enemy.id))
                    .map(([, action]) => topology().workKey(action)),
                action = builder.auto
                    ? assigned || topology().nextWorkAction(encounter.topology, enemy.id, enemy, reserved)
                    : builder.actions.shift();
            if (action) {
                encounter.topology.assignmentByMember[enemy.id] = action;
                const cell = topology().inspectWorkAction(encounter.topology, action).cell;
                if (
                    Math.hypot(cell.x - enemy.x, cell.y - enemy.y) > 5 ||
                    !KinkyDungeonCheckPath(enemy.x, enemy.y, cell.x, cell.y, false, true, 1, false)
                ) {
                    const moved = moveTowardAction(enemy, cell);
                    builder.lastResult = { paid: true, applied: false, reason: moved ? "moved" : "blocked" };
                    if (moved) encounter.timing.moves++;
                    else encounter.timing.blocked.push({ turn: KinkyDungeonCurrentTick, actor: enemy.id, cell });
                } else {
                    builder.lastResult = applyPaidAction(enemy, { ...action, ownerId: enemy.id });
                    if (builder.lastResult.applied) encounter.timing.operations++;
                    delete encounter.topology.assignmentByMember[enemy.id];
                }
            }
        }
        return result(enemy);
    }

    function onNativeDamage(data) {
        const encounter = state(),
            marker = proxyMarker(data?.enemy),
            graph = encounter?.topology;
        if (!graph || marker?.fieldId !== graph.fieldId || !(data.dmgDealt > 0)) return false;
        const [x, y] = marker.cell.split(",").map(Number),
            damaged = topology().damageAt(graph, { cell: { x, y }, damage: data.dmgDealt });
        encounter.topology = damaged.state;
        reconcile();
        invalidateNavigation();
        return true;
    }

    function targetId(entity) {
        return entity?.player ? "player" : entity?.id;
    }

    function updatePreyTargets(graph, compositeIds) {
        const actors = new Map(KDMapData.Entities.map((entity) => [entity.id, entity])),
            candidates = [KinkyDungeonPlayerEntity, ...KDMapData.Entities].filter(
                (entity) =>
                    entity &&
                    (entity.player || entity.hp > 0) &&
                    !isSpiderling(entity) &&
                    !isOwnedProxy(entity) &&
                    entity.Enemy?.name !== "NestEntrance" &&
                    !entity.Enemy?.tags?.scenery,
            );
        for (const composite of Object.values(graph.composites || {})) {
            if (composite.autoSeal || (compositeIds && !compositeIds.has(composite.id))) continue;
            if (composite.layerIds.every((id) => graph.fields[id]?.retired)) continue;
            const owners = fieldOwners(composite.id)
                .map((id) => actors.get(id))
                .filter((entity) => entity?.hp > 0 && isSpiderling(entity));
            const prey = candidates.find(
                (entity) =>
                    topology().isInsideCommonCore(graph, composite.id, entity) &&
                    owners.some((owner) => (entity.player ? KDHostile(owner) : KDHostile(owner, entity))),
            );
            topology().updateTarget(
                graph,
                prey ? { id: targetId(prey), x: prey.x, y: prey.y } : { x: -1, y: -1 },
                composite.id,
            );
        }
    }

    function onEntry(entity) {
        const encounter = state(),
            id = targetId(entity);
        if (
            !encounter?.topology ||
            id === undefined ||
            isSpiderling(entity) ||
            isOwnedProxy(entity) ||
            entity.Enemy?.name === "NestEntrance" ||
            entity.Enemy?.tags?.scenery
        )
            return false;
        const graph = encounter.topology,
            affected = new Set(
                Object.values(graph.composites || {})
                    .filter(
                        (composite) =>
                            composite.targetId === id || topology().isInsideCommonCore(graph, composite.id, entity),
                    )
                    .map((composite) => composite.id),
            );
        if (affected.size) updatePreyTargets(graph, affected);
        return false;
    }

    function afterLoad() {
        const encounter = state();
        if (encounter?.topology) encounter.topology = topology().restore(encounter.topology);
        if (typeof KinkyDungeonPlayerBuffs !== "undefined") {
            delete KinkyDungeonPlayerBuffs.SpiderlingsSpinnerSnaringSilk;
            delete KinkyDungeonPlayerBuffs.SpiderlingsSpinnerGroundTrap;
        }
        for (const entity of [KinkyDungeonPlayerEntity, ...KDMapData.Entities]) {
            if (!entity?.buffs) continue;
            delete entity.buffs.SpiderlingsSpinnerSnaringSilk;
            delete entity.buffs.SpiderlingsSpinnerGroundTrap;
        }
    }

    function activeOwnerIds(field) {
        return field.owners.filter((id) => {
            const owner = KDMapData.Entities.find((entity) => entity.id === id);
            return owner?.hp > 0 && isSpiderling(owner);
        });
    }

    function tick(delta) {
        const encounter = state();
        if (!encounter?.topology || !(delta > 0)) return;
        auditPassageTerrain();
        const settled = topology().tickOwnerless(encounter.topology, {
            activeOwnerIds: activeOwnerIds(encounter.topology),
            delta,
            occupiedCells: [
                KinkyDungeonPlayerEntity,
                ...KDMapData.Entities.filter((entity) => entity.hp > 0 && !isOwnedProxy(entity)),
            ],
        });
        encounter.topology = settled.state;
        updatePreyTargets(encounter.topology);
        for (const enemy of KDMapData.Entities) {
            if (!(enemy.hp > 0) || !(enemy.shield > 0) || enemy.player || isOwnedProxy(enemy)) continue;
            const inside = Object.values(encounter.topology.composites || {}).some((composite) => {
                const sealed = composite.layerIds.some(
                    (fieldId) =>
                        encounter.topology.fields?.[fieldId]?.phase === "sealed" &&
                        topology().containsDeclaredField(encounter.topology, fieldId, enemy),
                );
                if (!sealed) return false;
                return fieldOwners(composite.id).some((ownerId) => {
                    const owner = KDMapData.Entities.find((candidate) => candidate.id === ownerId);
                    return owner?.hp > 0 && isSpiderling(owner) && KDHostile(owner, enemy);
                });
            });
            if (inside) api.Combat?.pressureNPCShield(enemy);
        }
        reconcile();
    }

    function canTraverse(mover, proxy) {
        return isSpiderling(mover) && isOwnedProxy(proxy) && proxyMarker(proxy).fieldId === state()?.topology?.fieldId;
    }

    function preparedCells(graph = state()?.topology) {
        if (!graph || graph.collapsed) return [];
        const stamp = Object.values(graph.fields || {})
            .map(
                (field) =>
                    `${field.id}:${field.phase}:${field.silkActivated}:${field.retired}:${field.nativeTerrainValid}`,
            )
            .join("|");
        const cached = preparedByGraph.get(graph);
        if (cached?.stamp === stamp) return cached.cells;
        const cells = new Map(),
            active = new Set(),
            passive = new Set();
        const physical = topology().solidCells(graph);
        for (const field of Object.values(graph.fields || {})) {
            if (field.retired || field.nativeTerrainValid === false) continue;
            // Arming is a plan. Admission changes only after paid gate work, or for an already sealed/breached wall.
            ((field.silkActivated ?? ["sealed", "breached"].includes(field.phase)) ? active : passive).add(field.id);
            if (field.kind === "passage")
                for (const gate of field.gates) {
                    const link = graph.links.find((candidate) => candidate.id === gate.linkId);
                    if (passive.has(field.id) && link?.prepared && link.hp > 0 && !link.collapsed)
                        for (const cell of gate.cells) cells.set(cellKey(cell), cell);
                }
        }
        for (const cell of physical) {
            const owners = new Set([
                ...cell.anchorIds.flatMap((id) => graph.anchors.find((anchor) => anchor.id === id)?.owners || []),
                ...cell.linkIds.flatMap((id) => graph.links.find((link) => link.id === id)?.owners || []),
            ]);
            // A shared segment stays solid if any owning field has activated it. Legacy lines keep their behavior.
            if ([...owners].some((id) => active.has(id) || (graph.lineFields?.[id] && !graph.lineFields[id].retired)))
                continue;
            if (
                [...owners].some((id) => passive.has(id)) ||
                [...owners].every((id) => graph.fields?.[id]?.retired || graph.lineFields?.[id]?.retired)
            )
                cells.set(cellKey(cell), cell);
        }
        const result = [...cells.values()];
        preparedByGraph.set(graph, { stamp, cells: result });
        return result;
    }

    function isPreparedSilk(cell) {
        return !!cell && preparedCells().some((candidate) => cellKey(candidate) === cellKey(cell));
    }

    // Native slow level 1 affects stamina only; level 2 adds one paid movement turn to a normal crossing.
    if (typeof KDCanPassEnemy === "function")
        KDCanPassEnemy = api.Hooks.wrap(
            "Spinner.preparedSilk",
            KDCanPassEnemy,
            (native) =>
                function (mover, enemy) {
                    if (mover?.player && isOwnedProxy(enemy) && isPreparedSilk(enemy)) return true;
                    return native.apply(this, arguments);
                },
        );
    KDAddEvent(KDEventMapGeneric, "beforeMove", "SpiderlingsSpinnerPreparedSilk", (_event, cell) => {
        if (!isPreparedSilk(cell)) return;
        KinkyDungeonApplyBuffToEntity(KinkyDungeonPlayerEntity, {
            id: "SpiderlingsSpinnerPreparedSilk",
            type: "SlowLevel",
            power: 2,
            duration: 1,
            player: true,
        });
        KinkyDungeonCalculateSlowLevel(0);
    });

    function passThrough(mover, proxy, map) {
        if (!canTraverse(mover, proxy) || !map) return 0;
        if (
            map.Entities.some(
                (entity) =>
                    !isOwnedProxy(entity) && entity !== mover && entity.hp > 0 && cellKey(entity) === cellKey(proxy),
            ) ||
            (KinkyDungeonPlayerEntity.x === proxy.x && KinkyDungeonPlayerEntity.y === proxy.y)
        )
            return 0;
        prioritizeActors(map);
        const from = { x: mover.x, y: mover.y };
        KDMoveEntity(mover, proxy.x, proxy.y, true, undefined, true, true);
        if (activeMove?.actor === mover && (mover.x !== from.x || mover.y !== from.y))
            activeMove.moved = mover.x === proxy.x && mover.y === proxy.y;
        // KD 5.4.92 and 5.5.0 continue TryMove after a return value of 2 and
        // recompute the destination from the actor's new position. Stop that
        // second step here; the wrapper reports the completed, paid move.
        return 0;
    }

    function nativeReachability(compositeId, target) {
        const encounter = state();
        if (!encounter?.topology?.composites?.[compositeId]) return undefined;
        return topology().inspectReachability(encounter.topology, compositeId, target, mapSnapshot());
    }

    function containingComposite(target) {
        const encounter = state();
        if (!encounter?.topology) return undefined;
        const candidates = Object.values(encounter.topology.composites || {}).filter((composite) =>
            topology().containsDeclaredField(encounter.topology, composite.layerIds[0], target),
        );
        return (
            candidates.find((composite) => topology().captureGeometryReady(encounter.topology, composite.id, target)) ||
            candidates[0]
        );
    }

    function captureGeometryReady(target) {
        auditPassageTerrain();
        const composite = containingComposite(target),
            encounter = state();
        return !!composite && topology().captureGeometryReady(encounter.topology, composite.id, target);
    }

    function compositeById(compositeId) {
        const composite = state()?.topology?.composites?.[compositeId];
        return composite ? { ...composite, layerIds: [...composite.layerIds] } : undefined;
    }

    function fieldOwners(fieldOrCompositeId) {
        const graph = state()?.topology,
            composite = graph?.composites?.[fieldOrCompositeId],
            fieldIds = composite?.layerIds || [fieldOrCompositeId];
        if (!graph) return [];
        return [
            ...new Set(
                fieldIds.flatMap((fieldId) => graph.fieldOwners?.[fieldId] || graph.fields?.[fieldId]?.owners || []),
            ),
        ];
    }

    function containsComposite(compositeId, target) {
        const graph = state()?.topology,
            composite = graph?.composites?.[compositeId],
            outer = composite?.layerIds?.at(-1);
        return !!outer && topology().containsDeclaredField(graph, outer, target);
    }

    function commonCore(compositeId) {
        const core = state()?.topology?.composites?.[compositeId]?.core;
        return core ? { x: core.x, y: core.y } : undefined;
    }

    function isSpiderlingsWebCell(cell) {
        const graph = state()?.topology;
        return (
            !!graph &&
            topology()
                .solidCells(graph)
                .some((candidate) => cellKey(candidate) === cellKey(cell))
        );
    }

    function breachedDeparture(from, to) {
        const graph = state()?.topology;
        if (!graph || !from || !to) return undefined;
        const candidate = Object.values(graph.composites || {})
            .filter((composite) => {
                return composite.layerIds.some(
                    (fieldId) =>
                        graph.fields?.[fieldId]?.phase === "breached" &&
                        topology().containsDeclaredField(graph, fieldId, from) &&
                        !topology().containsDeclaredField(graph, fieldId, to),
                );
            })
            .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0];
        return (
            candidate && {
                compositeId: candidate.id,
                groupId: candidate.groupId,
                eligibleSourceIds: fieldOwners(candidate.id),
            }
        );
    }

    // Select border pieces from the declared perimeter; drawing never edits construction or HP.
    function borderArtwork(graph, cell) {
        let artwork = artworkByGraph.get(graph);
        if (!artwork) artworkByGraph.set(graph, (artwork = new Map()));
        const key = cellKey(cell);
        if (artwork.has(key)) return artwork.get(key);
        const parts = new Map();
        const add = (part, rotation) => parts.set(`${part}:${rotation}`, { part, rotation });
        for (const field of [...Object.values(graph.fields || {}), ...Object.values(graph.lineFields || {})]) {
            if (field.retired) continue;
            if (field.kind === "passage") {
                const gate = field.gates.find((candidate) =>
                    candidate.cells.some((position) => cellKey(position) === cellKey(cell)),
                );
                if (gate) {
                    const horizontal =
                        gate.cells.length > 1
                            ? gate.cells.every((position) => position.y === gate.cells[0].y)
                            : field.interiorCells.some(
                                  (position) => position.x === cell.x && Math.abs(position.y - cell.y) === 1,
                              );
                    const interior = field.interiorCells;
                    const inward = horizontal
                        ? interior.reduce((sum, position) => sum + position.y, 0) / interior.length - cell.y
                        : interior.reduce((sum, position) => sum + position.x, 0) / interior.length - cell.x;
                    add(horizontal ? "Top" : "Side", inward < 0 ? Math.PI : 0);
                }
                continue;
            }
            const area = field.vertices.reduce((sum, vertex, index, vertices) => {
                const next = vertices[(index + 1) % vertices.length];
                return sum + vertex.x * next.y - next.x * vertex.y;
            }, 0);
            const vertices = field.kind !== "line" && area < 0 ? [...field.vertices].reverse() : field.vertices,
                corner = vertices.findIndex((vertex) => cellKey(vertex) === cellKey(cell));
            if (field.kind !== "line" && corner >= 0) {
                const here = vertices[corner],
                    neighbors = [
                        vertices[(corner + vertices.length - 1) % vertices.length],
                        vertices[(corner + 1) % vertices.length],
                    ],
                    directions = neighbors.map(
                        (vertex) => `${Math.sign(vertex.x - here.x)},${Math.sign(vertex.y - here.y)}`,
                    );
                // The unrotated corner has legs facing up and right.
                const rotations = [
                    ["0,-1", "1,0"],
                    ["1,0", "0,1"],
                    ["0,1", "-1,0"],
                    ["-1,0", "0,-1"],
                ];
                const quarter = rotations.findIndex((legs) => legs.every((leg) => directions.includes(leg)));
                if (quarter >= 0) add("Corner", (quarter * Math.PI) / 2);
                continue;
            }
            const edges = field.kind === "line" ? vertices.length - 1 : vertices.length;
            for (let i = 0; i < edges; i++) {
                const a = vertices[i],
                    b = vertices[(i + 1) % vertices.length];
                if (
                    cell.x < Math.min(a.x, b.x) ||
                    cell.x > Math.max(a.x, b.x) ||
                    cell.y < Math.min(a.y, b.y) ||
                    cell.y > Math.max(a.y, b.y)
                )
                    continue;
                add(a.y === b.y ? "Top" : "Side", a.y === b.y ? (b.x < a.x ? Math.PI : 0) : b.y > a.y ? Math.PI : 0);
            }
        }
        const result = [...parts.values()];
        artwork.set(key, result);
        return result;
    }

    // Prepared silk at an open passage is a visual cue only, never an entity or obstruction.
    KDAddEvent(KDEventMapGeneric, "draw", "SpiderlingsSpinnerNativeFieldOpenGates", (_event, frame) => {
        const graph = state()?.topology;
        if (!graph || graph.collapsed || !frame || typeof KDDraw !== "function") return;
        const size = KinkyDungeonGridSizeDisplay,
            color = api.getSetting?.("spiderlingsPinkWebbing") === true ? "Pink" : "",
            pans = typeof StandalonePatched !== "undefined" && StandalonePatched,
            camX = frame.CamX + (pans ? 0 : frame.CamX_offset || 0),
            camY = frame.CamY + (pans ? 0 : frame.CamY_offset || 0);
        for (const field of Object.values(graph.fields || {})) {
            if (field.kind !== "passage" || field.retired || field.nativeTerrainValid === false) continue;
            for (const gate of field.gates) {
                const link = graph.links.find((candidate) => candidate.id === gate.linkId);
                if (!link?.prepared || link.hp <= 0 || link.collapsed || link.builtCells.length) continue;
                for (const cell of gate.cells) {
                    if (typeof KinkyDungeonVisionGet === "function" && KinkyDungeonVisionGet(cell.x, cell.y) <= 0)
                        continue;
                    const art = borderArtwork({ fields: { [field.id]: field } }, cell)[0];
                    KDDraw(
                        kdgameboard,
                        kdpixisprites,
                        `SpiderlingsSpinnerOpenGate_${field.id}_${gate.id}_${cellKey(cell)}`,
                        KinkyDungeonRootDirectory + `Bullets/SpiderlingsSpinnerTrap${art.part}${color}.png`,
                        (cell.x - camX + 0.5) * size,
                        (cell.y - camY + 0.5) * size,
                        size,
                        size,
                        art.rotation,
                        { zIndex: -0.05, alpha: 0.28 },
                        true,
                        undefined,
                        undefined,
                        true,
                    );
                }
            }
        }
    });

    if (typeof KDDrawEnemySprite === "function") {
        const nativeDraw = KDDrawEnemySprite;
        KDDrawEnemySprite = function (board, enemy, tx, ty, CamX, CamY, StaticView, zIndex = 0, id = "") {
            let graph = state()?.topology;
            const legacy = api.SpinnerField?.field?.();
            const owned = isOwnedProxy(enemy) && proxyMarker(enemy).fieldId === graph?.fieldId;
            const trainingNode =
                enemy?.Enemy?.name === "SpiderlingsSilkAnchor" && legacy?.nodes?.some((node) => node.id === enemy.id);
            if (!owned && !trainingNode) return nativeDraw.apply(this, arguments);
            if (trainingNode) graph = { fields: { training: { kind: "enclosure", vertices: legacy.traps } } };
            const size = KinkyDungeonGridSizeDisplay,
                color = api.getSetting?.("spiderlingsPinkWebbing") === true ? "Pink" : "",
                parts = borderArtwork(graph, enemy);
            for (const [index, art] of parts.entries()) {
                KDDraw(
                    board,
                    kdpixisprites,
                    `spr_${enemy.id}${id}_border_${index}`,
                    KinkyDungeonRootDirectory + `Bullets/SpiderlingsSpinnerTrap${art.part}${color}.png`,
                    (tx - CamX + 0.5) * size,
                    (ty - CamY + 0.5) * size,
                    size,
                    size,
                    art.rotation,
                    { zIndex, alpha: owned && isPreparedSilk(enemy) ? 0.45 : 1 },
                    true,
                );
                const flash = api.SpellVisuals?.constructionFlash(enemy) || 0;
                if (flash > 0)
                    KDDraw(
                        board,
                        kdpixisprites,
                        `spr_${enemy.id}${id}_border_${index}_flash`,
                        KinkyDungeonRootDirectory + `Bullets/SpiderlingsSpinnerTrap${art.part}${color}.png`,
                        (tx - CamX + 0.5) * size,
                        (ty - CamY + 0.5) * size,
                        size,
                        size,
                        art.rotation,
                        { zIndex: zIndex + 0.001, alpha: flash, blendMode: PIXI.BLEND_MODES.ADD },
                        true,
                    );
            }
            return enemy.Enemy.name;
        };
    }

    // The old name is registered only so native save hydration can resolve it before migration.
    for (const name of [PROXY, LEGACY_PROXY])
        if (typeof KinkyDungeonEnemies !== "undefined" && !KinkyDungeonEnemies.some((enemy) => enemy.name === name)) {
            const base = KinkyDungeonEnemies.find((enemy) => enemy.name === "IceWall") || {};
            KinkyDungeonEnemies.push({
                ...base,
                name,
                faction: "Enemy",
                // IceWall's low-priority rule rejects nearby walls whenever the
                // player is visible, even while an NPC pursues a blocked rival.
                lowpriority: false,
                regen: 0,
                maxhp: 2,
                armor: 0,
                evasion: -100,
                immobile: false,
                pathcondition: PATH,
                AI: "wander",
                attack: "",
                attackRange: 0,
                visionRadius: 0,
                movePoints: 1000,
                attackPoints: 0,
                weight: 0,
                dropTable: [],
                events: [],
                // Native CanSwapWith still needs structure admission after a successful pathcondition query.
                tags: KDMapInit(["scenery", "construct", "notalk", "nobrain", "nosignal", "noknockback", "temporary"]),
            });
        }
    if (typeof KDModFiles !== "undefined") {
        for (const prefix of ["", typeof KinkyDungeonRootDirectory === "string" ? KinkyDungeonRootDirectory : ""])
            for (const color of ["", "Pink"])
                for (const name of [PROXY, LEGACY_PROXY])
                    KDModFiles[prefix + "Enemies/" + name + color + ".png"] =
                        KDModFiles[prefix + "Bullets/SpiderlingsSpinnerTrapTop" + color + ".png"] ||
                        KDModFiles["Bullets/SpiderlingsSpinnerTrapTop" + color + ".png"];
    }
    if (typeof KDPathConditions !== "undefined")
        KDPathConditions[PATH] = { query: canTraverse, doPassthrough: passThrough };
    if (typeof KinkyDungeonEnemyTryMove === "function")
        KinkyDungeonEnemyTryMove = api.Hooks.wrap(
            "Spinner.webTraversal",
            KinkyDungeonEnemyTryMove,
            (native) =>
                function (actor) {
                    const previous = activeMove,
                        move = { actor, moved: false };
                    activeMove = move;
                    try {
                        const moved = native.apply(this, arguments);
                        return move.moved || moved;
                    } finally {
                        activeMove = previous;
                    }
                },
        );

    api.SpinnerNativeField = {
        KEY,
        PROXY,
        PATH,
        state,
        snapshot,
        fieldById,
        ensureMap,
        addLine,
        addEnclosure,
        addPassage,
        setPassageOpenGates,
        setEnclosureGate,
        auditPassageTerrain,
        addEnclosureLayer,
        prepareEnclosureProject,
        commitProjectStructure,
        retireField,
        setOwners,
        initializeMap,
        initializeEnclosure,
        applyPaidAction,
        accrueConstructionAction,
        handleEnemyTurn,
        onNativeDamage,
        onEntry,
        afterLoad,
        tick,
        reconcile,
        invalidateNavigation,
        canTraverse,
        preparedCells,
        isPreparedSilk,
        passThrough,
        isOwnedProxy,
        mapSnapshot,
        nativeReachability,
        containingComposite,
        captureGeometryReady,
        compositeById,
        fieldOwners,
        containsComposite,
        commonCore,
        isSpiderlingsWebCell,
        breachedDeparture,
    };
})();
