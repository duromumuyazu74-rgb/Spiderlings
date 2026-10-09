/* exported KDGenMapCallback */
(async () => {
    const results = (globalThis.normalTrace = []);
    const expected = ["MageSpiderlings", "Spinner", "Spinner", "Jumper", "WebCaster", "WebCaster"].sort().join(",");
    const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    // Keep native SFX I/O out of timing and avoid the upstream MiniWind path defect.
    const sound = KDToggles.Sound;
    KDToggles.Sound = false;
    try {
        for (const [zone, floor] of [
            ["grv", 5],
            ["cat", 7],
            ["lib", 12],
        ]) {
            for (let seed = 0; seed < 10; seed++) {
                const gameSeed = `normal-acceptance-${zone}-${floor}-${seed}`;
                globalThis.compatibilitySetSeed(gameSeed);
                KinkyDungeonStartNewGame(false);
                MiniGameKinkyDungeonLevel = floor;
                globalThis.compatibilitySetSeed(gameSeed);
                let start = performance.now();
                KinkyDungeonCreateMap(
                    KinkyDungeonMapParams[zone],
                    "",
                    "SpiderlingsHuntingGrounds",
                    floor,
                    false,
                    false,
                    "Maidforce",
                    { x: seed, y: floor },
                    false,
                );
                const generationMs = performance.now() - start;
                const state = KDMapData.SpiderlingsHuntingGrounds;
                const nests = KDMapData.Entities.filter((enemy) => state?.targetIds?.includes(enemy.id));
                const guards = nests.map((nest) => ({
                    id: nest.id,
                    x: nest.x,
                    y: nest.y,
                    names: KDMapData.Entities.filter((enemy) => enemy.SpiderlingsNestParentID === nest.id)
                        .map((enemy) => enemy.Enemy.name)
                        .sort(),
                }));
                if (
                    state?.status === "active" &&
                    (nests.some((nest) => nest.hp <= 0) ||
                        state.complete ||
                        state.destroyedIds.length !== 0 ||
                        KDGetEscapeMethod(floor) !== "SpiderlingsHuntingGrounds" ||
                        KinkyDungeonEscapeTypes.SpiderlingsHuntingGrounds.check())
                )
                    throw Error(`Fresh Hunting task is not live and blocked: ${JSON.stringify({ zone, floor, seed })}`);
                const cancelled =
                    state?.status === "cancelled" &&
                    ["insufficient-space", "population-budget", "garrison-failed", "creation-failed"].includes(
                        state.reason,
                    );
                if (cancelled)
                    throw Error(
                        `Eligible Maidforce Hunting Grounds lost its three-nest objective: ${JSON.stringify({ zone, floor, seed, reason: state.reason })}`,
                    );
                if (cancelled && (nests.length || KDMapData.MapMod === "SpiderlingsHuntingGrounds"))
                    throw Error("Cancelled floor retained an impossible objective");
                if (
                    !cancelled &&
                    (state?.status !== "active" ||
                        nests.length !== 3 ||
                        guards.some((row) => row.names.join(",") !== expected))
                )
                    throw Error(`Hunting Grounds layout: ${JSON.stringify({ zone, floor, seed, state, guards })}`);
                for (const a of nests)
                    for (const b of nests)
                        if (a !== b && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < 9)
                            throw Error("Original objective nests overlap");
                const liveNests = KDMapData.Entities.filter(
                    (entity) => entity.hp > 0 && entity.Enemy.name === "NestEntrance",
                );
                const outsiders = KDMapData.Entities.filter(
                    (entity) =>
                        entity.hp > 0 &&
                        !entity.Enemy.tags?.spiderlings &&
                        entity.Enemy.name !== "NestEntrance" &&
                        !entity.Enemy.tags?.scenery &&
                        !(
                            entity.Enemy.immobile &&
                            !entity.Enemy.attack &&
                            !entity.Enemy.tags?.prisoner &&
                            !entity.Enemy.tags?.human &&
                            !entity.Enemy.specialdialogue
                        ) &&
                        !Spiderlings.SpinnerNativeField.isOwnedProxy(entity),
                );
                const clearance = Spiderlings.Population.NPC_NEST_CLEARANCE;
                if (
                    outsiders.some((entity) =>
                        liveNests.some(
                            (nest) => Math.max(Math.abs(entity.x - nest.x), Math.abs(entity.y - nest.y)) < clearance,
                        ),
                    )
                )
                    throw Error("A newly generated non-Spiderlings NPC spawned too close to a Nest");
                const fieldPreset = state?.fieldPreset,
                    initialWebCells = KDMapData.Entities.filter(Spiderlings.SpinnerNativeField.isOwnedProxy).length;
                if (
                    !cancelled &&
                    (fieldPreset?.status !== "placed" ||
                        fieldPreset.fields?.filter((field) => field.radius === 4).length <
                            Math.min(2, state.layout.sites.filter((site) => site.radius === 4).length))
                )
                    throw Error(
                        `New Hunting Grounds skipped its legal large staffed fields: ${JSON.stringify({
                            zone,
                            floor,
                            seed,
                            state,
                            fieldPreset,
                            guards,
                            actors: KDMapData.Entities.filter(
                                (e) => !Spiderlings.SpinnerNativeField.isOwnedProxy(e),
                            ).map((e) => ({
                                id: e.id,
                                name: e.Enemy.name,
                                x: e.x,
                                y: e.y,
                                parent: e.SpiderlingsNestParentID,
                            })),
                        })}`,
                    );
                if (fieldPreset?.status === "placed") {
                    const encounter = Spiderlings.SpinnerNativeField.state(),
                        requiredSites = state.layout.sites.filter((site) => site.radius === 4).slice(0, 2),
                        seenCrews = new Set();
                    let expectedWebCells = 0;
                    if (
                        Object.keys(encounter.topology.composites).length !== fieldPreset.fields.length ||
                        encounter.topology.actionLog.length !== 0 ||
                        requiredSites.some(
                            (site) =>
                                !fieldPreset.fields.some(
                                    (field) =>
                                        field.radius === 4 && field.center.x === site.x && field.center.y === site.y,
                                ),
                        )
                    )
                        throw Error("Preset field count or free initialization changed");
                    for (const field of fieldPreset.fields) {
                        const composite = encounter.topology.composites[field.compositeId],
                            outer = encounter.topology.fields[composite?.layerIds.at(-1)],
                            crew = encounter.ai.groups[field.groupId];
                        expectedWebCells += field.radius * 8 - 1;
                        if (
                            !outer ||
                            ![2, 3, 4].includes(field.radius) ||
                            outer.bounds.right - outer.bounds.left !== field.radius * 2 ||
                            outer.phase !== "ready" ||
                            Spiderlings.SpinnerNativeField.isSpiderlingsWebCell(outer.gateCell) ||
                            !crew ||
                            seenCrews.has(crew.id) ||
                            crew.memberIds.filter((id) =>
                                KDMapData.Entities.some((e) => e.id === id && e.hp > 0 && e.Enemy.name === "Spinner"),
                            ).length < 2 ||
                            composite.layerIds.some((id) =>
                                crew.memberIds.some((owner) => !encounter.topology.fieldOwners[id].includes(owner)),
                            )
                        )
                            throw Error("Preset fields lost live Spinner ownership, open gates or geometry downgrade");
                        if (field.radius === 4) {
                            const authored = state.layout.sites.find(
                                    (site) =>
                                        site.radius === 4 && site.x === field.center.x && site.y === field.center.y,
                                ),
                                assigned = KDMapData.Entities.filter((enemy) => crew.memberIds.includes(enemy.id));
                            if (
                                assigned.length !== 2 ||
                                assigned.some(
                                    (enemy) =>
                                        enemy.SpiderlingsPresetFieldCenter?.x !== authored.x ||
                                        enemy.SpiderlingsPresetFieldCenter?.y !== authored.y ||
                                        Math.max(Math.abs(enemy.x - authored.x), Math.abs(enemy.y - authored.y)) > 1 ||
                                        enemy.SpiderlingsNestParentID !== crew.source?.nestId,
                                ) ||
                                composite.layerIds
                                    .slice(0, -1)
                                    .some(
                                        (id) =>
                                            encounter.topology.fields[id].phase !== "preparing" ||
                                            encounter.topology.anchors.some(
                                                (anchor) => anchor.owners.includes(id) && anchor.built,
                                            ) ||
                                            encounter.topology.links.some(
                                                (link) =>
                                                    link.owners.includes(id) &&
                                                    (link.connected || link.builtCells.length),
                                            ),
                                    )
                            )
                                throw Error(
                                    "Large prefab lost its authored site, initial nest crew or paid inner construction",
                                );
                        }
                        seenCrews.add(crew.id);
                    }
                    if (initialWebCells !== expectedWebCells)
                        throw Error("Preset field proxy count differs from its outer geometry");
                }
                const mobileNames = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"]),
                    ecologyEnemies = KDMapData.Entities.filter(
                        (e) =>
                            e.hp > 0 &&
                            !e.Enemy.immobile &&
                            !e.Enemy.noAttack &&
                            !e.Enemy.tags?.scenery &&
                            !Spiderlings.SpinnerNativeField.isOwnedProxy(e) &&
                            !KDIsInParty(e) &&
                            !KDIsImprisoned(e) &&
                            !KDAllied(e),
                    ),
                    ecologySpiders = ecologyEnemies.filter((e) => mobileNames.has(e.Enemy.name)).length,
                    ecologyRatio = ecologySpiders / ecologyEnemies.length;
                if (cancelled && state.reason === "insufficient-space") {
                    const plan = KDMapData.SpiderlingsPopulationPlan;
                    const authoredMaids = KDMapData.Entities.filter(
                        (e) => e.SpiderlingsHuntingPrey && e.Enemy.faction === "Maidforce",
                    ).length;
                    // Preset shops and their protected guards may exceed the
                    // ordinary prey quota; their authored actors remain native.
                    if (!plan?.layoutFallback || ecologySpiders !== plan.cap || authoredMaids > plan.preyQuota.Maid)
                        throw Error(
                            "Cancelled hunting layout fell back to Maidforce population: " +
                                JSON.stringify({
                                    zone,
                                    floor,
                                    seed,
                                    ecologySpiders,
                                    ecologyRatio,
                                    authoredMaids,
                                    plan,
                                }),
                        );
                }
                if (!cancelled && !KDIsHellFloor(floor) && (ecologyRatio < 0.8 || ecologyRatio > 0.9))
                    throw Error(
                        `Hunting Grounds total mobile ecology missed quota: ${JSON.stringify({
                            zone,
                            floor,
                            seed,
                            ecologySpiders,
                            total: ecologyEnemies.length,
                            plan: KDMapData.SpiderlingsPopulationPlan,
                            enemies: ecologyEnemies.map((e) => ({
                                id: e.id,
                                name: e.Enemy.name,
                                x: e.x,
                                y: e.y,
                                master: e.Enemy.master,
                                keys: e.keys,
                            })),
                        })}`,
                    );
                if (!cancelled) {
                    const authoredPrey = KDMapData.Entities.filter((e) => e.SpiderlingsHuntingPrey);
                    const maids = ecologyEnemies.filter((e) => e.Enemy.faction === "Maidforce");
                    const dressmakers = ecologyEnemies.filter((e) => e.Enemy.name === "Dressmaker");
                    const nurses = ecologyEnemies.filter((e) => e.Enemy.name === "Nurse");
                    const plan = KDMapData.SpiderlingsPopulationPlan;
                    if (
                        Spiderlings.getMapPopulationCap() !==
                            Number(Spiderlings.getSetting("spiderlingsMapPopulationCap")) + 20 ||
                        ecologySpiders !== plan.cap ||
                        maids.length < plan.preyQuota.Maid ||
                        !maids.every((e) => e.Enemy.tags.elite) ||
                        dressmakers.length < 1 ||
                        nurses.length < 1
                    )
                        throw Error(
                            "Initial Hunting Grounds did not provide the full authored spider and elite prey ecology: " +
                                JSON.stringify({
                                    ecologySpiders,
                                    maids: maids.length,
                                    dressmakers: dressmakers.length,
                                    nurses: nurses.length,
                                    plan,
                                }),
                        );
                    for (const a of authoredPrey)
                        for (const b of [...maids, ...dressmakers, ...nurses])
                            if (a !== b && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) < 6)
                                throw Error("Initial hunting prey did not occupy separated positions");
                }
                const initialEntities = KDMapData.Entities.length;
                // Observe the complete ecology off the entrance stair; waiting on
                // that stair can otherwise queue a native ShopStart transition.
                const entrance = KDMapData.StartPosition;
                let observer;
                for (
                    let radius = 1;
                    radius < Math.max(KDMapData.GridWidth, KDMapData.GridHeight) && !observer;
                    radius++
                )
                    for (let dy = -radius; dy <= radius && !observer; dy++)
                        for (let dx = -radius; dx <= radius && !observer; dx++) {
                            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                            const x = entrance.x + dx,
                                y = entrance.y + dy;
                            if (
                                KinkyDungeonMapGet(x, y) === "0" &&
                                !KinkyDungeonEnemyAt(x, y) &&
                                KinkyDungeonFindPath(
                                    entrance.x,
                                    entrance.y,
                                    x,
                                    y,
                                    false,
                                    false,
                                    false,
                                    KinkyDungeonMovableTilesSmartEnemy,
                                )?.length
                            )
                                observer = { x, y };
                        }
                if (!observer) throw Error("No legal observation cell beside the entrance");
                KDMovePlayer(observer.x, observer.y, false);
                KDGenMapCallback = null;
                KinkyDungeonState = "Game";
                KinkyDungeonApplyBuffToEntity(KinkyDungeonPlayerEntity, {
                    id: "HuntingAcceptanceObserver",
                    type: "Sneak",
                    power: 1000,
                    duration: 10000,
                });
                const observedMap = KDMapData;
                const turns = [],
                    planner = [];
                for (let turn = 0; turn < 11; turn++) {
                    start = performance.now();
                    KinkyDungeonLastAction = "Wait";
                    KinkyDungeonAdvanceTime(1, true);
                    if (KDMapData !== observedMap || (!cancelled && KDMapData.MapMod !== "SpiderlingsHuntingGrounds"))
                        throw Error("Hunting Grounds timing escaped to another map");
                    turns.push(performance.now() - start);
                    planner.push(Spiderlings.SpinnerAI.inspect()?.plannerWorkLast ?? 0);
                    await frame();
                }
                results.push({
                    zone,
                    floor,
                    seed,
                    cancelled,
                    generationMs,
                    firstTurnMs: turns[0],
                    steadyTurnMs: turns.slice(1),
                    planner,
                    initialEntities,
                    initialWebCells,
                    fieldPreset: fieldPreset ? structuredClone(fieldPreset) : undefined,
                    finalEntities: KDMapData.Entities.length,
                    guards,
                    validNatural: !KDIsHellFloor(floor),
                    ecologyEnemies: ecologyEnemies.length,
                    ecologySpiders,
                    ecologyRatio,
                    maidCount: ecologyEnemies.filter((e) => e.Enemy.faction === "Maidforce").length,
                    maidShops: ecologyEnemies.filter(
                        (e) => e.Enemy.faction === "Maidforce" && KDEnemyHasFlag(e, "Shop"),
                    ).length,
                    authoredPreyCounts: KDMapData.Entities.filter((e) => e.SpiderlingsHuntingPrey).reduce(
                        (counts, e) => {
                            counts[e.Enemy.name] = (counts[e.Enemy.name] || 0) + 1;
                            return counts;
                        },
                        {},
                    ),
                });
            }
        }
        for (const zone of new Set(results.map((row) => row.zone))) {
            const maps = results.filter((row) => row.zone === zone),
                activeMaps = maps.filter((row) => !row.cancelled).length,
                cancelledMaps = maps.length - activeMaps;
            for (const row of maps) Object.assign(row, { activeMaps, cancelledMaps });
            if (!activeMaps)
                throw Error(
                    `Hunting Grounds cancelled every tested map in ${zone}: ${JSON.stringify({ activeMaps, cancelledMaps })}`,
                );
        }
        return results;
    } finally {
        KDToggles.Sound = sound;
    }
})();
