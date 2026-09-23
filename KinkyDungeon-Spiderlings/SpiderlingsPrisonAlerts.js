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

    function currentReport() {
        const saved = alerts()?.report;
        return saved && saved.age < REPORT_AGE ? saved : undefined;
    }

    function currentRegionReport(region) {
        const saved = alerts()?.regions?.[region];
        return saved && saved.age < REPORT_AGE ? saved : undefined;
    }

    function canPlace(entity) {
        return PLACERS.has(entity?.Enemy?.name) || entity?.SpiderlingsPrisonPlacementAbility === true;
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
        if (prior?.x === player.x && prior.y === player.y && prior.region === region) {
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

    if (typeof KDAIType !== "undefined")
        for (const name of ["hunt", "wander"])
            if (KDAIType[name]?.beforemove)
                KDAIType[name].beforemove = api.Hooks.wrap(
                    `PrisonAlerts.${name}`,
                    KDAIType[name].beforemove,
                    (native) =>
                        function (enemy, player, aiData) {
                            observe(enemy, player, aiData);
                            return native.apply(this, arguments);
                        },
                );
    if (typeof KDEventMapGeneric !== "undefined" && typeof KDAddEvent === "function") {
        KDAddEvent(KDEventMapGeneric, "tickAfter", "SpiderlingsPrisonAlerts", (_event, data) => advance(data?.delta));
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", "SpiderlingsPrisonAlerts", audit);
    }
    api.PrisonAlerts = { regionAt, currentReport, currentRegionReport, canPlace, observe, advance, audit };
})();
