"use strict";

// Prison intelligence is a map-local report, not a second enemy targeting system.
(() => {
    const api = globalThis.Spiderlings,
        REPORT_AGE = 12,
        LOCAL_RADIUS = 8,
        PLACERS = new Set(["Spinner", "WebCaster", "Tunneler"]);

    function state() {
        if (!api.Prison?.isPrison()) return undefined;
        return KDMapData?.SpiderlingsPrison;
    }

    function regionAt(point) {
        if (!point) return undefined;
        const regions = state()?.regions;
        if (regions)
            return regions.find(
                (region) =>
                    point.x >= region.left &&
                    point.x <= region.right &&
                    point.y >= region.top &&
                    point.y <= region.bottom,
            )?.id;
        if (point.x <= 20 && point.y >= 12 && point.y <= 32) return "chamber";
        if (point.y < 17) return "upper";
        if (point.y > 27) return "lower";
        if (point.x <= 30) return "crossroads";
        if (point.x <= 41) return "main-nest";
        return "outer-exit";
    }

    function alerts() {
        const prison = state();
        if (!prison) return undefined;
        prison.alerts ||= { version: 1, serial: 0, report: null, regions: {}, lastAgedTick: null };
        return prison.alerts;
    }

    function reportAge(report) {
        const now = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : undefined;
        // KD 5.5 resets its saved world tick to zero after 100000.
        const elapsed =
            Number.isFinite(now) && Number.isFinite(report?.tick)
                ? now >= report.tick
                    ? now - report.tick
                    : now + 100001 - report.tick
                : 0;
        return Math.max(report?.age || 0, elapsed);
    }

    function currentReport() {
        const saved = alerts()?.report;
        return saved && reportAge(saved) < REPORT_AGE ? saved : undefined;
    }

    function currentRegionReport(region) {
        const saved = alerts()?.regions?.[region];
        return saved && reportAge(saved) < REPORT_AGE ? saved : undefined;
    }

    function canPlace(entity) {
        return PLACERS.has(entity?.Enemy?.name) || entity?.SpiderlingsPrisonPlacementAbility === true;
    }

    function planningPoint(region) {
        const report = currentReport();
        if (!report) return undefined;
        if (report.region === region)
            return { ...report, target: { kind: "player", id: KinkyDungeonPlayerEntity.id ?? "player" } };
        const candidates = [];
        const floor = (x, y) =>
            KinkyDungeonGroundTiles.includes(KinkyDungeonMapGet(x, y)) &&
            regionAt({ x, y }) === region &&
            api.PrisonNest.ordinaryConstructionAllowed({ x, y }) &&
            !KinkyDungeonTilesGet(`${x},${y}`)?.OffLimits;
        for (let y = 3; y < KDMapData.GridHeight - 3; y++)
            for (let x = 3; x < KDMapData.GridWidth - 3; x++) {
                if (!floor(x, y)) continue;
                let room = true;
                for (let dy = -2; dy <= 2 && room; dy++)
                    for (let dx = -2; dx <= 2; dx++) if (!floor(x + dx, y + dy)) room = false;
                if (room) candidates.push({ x, y });
            }
        candidates.sort(
            (a, b) =>
                Math.hypot(a.x - report.x, a.y - report.y) - Math.hypot(b.x - report.x, b.y - report.y) ||
                a.y - b.y ||
                a.x - b.x,
        );
        const site = candidates[0];
        return site
            ? {
                  ...report,
                  ...site,
                  reported: { x: report.x, y: report.y },
                  target: { kind: "player", id: KinkyDungeonPlayerEntity.id ?? "player" },
                  source: "prison-interception",
              }
            : undefined;
    }

    function observe(enemy, player, aiData = {}) {
        const saved = alerts();
        if (
            !saved ||
            !enemy ||
            enemy.hp <= 0 ||
            enemy.Enemy?.tags?.spiderlings !== true ||
            player !== KinkyDungeonPlayerEntity ||
            player?.player !== true ||
            aiData.hostile !== true ||
            aiData.canSeePlayer !== true ||
            !KDHostile(enemy, player)
        )
            return false;
        const region = regionAt(player),
            tick = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0,
            prior = saved.report;
        if (
            prior &&
            reportAge(prior) < REPORT_AGE &&
            prior.x === player.x &&
            prior.y === player.y &&
            prior.region === region
        ) {
            prior.age = 0;
            prior.tick = tick;
            saved.regions[region] = { ...prior };
        } else {
            const report = { x: player.x, y: player.y, region, serial: ++saved.serial, age: 0, tick };
            saved.report = report;
            saved.regions[region] = { ...report };
        }
        for (const nearby of KDMapData.Entities || []) {
            if (
                nearby.hp <= 0 ||
                !canPlace(nearby) ||
                !KDHostile(nearby, player) ||
                regionAt(nearby) !== region ||
                Math.max(Math.abs(nearby.x - player.x), Math.abs(nearby.y - player.y)) > LOCAL_RADIUS
            )
                continue;
            nearby.SpiderlingsPrisonAlert = { region, serial: saved.report.serial };
            nearby.aware = true;
            nearby.gx = player.x;
            nearby.gy = player.y;
        }
        return true;
    }

    function advance(delta) {
        const saved = alerts();
        if (!saved || !(delta > 0)) return;
        const tick = typeof KinkyDungeonCurrentTick === "number" ? KinkyDungeonCurrentTick : 0;
        if (saved.lastAgedTick === tick) return;
        saved.lastAgedTick = tick;
        if (saved.report) saved.report.age++;
        for (const report of Object.values(saved.regions)) report.age++;
        for (const order of Object.values(saved.workerOrders || {})) order.age += delta;
    }

    function assignedWorkers() {
        const saved = alerts();
        const report = currentReport();
        if (!saved || !report) return [];
        saved.workerOrders ||= {};
        const encounter = api.SpinnerNativeField.state();
        const active = Object.values(encounter?.ai?.groups || {}).filter((group) => {
            const plan = encounter.ai.plans[group.planId];
            return !group.managedComposite && plan && !["invalid", "abandoned", "retired"].includes(plan.status);
        });
        const activeRegions = new Set(active.map((group) => group.homeRegion));
        let slots = Math.max(0, (encounter?.ai?.projects?.maximum ?? 0) - active.length);
        const regions = new Map();
        for (const actor of KDMapData.Entities) {
            if (
                actor.Enemy?.name !== "Spinner" ||
                !(actor.hp > 0) ||
                !KDHostile(actor, KinkyDungeonPlayerEntity) ||
                KDAllied(actor) ||
                KDIsInParty(actor) ||
                KDHelpless(actor) ||
                KinkyDungeonIsDisabled(actor) ||
                api.FieldCommand.protectedMember(actor) ||
                !api.PrisonNest.ordinaryConstructionAllowed(actor)
            )
                continue;
            const region = regionAt(actor);
            if (!regions.has(region)) regions.set(region, []);
            regions.get(region).push(actor);
        }
        const assigned = [];
        for (const [region, actors] of regions) {
            if (activeRegions.has(region)) continue;
            let order = saved.workerOrders[region];
            if ((!order || order.serial !== report.serial) && slots > 0 && actors.length >= 2) {
                const ids = actors
                    .sort(
                        (a, b) =>
                            Math.hypot(a.x - report.x, a.y - report.y) - Math.hypot(b.x - report.x, b.y - report.y) ||
                            a.id - b.id,
                    )
                    .slice(0, 4)
                    .map((actor) => actor.id);
                order = saved.workerOrders[region] = { serial: report.serial, age: 0, ids };
            }
            if (order?.age < REPORT_AGE && slots > 0) {
                slots--;
                assigned.push(...order.ids.filter((id) => actors.some((actor) => actor.id === id)));
            }
        }
        return assigned;
    }

    function audit() {
        const saved = alerts();
        if (!saved) return;
        const valid = (report) =>
            report &&
            Number.isInteger(report.x) &&
            Number.isInteger(report.y) &&
            report.x > 0 &&
            report.y > 0 &&
            report.x < KDMapData.GridWidth - 1 &&
            report.y < KDMapData.GridHeight - 1 &&
            Number.isInteger(report.serial) &&
            Number.isInteger(report.age) &&
            report.age >= 0 &&
            regionAt(report) === report.region;
        if (!valid(saved.report)) saved.report = null;
        for (const [region, report] of Object.entries(saved.regions || {}))
            if (!valid(report) || report.region !== region) delete saved.regions[region];
        saved.serial = Math.max(0, saved.serial || 0, saved.report?.serial || 0);
    }

    api.NativeActions?.registerBehavior("PrisonAlerts", {
        beforeNativeMove: (enemy, player, data) => {
            if (!(enemy.SpiderlingsSpinnerRuntimeDelta > 0)) return undefined;
            observe(enemy, player, data);
            if (
                !state() ||
                player !== KinkyDungeonPlayerEntity ||
                data.canSensePlayer ||
                data.canSeePlayer ||
                data.canSeePlayerChase
            )
                return undefined;
            const encounter = api.SpinnerNativeField?.state(),
                report = currentReport();
            const member = encounter?.command?.members?.[enemy.id];
            const group = encounter?.ai?.groups?.[member?.home];
            if (
                !group?.homeRegion ||
                !report ||
                report.region === group.homeRegion ||
                KDMapData.SpiderlingsPrison.patrols?.[enemy.id]
            )
                return undefined;
            // Native faction awareness can otherwise send an unseen, idle
            // builder after the live player before a legal local project exists.
            data.ignore = true;
            data.moveTowardPlayer = false;
            enemy.gx = enemy.x;
            enemy.gy = enemy.y;
            return true;
        },
    });
    KDAddEvent(KDEventMapGeneric, "tickAfter", "SpiderlingsPrisonAlerts", (_event, data) => advance(data?.delta));
    KDAddEvent(KDEventMapGeneric, "afterLoadGame", "SpiderlingsPrisonAlerts", audit);
    api.PrisonAlerts = {
        regionAt,
        currentReport,
        currentRegionReport,
        canPlace,
        observe,
        advance,
        audit,
        planningPoint,
        assignedWorkers,
    };
})();
