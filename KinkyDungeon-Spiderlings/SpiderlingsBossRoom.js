"use strict";

// A native persistent side room of the V6 prison, with the prison as its return map.
(() => {
    const api = globalThis.Spiderlings;
    const ROOM = "SpiderlingsSilkboundCourt";
    const ENTRANCE = "SpiderlingsCourtEntrance";
    const KEY = "SpiderlingsBossRoom";
    const DOOR = "SpiderlingsCourtDoor";
    const ENTRY = Object.freeze({ x: 64, y: 31 });
    const CENTER = Object.freeze({ x: 20, y: 20 });
    const EXIT = Object.freeze({ x: 20, y: 37 });
    const state = () => KDMapData?.[KEY];
    const active = () => !!state() && KDMapData.RoomType === KDGameData.RoomType;
    let returning = false;

    function ensureEntrance() {
        if (!api.Prison?.isPrison() || KDMapData.SpiderlingsPrison?.layoutVersion !== 2 || KDMapData[DOOR]) return;
        if (
            typeof KDAddLair !== "function" ||
            typeof KDBuildLairs !== "function" ||
            !KDMapData.ShortcutPositions ||
            !KDMapData.UsedEntrances
        )
            return;
        if (
            !KinkyDungeonGroundTiles.includes(KinkyDungeonMapGet(ENTRY.x, ENTRY.y)) ||
            KinkyDungeonEntityAt(ENTRY.x, ENTRY.y) ||
            KinkyDungeonTilesGet(`${ENTRY.x},${ENTRY.y}`)?.Type
        )
            return;
        const slot = KDGetWorldMapLocation({ x: KDMapData.mapX, y: KDMapData.mapY });
        if (!slot) return;
        const room = KDGameData.RoomType;
        let id = 0;
        while (slot.lairs?.[`${id}_${ROOM},${slot.x},${slot.y}`] !== undefined) id--;
        const lairId = KDAddLair(slot, room, ROOM, id, false, ENTRANCE, undefined, undefined, undefined, true);
        if (!lairId || !KDPersonalAlt[lairId]) return;
        KDPersonalAlt[lairId].data ||= {};
        KDPersonalAlt[lairId].data.SpiderlingsCourtSource = {
            room,
            mapMod: KDMapData.MapMod || "",
            faction: KDMapData.MapFaction || "",
            ...ENTRY,
        };
        KDMapData.PotentialEntrances.push({
            Type: ENTRANCE,
            PlaceScript: ENTRANCE,
            Excavate: [],
            priority: 100,
            ...ENTRY,
        });
        KDBuildLairs();
        if (KDMapData.ShortcutPositions[lairId] && KinkyDungeonTilesGet(`${ENTRY.x},${ENTRY.y}`)?.RoomType === lairId) {
            KDMapData[DOOR] = { room: lairId, ...ENTRY };
            KinkyDungeonSendTextMessage(7, TextGet("SpiderlingsCourtEntranceFound"), "#cdb4ff", 4);
        }
    }
    function generate(_poi, visited) {
        const source = KDPersonalAlt[KDGameData.RoomType]?.data?.SpiderlingsCourtSource;
        if (!source) throw new Error("Silkbound Court requires its source prison.");
        KDMapData.GridWidth = 41;
        KDMapData.GridHeight = 41;
        KDMapData.Grid = Array.from(
            { length: 41 },
            (_, y) => Array.from({ length: 41 }, (_, x) => (x && y && x < 40 && y < 40 ? "0" : "1")).join("") + "\n",
        ).join("");
        visited[0].x = CENTER.x;
        visited[0].y = CENTER.y;
        KDMapData.StartPosition = { ...CENTER };
        KDMapData.EndPosition = { ...EXIT };
        KDMapData[KEY] = { version: 1, source: { ...source }, attempts: 1, complete: false };
        KinkyDungeonTilesSet(`${EXIT.x},${EXIT.y}`, {
            RoomType: source.room,
            MapMod: source.mapMod,
            Faction: source.faction,
            EscapeMethod: "None",
        });
    }
    function returnToPrison(captured = false) {
        if (!active() || (!captured && !state().complete)) return false;
        const source = state().source;
        returning = true;
        try {
            KDGoThruTile(EXIT.x, EXIT.y, true, true, true, true);
        } finally {
            returning = false;
        }
        if (KDGameData.RoomType !== source.room || !api.Prison.isPrison()) return false;
        if (captured) api.Prison.recapture();
        return true;
    }
    function complete() {
        if (active()) state().complete = true;
    }
    function startNextAttempt() {
        if (!active() || state().complete) return false;
        state().attempts++;
        for (let radius = 0; radius <= 2; radius++)
            for (let dy = -radius; dy <= radius; dy++)
                for (let dx = -radius; dx <= radius; dx++) {
                    const point = { x: CENTER.x + dx, y: CENTER.y + dy };
                    if (
                        KinkyDungeonEntityAt(point.x, point.y) &&
                        KinkyDungeonEntityAt(point.x, point.y) !== KinkyDungeonPlayerEntity
                    )
                        continue;
                    KDMovePlayer(point.x, point.y, false);
                    return true;
                }
        return false;
    }
    if (typeof KinkyDungeonDefeat === "function")
        KinkyDungeonDefeat = api.Hooks.wrap(
            "BossRoom.defeat",
            KinkyDungeonDefeat,
            (native) =>
                function () {
                    if (!active()) return native.apply(this, arguments);
                    // Native defeat emits its event midway through only one jail branch.
                    // Own the Court transition before native jail placement can overwrite it.
                    KDCustomDefeat = "";
                    KDCustomDefeatEnemy = null;
                    KinkyDungeonInterruptSleep();
                    KDResetDialogue();
                    KDBreakTether(KinkyDungeonPlayerEntity);
                    KDGameData.KinkyDungeonLeashedPlayer = 0;
                    KinkyDungeonSendEvent("defeat", {});
                    returnToPrison(true);
                },
        );
    if (
        typeof alts === "object" &&
        typeof KinkyDungeonCreateMapGenType === "object" &&
        typeof KDLairTypes === "object" &&
        typeof KDLairEntranceFilterScript === "object" &&
        typeof KDLairEntrancePlaceScript === "object" &&
        typeof KinkyDungeonEscapeTypes === "object" &&
        typeof KDCancelEvents === "object"
    ) {
        alts[ROOM] = {
            name: ROOM,
            Title: ROOM,
            genType: ROOM,
            width: 41,
            height: 41,
            noWear: true,
            noSetpiece: true,
            noFurniture: true,
            noFood: true,
            spawns: false,
            enemies: false,
            chests: false,
            shrines: false,
            nojail: true,
            nokeys: true,
            notraps: true,
            nostartstairs: true,
            startatstartpos: true,
            noAdvance: true,
            persist: true,
            faction: "Enemy",
            brightness: 8,
            onExit: () => api.BossEncounter?.leave(),
        };
        KinkyDungeonCreateMapGenType[ROOM] = generate;
        KDLairTypes[ROOM] = {
            Entrances: {},
            DefaultEntrance: ENTRANCE,
            EntrancesFrom: {},
            DefaultEntranceFrom: ENTRANCE,
        };
        KDLairEntranceFilterScript[ENTRANCE] = (_lair, _data, candidate) =>
            candidate.x === ENTRY.x && candidate.y === ENTRY.y ? 1 : -1000000;
        KDLairEntrancePlaceScript[ENTRANCE] = (lair, data, candidate, roomTo) => {
            if (candidate.x !== ENTRY.x || candidate.y !== ENTRY.y || !api.Prison.isPrison()) return false;
            KDMakeShortcutStairs(lair, { ...ENTRY }, data, roomTo);
            return KinkyDungeonMapGet(ENTRY.x, ENTRY.y) === "H";
        };
        KinkyDungeonEscapeTypes[ROOM] = {
            selectValid: false,
            filterRandom: () => 0,
            check: () => !active() || state().complete || returning,
            minimaptext: () => TextGet(state()?.complete ? "SpiderlingsCourtVictory" : "SpiderlingsCourtLocked"),
            doortext: () => TextGet("SpiderlingsCourtLocked"),
        };
        KDAddEvent(KDEventMapGeneric, "calcEscapeMethod", ROOM, (_event, data) => {
            if (active()) data.escapeMethod = ROOM;
        });
        KDAddEvent(KDEventMapGeneric, "beforeStairCancel", ROOM, (_event, data) => {
            if (active() && !state().complete && !returning) data.cancelevent = ROOM;
        });
        KDCancelEvents[ROOM] = () => KinkyDungeonSendActionMessage(8, TextGet("SpiderlingsCourtLocked"), "#cdb4ff", 3);
    }
    for (const event of ["postMapgen", "afterLoadGame", "tickAfter"])
        KDAddEvent(KDEventMapGeneric, event, ROOM, ensureEntrance);
    if (typeof KinkyDungeonStatsPresets !== "undefined" && typeof KDPerkStart !== "undefined") {
        delete KDPerkStart.SpiderlingsBossStart;
        KinkyDungeonStatsPresets.SpiderlingsBossStart = {
            id: "SpiderlingsBossStart",
            category: "Start",
            cost: 0,
            tags: ["start"],
            block: ["SpiderlingsPrisonStart"],
        };
        KDAddEvent(KDEventMapGeneric, "afterNewGame", "SpiderlingsBossStart", () => {
            if (!KinkyDungeonStatsChoice.get("SpiderlingsBossStart")) return;
            if (!api.Prison.start("voluntary")) throw new Error("Cannot create the Matriarch's source prison.");
            ensureEntrance();
            const door = KDMapData[DOOR];
            if (!door) throw new Error("Cannot open the Matriarch's court.");
            KDGoThruTile(door.x, door.y, true, true, true, true);
            if (!active()) throw new Error("Cannot start in the Matriarch's court.");
        });
    }
    api.BossRoom = Object.freeze({
        ROOM,
        KEY,
        ENTRY,
        CENTER,
        EXIT,
        active,
        state,
        ensureEntrance,
        complete,
        startNextAttempt,
        returnToPrison,
    });
})();
