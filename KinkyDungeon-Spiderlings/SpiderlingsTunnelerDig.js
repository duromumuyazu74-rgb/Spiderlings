"use strict";

// The Tunneler's nest dig. The native AI casts SummonNestEntrance and its channel holds the Tunneler on its tile.
// When the channel ends the Tunneler becomes a nest of its own side on that tile. Being disabled or displaced first
// cancels the dig and keeps the Tunneler; dying cancels it with the Tunneler.
(() => {
    const api = globalThis.Spiderlings;
    const DIG = "SpiderlingsNestDig";

    // Saved on the Tunneler, so the dig follows native entity saves and disappears with the entity.
    function digging(entity) {
        return entity?.hp > 0 ? entity[DIG] : undefined;
    }

    function interrupted(tunneler, dig) {
        return tunneler.x !== dig.x || tunneler.y !== dig.y || KinkyDungeonIsDisabled(tunneler) || KDHelpless(tunneler);
    }

    function cancel(tunneler) {
        delete tunneler[DIG];
        tunneler.channel = 0;
    }

    function open(tunneler, dig) {
        delete tunneler[DIG];
        const faction = KDGetFaction(tunneler),
            hostile = KDHostile(tunneler);
        // The Tunneler leaves without a kill and the nest takes exactly the tile its warning marked.
        if (!KDRemoveEntity(tunneler, false, false, false)) return undefined;
        const nest = KinkyDungeonSummonEnemy(
            dig.x,
            dig.y,
            "NestEntrance",
            1,
            0,
            true,
            undefined,
            false,
            false,
            faction,
            hostile,
        )?.[0];
        // Same message and visibility gate as the native summon this dig replaces.
        if (nest)
            KinkyDungeonSendTextMessage(
                6,
                TextGet("KinkyDungeonSummonSingleNestEntrance"),
                KDBaseWhite,
                2,
                undefined,
                true,
                nest,
                "Combat",
            );
        return nest;
    }

    KinkyDungeonSpellSpecials[DIG] = (_spell, _data, _targetX, _targetY, _tX, _tY, caster) => {
        if (!caster?.Enemy) return "Fail";
        caster[DIG] = { x: caster.x, y: caster.y };
        return "Cast";
    };

    // A stun or freeze that ends within the same enemy update is already gone by tickAfter.
    KDAddEvent(KDEventMapGeneric, "enemyStatusEnd", DIG, (_event, data) => {
        if ((data?.status === "stun" || data?.status === "freeze") && digging(data.enemy)) cancel(data.enemy);
    });

    // Runs after native enemies spend this turn's channel; open digs enter KD's per-turn danger record.
    KDAddEvent(KDEventMapGeneric, "tickAfter", DIG, () => {
        const cells = [];
        for (const tunneler of [...KDMapData.Entities]) {
            const dig = digging(tunneler);
            if (!dig) continue;
            if (interrupted(tunneler, dig)) cancel(tunneler);
            else if (tunneler.channel > 0) cells.push({ x: dig.x, y: dig.y });
            else open(tunneler, dig);
        }
        if (cells.length) api.SpellVisuals?.nativeDanger(cells);
    });

    api.TunnelerDig = Object.freeze({
        pending: () =>
            KDMapData.Entities.filter(digging).map((tunneler) => ({
                id: tunneler.id,
                x: tunneler[DIG].x,
                y: tunneler[DIG].y,
                remaining: tunneler.channel,
                color: tunneler.Enemy.color,
            })),
    });
})();
