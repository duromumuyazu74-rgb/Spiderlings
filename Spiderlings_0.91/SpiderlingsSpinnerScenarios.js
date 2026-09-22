"use strict";

// Disposable native scenarios supply actors and plans to the same runtime used by later floor activation.
(() => {
    const api = globalThis.Spiderlings,
        SCENARIO = "SpiderlingsSpinnerDoorway",
        CONTROL = "SpiderlingsSpinnerScenarioControl";

    function plan(fieldId, ownerIds, anchors) {
        const preview = api.SpinnerTopology.createLine({ fieldId, owners: ownerIds, anchors }),
            link = preview.links[0],
            actions = ownerIds.map(() => []);
        actions[0].push({ type: "placeAnchor", anchorId: preview.anchors[0].id });
        actions[1 % actions.length].push({ type: "placeAnchor", anchorId: preview.anchors[1].id });
        const extensions = link.plannedCells.length ? link.plannedCells : [undefined];
        extensions.forEach((cell, index) =>
            actions[index % actions.length].push({ type: "extendLink", linkId: link.id, ...(cell ? { cell } : {}) }),
        );
        return Object.fromEntries(ownerIds.map((id, index) => [id, { actions: actions[index] }]));
    }

    function setupDoorway(input = {}) {
        const owners = (input.ownerIds || []).filter((id) => id !== undefined),
            x = input.x ?? KinkyDungeonPlayerEntity.x + 4,
            centerY = input.y ?? KinkyDungeonPlayerEntity.y,
            anchors = input.anchors || [
                { x: x - 2, y: centerY },
                { x: x + 2, y: centerY },
            ],
            fieldId = input.fieldId || `${SCENARIO}:${KinkyDungeonCurrentTick || 0}`;
        if (owners.length !== 2) return { started: false, reason: "owners" };
        const encounter = api.SpinnerNativeField.initializeMap({
            fieldId,
            owners,
            anchors,
            scenario: SCENARIO,
            builders: plan(fieldId, owners, anchors),
        });
        return { started: true, encounter };
    }

    function setupFromNearbySpinners() {
        const owners = KDMapData.Entities.filter(
            (entity) => entity.hp > 0 && entity.Enemy?.name === "Spinner" && KDHostile(entity),
        )
            .slice(0, 2)
            .map((entity) => entity.id);
        return setupDoorway({ ownerIds: owners });
    }

    const rectangle = (left, top, right, bottom) => [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
    ];

    function setupEnclosure(input = {}) {
        const owners = (input.ownerIds || []).filter((id) => id !== undefined);
        if (owners.length < 2) return { started: false, reason: "owners" };
        const encounter = api.SpinnerNativeField.initializeEnclosure({
            compositeId: input.compositeId || `${input.scenario || "SpinnerEnclosure"}:${KinkyDungeonCurrentTick || 0}`,
            groupId: input.groupId || "scenario",
            owners,
            layers: input.layers,
            fallbackLine: input.fallbackLine,
            scenario: input.scenario || "enclosure",
            map: input.map,
        });
        return { started: encounter.topology.kind !== "abandoned", encounter, reason: encounter.topology.reason };
    }

    function setupRegular(input = {}) {
        return setupEnclosure({
            ...input,
            scenario: "SpinnerRegularEnclosure",
            compositeId: input.compositeId || "spinner-regular",
            layers: [{ id: "inner", vertices: rectangle(20, 5, 24, 13), gate: { x: 20, y: 9 } }],
        });
    }

    function setupConcave(input = {}) {
        return setupEnclosure({
            ...input,
            scenario: "SpinnerConcaveEnclosure",
            compositeId: input.compositeId || "spinner-concave",
            layers: [
                {
                    id: "inner",
                    vertices: [
                        { x: 15, y: 5 },
                        { x: 22, y: 5 },
                        { x: 22, y: 12 },
                        { x: 20, y: 12 },
                        { x: 20, y: 10 },
                        { x: 15, y: 10 },
                    ],
                    core: { x: 18, y: 8 },
                    gate: { x: 15, y: 7 },
                },
            ],
        });
    }

    function setupNested(input = {}) {
        return setupEnclosure({
            ...input,
            scenario: "SpinnerNestedEnclosure",
            compositeId: input.compositeId || "spinner-nested",
            layers: [
                { id: "inner", vertices: rectangle(10, 7, 16, 13), gate: { x: 10, y: 10 } },
                { id: "outer", vertices: rectangle(7, 4, 19, 16), gate: { x: 7, y: 10 } },
            ],
        });
    }

    function setupInsufficient(input = {}) {
        return setupEnclosure({
            ...input,
            scenario: "SpinnerInsufficientEnclosure",
            compositeId: input.compositeId || "spinner-insufficient",
            layers: [{ id: "inner", vertices: rectangle(4, 4, 7, 7), gate: { x: 4, y: 5 } }],
            fallbackLine: input.fallbackLine || {
                fieldId: "spinner-insufficient-line",
                anchors: [
                    { x: 8, y: 8 },
                    { x: 8, y: 12 },
                ],
            },
        });
    }

    function setupAutonomous(input = {}) {
        const encounter = api.SpinnerNativeField.ensureMap({ scenario: input.scenario || "autonomous-line" });
        encounter.autonomous = true;
        const ai = api.SpinnerAI.beginTurn({ ...input, activate: true });
        return { started: Object.keys(ai?.groups || {}).length > 0, encounter, ai };
    }

    function setupCooperative(input = {}) {
        const ownerIds =
                input.ownerIds ||
                KDMapData.Entities.filter(
                    (entity) => entity.hp > 0 && entity.Enemy?.name === "Spinner" && KDHostile(entity),
                ).map((entity) => entity.id),
            setup = input.layers
                ? setupEnclosure({ ...input, ownerIds, scenario: "SpinnerCooperativeEnclosure" })
                : setupRegular({ ...input, ownerIds, scenario: "SpinnerCooperativeEnclosure" });
        if (!setup.started) return setup;
        setup.encounter.builders = {};
        setup.encounter.autonomous = true;
        const ai = api.SpinnerAI.beginTurn({ ...input, activate: true, adoptExisting: true });
        return { ...setup, ai };
    }

    const REGISTRY = Object.freeze({
        "single-door": Object.freeze({ setup: "doorway", actorCounts: [2], geometry: "one-cell-door" }),
        "two-cell-corridor": Object.freeze({
            setup: "autonomous",
            actorCounts: [2, 4, 8],
            geometry: "two-cell-corridor",
        }),
        "t-junction": Object.freeze({ setup: "autonomous", actorCounts: [2, 4, 8], geometry: "t-junction" }),
        "cross-junction": Object.freeze({ setup: "autonomous", actorCounts: [2, 4, 8], geometry: "cross-junction" }),
        "regular-room": Object.freeze({ setup: "regular", actorCounts: [2, 4, 8], geometry: "regular-room" }),
        "irregular-concave-room": Object.freeze({ setup: "concave", actorCounts: [2, 4, 8], geometry: "concave-room" }),
        "exit-vicinity": Object.freeze({ setup: "autonomous", actorCounts: [2, 4, 8], geometry: "protected-exit" }),
        "insufficient-space": Object.freeze({
            setup: "insufficient",
            actorCounts: [2, 4, 8],
            geometry: "insufficient-space",
        }),
        "overlapping-groups": Object.freeze({ setup: "cooperative", actorCounts: [4, 8], geometry: "shared-overlap" }),
        "nested-fields": Object.freeze({ setup: "nested", actorCounts: [4, 8], geometry: "nested-fields" }),
    });
    let activeScene;
    let actorOriginals = new Map();
    let priorProxyEntities = [];

    function sceneMapSnapshot(sceneId) {
        const cells = [];
        for (let y = 1; y < 11; y++)
            for (let x = 1; x < 17; x++)
                cells.push({
                    x,
                    y,
                    floor:
                        sceneId === "two-cell-corridor"
                            ? [5, 6].includes(y)
                            : sceneId === "t-junction"
                              ? x === 3 || y === 6
                              : sceneId === "cross-junction"
                                ? x === 8 || y === 6
                                : sceneId === "exit-vicinity"
                                  ? y === 6 || (x === 13 && y >= 4 && y <= 8)
                                  : true,
                    protected: sceneId === "exit-vicinity" && x === 16 && y === 6,
                    locked: false,
                });
        const byScene = {
            "two-cell-corridor": {
                chokes: [
                    { x: 8, y: 5 },
                    { x: 8, y: 6 },
                ],
                line: [
                    { x: 8, y: 5 },
                    { x: 8, y: 6 },
                ],
            },
            "t-junction": {
                chokes: [{ x: 3, y: 4 }],
                line: [
                    { x: 3, y: 2 },
                    { x: 3, y: 5 },
                ],
            },
            "cross-junction": {
                chokes: [{ x: 8, y: 6 }],
                line: [
                    { x: 6, y: 6 },
                    { x: 10, y: 6 },
                ],
            },
            "exit-vicinity": {
                chokes: [],
                line: [
                    { x: 13, y: 4 },
                    { x: 13, y: 8 },
                ],
            },
        }[sceneId];
        return {
            width: 18,
            height: 12,
            cells,
            entrances: [{ x: 1, y: 6 }],
            exits: [{ x: 16, y: 6 }],
            chokes: byScene?.chokes || [],
            nests: [],
            candidateLines: byScene ? [byScene.line] : [],
        };
    }

    function sceneEnclosureMap() {
        const floor = [];
        for (let y = 1; y < 20; y++) for (let x = 1; x < 30; x++) floor.push(`${x},${y}`);
        return { width: 31, height: 21, floor, protected: [], occupied: [], exit: { x: 29, y: 10 } };
    }

    function enclosureTerrainSnapshot() {
        const map = sceneEnclosureMap();
        return {
            cells: map.floor.map((key) => {
                const [x, y] = key.split(",").map(Number);
                return { x, y, floor: true, protected: false };
            }),
        };
    }

    function doorwayTerrainSnapshot() {
        const doorX = KinkyDungeonPlayerEntity.x + 4,
            centerY = KinkyDungeonPlayerEntity.y,
            cells = [];
        for (let y = centerY - 2; y <= centerY + 2; y++)
            for (let x = doorX - 3; x <= doorX + 3; x++) cells.push({ x, y, floor: y === centerY, protected: false });
        return { cells };
    }

    function restoreOwnedState(control) {
        if (!control) return;
        const priorIds = new Set((control.priorProxies || []).map((proxy) => proxy.id));
        for (const entity of [...KDMapData.Entities])
            if (
                api.SpinnerNativeField.isOwnedProxy?.(entity) &&
                !priorIds.has(entity.id) &&
                typeof KDRemoveEntity === "function"
            )
                KDRemoveEntity(entity, false, false, true);
        for (const original of control.terrainOriginals || []) {
            if (typeof KinkyDungeonMapSet === "function") KinkyDungeonMapSet(original.x, original.y, original.tile);
            if (typeof KinkyDungeonTilesSet === "function") {
                const key = `${original.x},${original.y}`;
                if (original.tileData === undefined && typeof KinkyDungeonTilesDelete === "function")
                    KinkyDungeonTilesDelete(key);
                else KinkyDungeonTilesSet(key, original.tileData);
            }
        }
        if (control.priorEncounter) KDMapData[api.SpinnerNativeField.KEY] = control.priorEncounter;
        else delete KDMapData[api.SpinnerNativeField.KEY];
        for (const proxy of priorProxyEntities.length ? priorProxyEntities : control.priorProxies || [])
            if (!KDMapData.Entities.some((entity) => entity.id === proxy.id)) KDMapData.Entities.push(proxy);
        for (const original of control.actorOriginals || []) {
            const actor = KDMapData.Entities.find((entity) => entity.id === original.id);
            if (actor) Object.assign(actor, { aware: original.aware, vp: original.vp });
        }
        api.SpinnerNativeField.reconcile?.();
    }

    function setupOverlap(input = {}) {
        const owners = input.ownerIds || [],
            split = Math.max(2, Math.floor(owners.length / 2)),
            encounter = api.SpinnerNativeField.ensureMap({ scenario: input.scenario });
        api.SpinnerNativeField.addLine({
            fieldId: "scenario-overlap-a",
            owners: owners.slice(0, split),
            anchors: [
                { x: 8, y: 4 },
                { x: 8, y: 8 },
            ],
            scenario: input.scenario,
        });
        api.SpinnerNativeField.addLine({
            fieldId: "scenario-overlap-b",
            owners: owners.slice(split),
            anchors: [
                { x: 8, y: 6 },
                { x: 12, y: 6 },
            ],
            scenario: input.scenario,
        });
        return { started: owners.length >= 4, encounter };
    }

    function setupScene(sceneId, input = {}) {
        const definition = REGISTRY[sceneId];
        if (!definition) return { started: false, reason: "unknown-scene" };
        const actorCount = definition.actorCounts.includes(input.actorCount)
                ? input.actorCount
                : definition.actorCounts[0],
            selectedActors = (input.ownerIds || [])
                .map((id) => KDMapData.Entities.find((entity) => entity.id === id))
                .filter((entity) => entity?.hp > 0 && entity.Enemy?.name === "Spinner" && KDHostile(entity))
                .slice(0, actorCount),
            target =
                input.targetKind === "npc"
                    ? input.target ||
                      KDMapData.Entities.find(
                          (entity) =>
                              entity.id === input.targetId ||
                              (input.targetId === undefined &&
                                  entity.hp > 0 &&
                                  !entity.player &&
                                  entity.Enemy &&
                                  !selectedActors.includes(entity) &&
                                  KDHostile(selectedActors[0], entity)),
                      )
                    : KinkyDungeonPlayerEntity,
            options = {
                ...input,
                sceneId,
                actorCount,
                ownerIds: selectedActors.map((actor) => actor.id),
                scenario: `SpinnerScenario:${sceneId}`,
                sceneConditions: { geometry: definition.geometry, ...(input.sceneConditions || {}) },
                map: input.map || sceneEnclosureMap(),
                hostile: (entity) => selectedActors.includes(entity) && KDHostile(entity),
            },
            priorEncounter = KDMapData[api.SpinnerNativeField.KEY]
                ? JSON.parse(JSON.stringify(KDMapData[api.SpinnerNativeField.KEY]))
                : undefined;
        if (selectedActors.length !== actorCount) return { started: false, reason: "actors" };
        if (input.targetKind === "npc" && !target) return { started: false, reason: "target" };
        const terrainSnapshot =
                sceneId === "single-door"
                    ? doorwayTerrainSnapshot()
                    : definition.setup === "autonomous"
                      ? sceneMapSnapshot(sceneId)
                      : enclosureTerrainSnapshot(),
            terrainOriginals = [];
        if (terrainSnapshot && typeof KinkyDungeonMapSet === "function")
            for (const cell of terrainSnapshot.cells) {
                const key = `${cell.x},${cell.y}`,
                    tileData = typeof KinkyDungeonTilesGet === "function" ? KinkyDungeonTilesGet(key) : undefined;
                terrainOriginals.push({ x: cell.x, y: cell.y, tile: KinkyDungeonMapGet(cell.x, cell.y), tileData });
                KinkyDungeonMapSet(cell.x, cell.y, cell.floor ? "." : "1");
                if (cell.protected && typeof KinkyDungeonTilesSet === "function")
                    KinkyDungeonTilesSet(key, { ...(tileData || {}), Protected: true });
            }
        priorProxyEntities = KDMapData.Entities.filter((entity) => api.SpinnerNativeField.isOwnedProxy?.(entity));
        KDMapData.Entities = KDMapData.Entities.filter((entity) => !priorProxyEntities.includes(entity));
        KDGameData[CONTROL] = {
            version: 1,
            sceneId,
            actorCount,
            ownerIds: options.ownerIds,
            targetKind: input.targetKind === "npc" ? "npc" : "player",
            targetId: target?.id,
            awareness: input.awareness || "unaware",
            geometry: definition.geometry,
            priorEncounter,
            priorProxies: priorProxyEntities.map((entity) => JSON.parse(JSON.stringify(entity))),
            terrainOriginals,
            actorOriginals: selectedActors.map((actor) => ({ id: actor.id, aware: actor.aware, vp: actor.vp })),
        };
        const setup =
            definition.setup === "doorway"
                ? setupDoorway(options)
                : definition.setup === "regular"
                  ? setupRegular(options)
                  : definition.setup === "concave"
                    ? setupConcave(options)
                    : definition.setup === "nested"
                      ? setupNested(options)
                      : definition.setup === "insufficient"
                        ? setupInsufficient(options)
                        : definition.setup === "cooperative"
                          ? setupOverlap(options)
                          : setupAutonomous({
                                ...options,
                                mapSnapshot: input.mapSnapshot || sceneMapSnapshot(sceneId),
                            });
        if (setup?.started && setup.encounter) {
            actorOriginals = new Map();
            for (const id of options.ownerIds) {
                const actor = KDMapData.Entities.find((entity) => entity.id === id);
                if (!actor) continue;
                actorOriginals.set(id, { aware: actor.aware, vp: actor.vp });
                actor.aware = options.awareness !== "unaware";
                actor.vp = options.awareness === "lost-contact" ? 0 : actor.aware ? 1 : 0;
            }
            setup.encounter.debugScenario = {
                owner: "SpiderlingsSpinnerScenarios",
                sceneId,
                actorCount,
                targetKind: input.targetKind === "npc" ? "npc" : "player",
                awareness: input.awareness || "unaware",
                geometry: definition.geometry,
                ownerIds: [...options.ownerIds],
                targetId: target?.id,
            };
            if (setup.ai)
                for (const group of Object.values(setup.ai.groups || {}))
                    group.engagement = {
                        ...(group.engagement || {}),
                        target: { kind: input.targetKind === "npc" ? "npc" : "player", id: target?.id },
                    };
            activeScene = setup.encounter.debugScenario;
        } else {
            restoreOwnedState(KDGameData[CONTROL]);
            delete KDGameData[CONTROL];
        }
        return {
            ...setup,
            sceneId,
            actorCount,
            targetKind: input.targetKind || "player",
            awareness: input.awareness || "unaware",
        };
    }

    function inspectScene() {
        const encounter = api.SpinnerNativeField.state();
        return {
            scene: activeScene ? { ...activeScene } : undefined,
            encounter: encounter ? JSON.parse(JSON.stringify(encounter)) : undefined,
            playerCapture: api.SpinnerCapture?.state?.(),
            npcCapture: api.SpinnerNPCCapture?.state?.(),
            playerRecovery: api.SpinnerRecovery?.state?.(),
            npcRecovery: api.SpinnerNPCRecovery?.state?.(),
            routes: Object.keys(encounter?.topology?.composites || {}).map((id) => ({
                compositeId: id,
                reachability: api.SpinnerNativeField.nativeReachability?.(id, KinkyDungeonPlayerEntity),
            })),
            equipment:
                typeof KinkyDungeonAllRestraintDynamic === "function"
                    ? KinkyDungeonAllRestraintDynamic().map((entry) => ({
                          id: entry.item.id,
                          name: entry.item.name,
                          data: entry.item.data,
                      }))
                    : [],
        };
    }

    function stepScene() {
        if (!activeScene || typeof KDSendInput !== "function") return "Blocked";
        return KDSendInput("tick", { delta: 1 });
    }

    function damageStructure(data = {}) {
        if (!activeScene) return { applied: false, reason: "inactive", debugInjected: true };
        const enemy =
            data.enemy ||
            KDMapData.Entities.find(
                (entity) => entity.x === data.x && entity.y === data.y && api.SpinnerNativeField.isOwnedProxy?.(entity),
            );
        if (!enemy) return { applied: false, reason: "target", debugInjected: true };
        api.SpinnerNativeField.onNativeDamage({
            enemy,
            dmgDealt: Math.max(0, Number(data.amount) || 0),
            incomingDamage: { flags: ["SpiderlingsDebugStructuralDamage"] },
        });
        return { applied: true, debugInjected: true };
    }

    function exportScene() {
        return JSON.stringify({
            scene: activeScene,
            mapSeed: KDMapData?.RandomPathablePointsSeed,
            mapIdentity: KDGameData?.RoomType || KDMapData?.RoomType || "ordinary",
            gameVersion: typeof TextGet === "function" ? TextGet("KDVersionStr") : undefined,
            tick: typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0,
            state: inspectScene(),
        });
    }

    function teardownScene() {
        const encounter = api.SpinnerNativeField.state();
        if (!encounter?.debugScenario || encounter.debugScenario.owner !== "SpiderlingsSpinnerScenarios") return false;
        for (const entity of [...KDMapData.Entities])
            if (api.SpinnerNativeField.isOwnedProxy?.(entity) && typeof KDRemoveEntity === "function")
                KDRemoveEntity(entity, false, false, true);
        const control = KDGameData?.[CONTROL];
        for (const [id, original] of actorOriginals) {
            const actor = KDMapData.Entities.find((entity) => entity.id === id);
            if (actor) Object.assign(actor, original);
        }
        restoreOwnedState(control);
        delete KDGameData[CONTROL];
        activeScene = undefined;
        actorOriginals = new Map();
        return true;
    }

    function restoreScenarioControl() {
        const control = KDGameData?.[CONTROL],
            encounter = api.SpinnerNativeField.state();
        if (!control || !encounter?.debugScenario) return false;
        activeScene = encounter.debugScenario;
        actorOriginals = new Map(
            (control.actorOriginals || []).map((entry) => [entry.id, { aware: entry.aware, vp: entry.vp }]),
        );
        priorProxyEntities = control.priorProxies || [];
        return true;
    }

    if (typeof KDEventMapGeneric !== "undefined" && typeof KDAddEvent === "function")
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", CONTROL, restoreScenarioControl);

    if (typeof KDInputTypes !== "undefined")
        KDInputTypes.spiderlingsSpinnerDoorway = () =>
            setupFromNearbySpinners().started ? "SpinnerDoorwayStarted" : "SpinnerDoorwayBlocked";
    if (typeof KDInputTypes !== "undefined")
        KDInputTypes.spiderlingsSpinnerAutonomous = () =>
            setupAutonomous().started ? "SpinnerAutonomousStarted" : "SpinnerAutonomousBlocked";
    if (typeof KDInputTypes !== "undefined")
        KDInputTypes.spiderlingsSpinnerCooperative = () =>
            setupCooperative().started ? "SpinnerCooperativeStarted" : "SpinnerCooperativeBlocked";

    api.SpinnerScenarios = {
        SCENARIO,
        plan,
        setupDoorway,
        setupFromNearbySpinners,
        setupEnclosure,
        setupRegular,
        setupConcave,
        setupNested,
        setupInsufficient,
        setupAutonomous,
        setupCooperative,
        REGISTRY,
        setupScene,
        inspectScene,
        stepScene,
        damageStructure,
        exportScene,
        teardownScene,
        sceneMapSnapshot,
        sceneEnclosureMap,
        restoreScenarioControl,
    };
})();
