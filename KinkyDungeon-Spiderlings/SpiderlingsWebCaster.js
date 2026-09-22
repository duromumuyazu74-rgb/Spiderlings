"use strict";

(() => {
    const api = globalThis.Spiderlings;
    // Shared qualification for direct-hit cooperation and native movement preference.
    api.activeWebCasters = function (player) {
        if (
            !player ||
            typeof KDMapData == "undefined" ||
            typeof KDHostile != "function" ||
            typeof KinkyDungeonCheckPath != "function"
        )
            return [];
        return (KDMapData.Entities || []).filter(
            (enemy) =>
                enemy.Enemy?.name === "WebCaster" &&
                enemy.hp > 0 &&
                enemy.aware &&
                KDHostile(enemy, player) &&
                !(enemy.stun > 0 || enemy.freeze > 0 || enemy.silence > 0 || enemy.teleporting > 0) &&
                !(typeof KDHelpless == "function" && KDHelpless(enemy)) &&
                Math.hypot(enemy.x - player.x, enemy.y - player.y) <= 6 &&
                KinkyDungeonCheckPath(enemy.x, enemy.y, player.x, player.y, false, false),
        );
    };

    // KD hunt targets its own tile at melee distance, which can suppress retreat
    // even after the native kite gate succeeds. Keep the normal movement gates.
    if (typeof KDAIType != "undefined" && KDAIType.hunt) {
        KDAIType.hunt.beforemove = api.Hooks.wrap(
            "WebCaster.hunt",
            KDAIType.hunt.beforemove,
            (beforemove) =>
                function (enemy, player, aiData) {
                    const handled = beforemove.apply(this, arguments);
                    if (
                        !handled &&
                        enemy.Enemy.name === "WebCaster" &&
                        aiData.kite &&
                        enemy.gx === enemy.x &&
                        enemy.gy === enemy.y &&
                        !KDEnemyHasFlag(enemy, "StayHere") &&
                        !KDEnemyHasFlag(enemy, "overrideMove")
                    ) {
                        enemy.gx = enemy.x + Math.sign(enemy.x - player.x);
                        enemy.gy = enemy.y + Math.sign(enemy.y - player.y);
                    }
                    return handled;
                },
        );
    }

    // A direction preference inside KD's existing movement attempt, never an extra action.
    if (typeof KDGetDir == "function") {
        const nativeGetDir = KDGetDir;
        KDGetDir = function (enemy, target, _func) {
            const original = nativeGetDir.apply(this, arguments);
            if (
                enemy.Enemy?.name !== "WebCaster" ||
                typeof AIData == "undefined" ||
                !AIData.kite ||
                !original ||
                (!original.x && !original.y) ||
                KDEnemyHasFlag(enemy, "StayHere") ||
                KDEnemyHasFlag(enemy, "overrideMove") ||
                KDIsImmobile(enemy)
            )
                return original;
            const player = KinkyDungeonPlayerEntity;
            // KD also calls this for NPC rivals and coordinate path goals.
            // Only spread firing angles while retreating from the player itself.
            if (target !== player) return original;
            const casters = api.activeWebCasters(player);
            if (!casters.includes(enemy) || casters.length < 2) return original;
            const partners = casters.filter((entry) => entry !== enemy);
            const separation = (x, y) =>
                Math.min(
                    ...partners.map((partner) => {
                        const ax = x - player.x,
                            ay = y - player.y;
                        const bx = partner.x - player.x,
                            by = partner.y - player.y;
                        return 1 - (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
                    }),
                );
            const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
            let best = original;
            let score =
                Math.max(separation(enemy.x, enemy.y), separation(enemy.x + original.x, enemy.y + original.y)) + 0.01;
            for (let dx = -1; dx <= 1; dx++)
                for (let dy = -1; dy <= 1; dy++) {
                    if (!dx && !dy) continue;
                    const x = enemy.x + dx,
                        y = enemy.y + dy;
                    const range = Math.hypot(x - player.x, y - player.y);
                    const candidate = { x: dx, y: dy, delta: Math.round(Math.hypot(dx, dy) * 2) / 2 };
                    if (
                        range < Math.max(2, distance) ||
                        range > 6 ||
                        !KinkyDungeonEnemyCanMove(
                            enemy,
                            candidate,
                            AIData.MovableTiles,
                            AIData.AvoidTiles,
                            AIData.ignoreLocks,
                            0,
                        ) ||
                        !KinkyDungeonCheckPath(x, y, player.x, player.y, false, false)
                    )
                        continue;
                    const next = separation(x, y);
                    if (next > score) {
                        score = next;
                        best = candidate;
                    }
                }
            return best;
        };
    }
})();
