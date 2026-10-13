"use strict";

(() => {
    const api = (globalThis.Spiderlings = globalThis.Spiderlings || {});
    const ROOM = "SpiderlingsNestPrison";
    const ENTRANCE = "SpiderlingsPrisonEntrance";
    const STATE = "SpiderlingsPrison";
    const IDENTITY = "SpiderlingsPrisonIdentity";
    const WIDTH = 55;
    const HEIGHT = 45;
    const CHAMBER = Object.freeze({ x: 11, y: 22 });
    const EXIT = Object.freeze({ x: 51, y: 22 });
    const MAIN_NEST = Object.freeze({ x: 36, y: 22 });

    const text = {
        KDRoomType_SpiderlingsNestPrison: "Spiderlings nest prison",
        SpiderlingsPrisonArrival: "Silk covers the cocoon chamber. Three passages lead east through the nest.",
        SpiderlingsPrisonTrail: "A cool draft follows the pale silk toward the outer wall.",
        SpiderlingsPrisonExit: "Daylight seeps through a break in the outer web. The way back is here.",
        DSpiderlingsNestVisit: "The opening leads into the spiders' nest. Pale silk marks a route back.",
        dSpiderlingsNestVisit_Enter: "Enter the nest",
        dSpiderlingsNestVisit_EnterGag: "Enter the nest",
    };
    for (const [key, value] of Object.entries(text)) if (typeof addTextKey === "function") addTextKey(key, value);

    function roomState(map = KDMapData) {
        return map?.RoomType === KDGameData?.RoomType && map?.[STATE]?.version === 1 ? map[STATE] : null;
    }

    function isPrison() {
        return KDGameData?.RoomType === KDMapData?.RoomType && !!roomState();
    }

    function carveRect(left, top, right, bottom) {
        for (let y = top; y <= bottom; y += 1) {
            for (let x = left; x <= right; x += 1) KinkyDungeonMapSet(x, y, "0");
        }
    }

    function carveLine(a, b, radius = 1) {
        if (a.x !== b.x && a.y !== b.y) throw new Error("Spiderlings prison corridors must be orthogonal.");
        carveRect(
            Math.min(a.x, b.x) - radius,
            Math.min(a.y, b.y) - radius,
            Math.max(a.x, b.x) + radius,
            Math.max(a.y, b.y) + radius,
        );
    }

    function generate(_poi, visited) {
        visited[0].x = CHAMBER.x;
        visited[0].y = CHAMBER.y;
        KDMapData.GridWidth = WIDTH;
        KDMapData.GridHeight = HEIGHT;
        KDMapData.Grid = Array.from({ length: HEIGHT }, () => "1".repeat(WIDTH) + "\n").join("");

        // The open western floor leaves room for paid Spinner layers. The two
        // outer circuits bypass the central nest and reconnect before the exit.
        carveRect(2, 12, 20, 32);
        carveRect(31, 17, 41, 27);
        carveRect(49, 20, 53, 24);
        carveLine({ x: 19, y: 22 }, { x: 51, y: 22 });
        carveLine({ x: 18, y: 8 }, { x: 47, y: 8 });
        carveLine({ x: 18, y: 36 }, { x: 47, y: 36 });
        carveLine({ x: 18, y: 8 }, { x: 18, y: 13 });
        carveLine({ x: 18, y: 31 }, { x: 18, y: 36 });
        carveLine({ x: 24, y: 8 }, { x: 24, y: 36 });
        carveLine({ x: 46, y: 8 }, { x: 46, y: 36 });
        carveLine({ x: 36, y: 8 }, { x: 36, y: 17 });
        carveLine({ x: 36, y: 27 }, { x: 36, y: 36 });

        // Small dead ends make the upper and lower routes recognizable without
        // creating another required route or obstructing the central nest.
        const spurX = 27 + Math.floor(KDRandom() * 4);
        carveRect(spurX - 2, 3, spurX + 2, 7);
        const lowerSpurX = 39 + Math.floor(KDRandom() * 4);
        carveRect(lowerSpurX - 2, 37, lowerSpurX + 2, 41);

        KDMapData.StartPosition = { ...EXIT };
        KDMapData.EndPosition = { ...EXIT };
        KDMapData.PatrolPoints = [
            { x: 24, y: 8 },
            { x: 46, y: 8 },
            { x: 46, y: 36 },
            { x: 24, y: 36 },
            { x: 36, y: 22 },
        ];
        for (const point of KDMapData.PatrolPoints) {
            KDMapData.Labels.Patrol ||= [];
            KDMapData.Labels.Patrol.push({ name: "Patrol", type: "Patrol", assigned: -1, ...point });
        }
        for (const [x, y] of [
            [24, 8],
            [36, 8],
            [46, 8],
            [46, 16],
            [46, 22],
            [51, 22],
        ]) {
            KDMapData.TilesSkin[`${x},${y}`] = { skin: "cav" };
        }

        const source = KDPersonalAlt[KDGameData.RoomType]?.data?.SpiderlingsPrisonSource;
        if (!source) throw new Error("Spiderlings prison has no source floor.");
        KDMapData[STATE] = {
            version: 1,
            source: { ...source },
            chamber: { ...CHAMBER },
            chamberBounds: { left: 8, top: 19, right: 14, bottom: 25 },
            workBounds: { left: 2, top: 12, right: 20, bottom: 32 },
            mainNest: { ...MAIN_NEST },
            mainNestBounds: { left: 31, top: 17, right: 41, bottom: 27 },
            exit: { ...EXIT },
            seenClues: {},
        };
        KinkyDungeonTilesSet(`${EXIT.x},${EXIT.y}`, {
            RoomType: source.room,
            MapMod: source.mapMod,
            Faction: source.faction,
            EscapeMethod: "None",
        });
    }

    function hasNativeLairSupport() {
        return (
            typeof KDAddLair === "function" &&
            typeof KDBuildLairs === "function" &&
            typeof KDMakeShortcutStairs === "function" &&
            typeof KDGoThruTile === "function" &&
            typeof KDGetWorldMapLocation === "function" &&
            typeof KDLairTypes === "object" &&
            typeof KDPersonalAlt === "object" &&
            typeof KDLairEntrancePlaceScript === "object" &&
            typeof KDLairEntranceFilterScript === "object" &&
            typeof KDMapData?.ShortcutPositions === "object" &&
            !Array.isArray(KDMapData.ShortcutPositions) &&
            typeof KDMapData?.UsedEntrances === "object"
        );
    }

    function legalPortal(x, y) {
        if (
            !Number.isInteger(x) ||
            !Number.isInteger(y) ||
            x < 2 ||
            y < 2 ||
            x >= KDMapData.GridWidth - 2 ||
            y >= KDMapData.GridHeight - 2
        )
            return false;
        if (!KinkyDungeonGroundTiles.includes(KinkyDungeonMapGet(x, y))) return false;
        if (KinkyDungeonTilesGet(`${x},${y}`)?.Type || KinkyDungeonTilesGet(`${x},${y}`)?.RoomType !== undefined)
            return false;
        if (KDMapData.Entities.some((enemy) => enemy.hp > 0 && enemy.x === x && enemy.y === y)) return false;
        if (KDMapData.SpecialAreas?.some((area) => Math.hypot(x - area.x, y - area.y) < (area.radius || 0) + 1))
            return false;
        return true;
    }

    function portalNear(entrance) {
        const candidates = [];
        for (let radius = 1; radius <= 3; radius += 1) {
            for (let dy = -radius; dy <= radius; dy += 1) {
                for (let dx = -radius; dx <= radius; dx += 1) {
                    if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
                    const point = { x: entrance.x + dx, y: entrance.y + dy };
                    if (legalPortal(point.x, point.y)) candidates.push(point);
                }
            }
            if (candidates.length) break;
        }
        candidates.sort(
            (a, b) =>
                Math.hypot(a.x - KinkyDungeonPlayerEntity.x, a.y - KinkyDungeonPlayerEntity.y) -
                Math.hypot(b.x - KinkyDungeonPlayerEntity.x, b.y - KinkyDungeonPlayerEntity.y),
        );
        return candidates[0] || null;
    }

    function enter({ entrance, mode = "captured" } = {}) {
        if (
            !["captured", "voluntary"].includes(mode) ||
            isPrison() ||
            !hasNativeLairSupport() ||
            !entrance ||
            entrance.Enemy?.name !== "NestEntrance" ||
            entrance.hp <= 0 ||
            !KDMapData.Entities.includes(entrance)
        )
            return false;
        const slot = KDGetWorldMapLocation({ x: KDMapData.mapX, y: KDMapData.mapY });
        const journey = KDGameData.JourneyMap?.[`${KDGameData.JourneyX},${KDGameData.JourneyY}`];
        if (!slot || !journey || !Array.isArray(journey.SideRooms) || !Array.isArray(KDMapData.PotentialEntrances))
            return false;
        const room = KDGameData.RoomType || "";
        const existing = Object.keys(slot.lairs || {}).find(
            (id) =>
                id.endsWith(`_${ROOM},${slot.x},${slot.y}`) &&
                KDPersonalAlt[id]?.data?.SpiderlingsPrisonSource?.room === room,
        );
        const existingShortcut = existing && KDMapData.ShortcutPositions[existing];
        const point = existingShortcut || portalNear(entrance);
        if (!point) return false;
        if (!existingShortcut)
            KDMapData.PotentialEntrances.push({
                Type: ENTRANCE,
                PlaceScript: ENTRANCE,
                Excavate: [],
                priority: 100,
                ...point,
            });
        const source = {
            room,
            mapMod: KDMapData.MapMod || "",
            faction: KDMapData.MapFaction || "",
            mapX: KDMapData.mapX,
            mapY: KDMapData.mapY,
        };
        // Native lair IDs include the world slot but not the source room. Keep
        // saved prisons (including the original ID 0) and allocate per room.
        // Nonpositive IDs avoid claiming a living NPC's personal lair.
        let id = 0;
        while (slot.lairs?.[`${id}_${ROOM},${slot.x},${slot.y}`] !== undefined) id -= 1;
        const lairId =
            existing || KDAddLair(slot, room, ROOM, id, false, ENTRANCE, undefined, undefined, undefined, true);
        if (!lairId || !KDPersonalAlt[lairId]) return false;
        KDPersonalAlt[lairId].data ||= {};
        KDPersonalAlt[lairId].data.SpiderlingsPrisonSource ||= source;
        if (!KDMapData.ShortcutPositions[lairId]) KDBuildLairs();
        // A new lair is built synchronously on this source map. An existing
        // source map can also have a previously saved shortcut.
        const shortcut = KDMapData.ShortcutPositions[lairId];
        if (
            !shortcut ||
            KinkyDungeonMapGet(shortcut.x, shortcut.y) !== "H" ||
            KinkyDungeonTilesGet(`${shortcut.x},${shortcut.y}`)?.RoomType !== lairId
        )
            return false;
        KDGoThruTile(shortcut.x, shortcut.y, true, true, mode === "voluntary", true);
        const arrived = KDGameData.RoomType === lairId && isPrison();
        if (arrived) {
            if (mode === "captured") return recapture();
            admit(mode);
        }
        return arrived;
    }

    function captured() {
        return isPrison() && KDGameData[IDENTITY]?.room === KDGameData.RoomType;
    }

    function admit(mode) {
        const map = roomState();
        if (!map) return false;
        KDMapData.PrisonType = ROOM;
        KDMapData.PrisonStateStack = [];
        KDMapData.PrisonState = mode === "captured" ? "Intro" : "Visit";
        if (mode === "captured") {
            KDGameData[IDENTITY] ||= { room: KDGameData.RoomType, previous: KDGameData.PrisonerState || "" };
            KDGameData.PrisonerState = "jail";
            api.PrisonConstruction?.onPlaced();
        }
        return true;
    }

    function onExit() {
        const identity = KDGameData[IDENTITY];
        if (identity?.room === KDGameData.RoomType) {
            if (["jail", "parole", "chase"].includes(KDGameData.PrisonerState))
                KDGameData.PrisonerState = identity.previous;
            delete KDGameData[IDENTITY];
        }
        const stay = roomState()?.chamberConstruction?.stay;
        if (stay) stay.phase = "left";
        api.PrisonEscort?.clear();
    }

    function recapture() {
        const state = roomState();
        if (!state || !isPrison()) return false;
        let point = null;
        for (let radius = 0; radius <= 3 && !point; radius += 1) {
            for (let y = state.chamber.y - radius; y <= state.chamber.y + radius && !point; y += 1) {
                for (let x = state.chamber.x - radius; x <= state.chamber.x + radius; x += 1) {
                    if (
                        Math.max(Math.abs(x - state.chamber.x), Math.abs(y - state.chamber.y)) !== radius ||
                        KinkyDungeonMapGet(x, y) !== "0" ||
                        KDMapData.Entities.some((enemy) => enemy.hp > 0 && enemy.x === x && enemy.y === y)
                    )
                        continue;
                    point = { x, y };
                    break;
                }
            }
        }
        if (!point) return false;
        KinkyDungeonPlayerEntity.lastx = KinkyDungeonPlayerEntity.x;
        KinkyDungeonPlayerEntity.lasty = KinkyDungeonPlayerEntity.y;
        KinkyDungeonPlayerEntity.x = point.x;
        KinkyDungeonPlayerEntity.y = point.y;
        KinkyDungeonPlayerEntity.visual_x = point.x;
        KinkyDungeonPlayerEntity.visual_y = point.y;
        KDUpdateEnemyCache = true;
        admit("captured");
        updateClues();
        return true;
    }

    function tellClue(key) {
        const state = roomState();
        if (!state || state.seenClues[key]) return;
        state.seenClues[key] = true;
        if (typeof KinkyDungeonSendTextMessage === "function")
            KinkyDungeonSendTextMessage(9, TextGet(key), "#ddd0f5", 5);
    }

    function updateClues() {
        if (!isPrison()) return;
        const player = KinkyDungeonPlayerEntity;
        if (Math.hypot(player.x - CHAMBER.x, player.y - CHAMBER.y) <= 3) tellClue("SpiderlingsPrisonArrival");
        if (player.x >= 22 && player.x <= 47 && (player.y <= 12 || player.y >= 32)) tellClue("SpiderlingsPrisonTrail");
        if (Math.hypot(player.x - EXIT.x, player.y - EXIT.y) <= 4) tellClue("SpiderlingsPrisonExit");
    }

    if (typeof alts === "object" && typeof KinkyDungeonCreateMapGenType === "object") {
        alts[ROOM] = {
            name: ROOM,
            Title: ROOM,
            genType: ROOM,
            width: WIDTH,
            height: HEIGHT,
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
            isPrison: true,
            prisonType: ROOM,
            onExit,
            faction: "Enemy",
            brightness: 6,
        };
        KinkyDungeonCreateMapGenType[ROOM] = generate;
    }
    if (typeof KDPrisonTypes === "object") {
        // KD initializes every state's init during generation. Visit has no
        // captivity effects; explicit admission selects Intro after map loading.
        KDPrisonTypes[ROOM] = {
            name: ROOM,
            starting_state: "Visit",
            default_state: "Visit",
            states: {
                Visit: { name: "Visit", update: () => "Visit" },
                Intro: { name: "Intro", update: () => "Jail" },
                Jail: { name: "Jail", update: () => (captured() ? "Jail" : "Visit") },
            },
        };
    }
    if (typeof KDDialogue === "object") {
        KDDialogue.SpiderlingsNestVisit = {
            response: "Default",
            options: {
                Enter: {
                    playertext: "Default",
                    gag: true,
                    exitDialogue: true,
                    clickFunction: () => {
                        const entrance = KDGetSpeaker();
                        if (
                            entrance &&
                            Math.hypot(
                                entrance.x - KinkyDungeonPlayerEntity.x,
                                entrance.y - KinkyDungeonPlayerEntity.y,
                            ) <= 1.5
                        )
                            enter({ entrance, mode: "voluntary" });
                        return false;
                    },
                },
                Leave: { playertext: "Leave", exitDialogue: true },
            },
        };
    }
    if (typeof KDGetContextActions === "object" && typeof KDGetContextActions.Game === "function") {
        KDGetContextActions.Game = api.Hooks.wrap(
            "PrisonContextMenu",
            KDGetContextActions.Game,
            (native) =>
                function () {
                    const menu = native.apply(this, arguments);
                    const entrance = KinkyDungeonEntityAt(KinkyDungeonTargetX, KinkyDungeonTargetY);
                    if (
                        entrance?.Enemy?.name !== "NestEntrance" ||
                        entrance.hp <= 0 ||
                        Math.hypot(entrance.x - KinkyDungeonPlayerEntity.x, entrance.y - KinkyDungeonPlayerEntity.y) >
                            1.5 ||
                        !(KinkyDungeonVisionGet(entrance.x, entrance.y) > 0)
                    )
                        return menu;
                    menu.options.push("SpiderlingsNestVisit");
                    menu.optionImages.SpiderlingsNestVisit = "Talk";
                    menu.optionText.SpiderlingsNestVisit = TextGet("dSpiderlingsNestVisit_Enter");
                    menu.optionActions.SpiderlingsNestVisit = () => {
                        KDContextMenu = false;
                        KDStartDialog(
                            "SpiderlingsNestVisit",
                            entrance.Enemy.name,
                            true,
                            entrance.personality,
                            entrance,
                        );
                    };
                    return menu;
                },
        );
    }
    if (
        typeof KDLairTypes === "object" &&
        typeof KDLairEntrancePlaceScript === "object" &&
        typeof KDLairEntranceFilterScript === "object"
    ) {
        KDLairTypes[ROOM] = {
            Entrances: {},
            DefaultEntrance: ENTRANCE,
            EntrancesFrom: {},
            DefaultEntranceFrom: ENTRANCE,
        };
        KDLairEntranceFilterScript[ENTRANCE] = (_lair, _data, candidate) =>
            legalPortal(candidate.x, candidate.y) ? 1 : -1000000;
        KDLairEntrancePlaceScript[ENTRANCE] = (lair, data, candidate, roomTo) => {
            if (!legalPortal(candidate.x, candidate.y)) return false;
            KDMakeShortcutStairs(lair, { x: candidate.x, y: candidate.y }, data, roomTo);
            return KinkyDungeonMapGet(candidate.x, candidate.y) === "H";
        };
    }
    if (typeof KDEventMapGeneric !== "undefined" && typeof KDAddEvent === "function") {
        KDAddEvent(KDEventMapGeneric, "AfterAdvance", ROOM, updateClues);
        KDAddEvent(KDEventMapGeneric, "tickAfter", ROOM, updateClues);
    }
    api.Prison = Object.freeze({ ROOM, STATE, enter, isPrison, captured, recapture, onExit, updateClues });
})();
