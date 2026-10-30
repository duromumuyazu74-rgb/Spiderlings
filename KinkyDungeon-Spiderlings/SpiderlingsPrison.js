"use strict";

(() => {
    const api = (globalThis.Spiderlings = globalThis.Spiderlings || {});
    const ROOM = "SpiderlingsNestPrison";
    const ENTRANCE = "SpiderlingsPrisonEntrance";
    const STATE = "SpiderlingsPrison";
    const IDENTITY = "SpiderlingsPrisonIdentity";
    const WIDTH = api.PrisonLayout.width;
    const HEIGHT = api.PrisonLayout.height;

    const text = {
        KDRoomType_SpiderlingsNestPrison: "Spiderlings nest prison",
        SpiderlingsPrisonArrival: "Silk covers the cocoon chamber. Three passages lead east through the nest.",
        SpiderlingsPrisonTrail: "A cool draft follows the pale silk toward the outer wall.",
        SpiderlingsPrisonExit: "Daylight seeps through a break in the outer web. The way back is here.",
        DSpiderlingsNestVisit: "The opening leads into the spiders' nest. Pale silk marks a route back.",
        dSpiderlingsNestVisit_Enter: "Enter the nest",
        dSpiderlingsNestVisit_EnterGag: "Enter the nest",
        KinkyDungeonStatSpiderlingsPrisonStart: "Nest prison start",
        KinkyDungeonStatDescSpiderlingsPrisonStart: "Start in the cocoon chamber of the Spiderlings nest prison.",
    };
    for (const [key, value] of Object.entries(text)) if (typeof addTextKey === "function") addTextKey(key, value);

    function roomState(map = KDMapData) {
        return map?.RoomType === KDGameData?.RoomType && map?.[STATE]?.version === 1 ? map[STATE] : null;
    }

    function isPrison() {
        return KDGameData?.RoomType === KDMapData?.RoomType && !!roomState();
    }

    function generate(_poi, visited) {
        const layout = api.PrisonLayout.create();
        const { rows, props, width, height, ...plan } = layout;
        visited[0].x = layout.chamber.x;
        visited[0].y = layout.chamber.y;
        KDMapData.GridWidth = width;
        KDMapData.GridHeight = height;
        KDMapData.Grid = rows.map((row) => [...row].map((tile) => (tile === "1" ? "0" : "1")).join("") + "\n").join("");
        KDMapData.StartPosition = { ...layout.exit };
        KDMapData.EndPosition = { ...layout.exit };
        KDMapData.PatrolPoints = layout.patrolRoutes
            .flat()
            .filter(
                (point, index, points) =>
                    points.findIndex((other) => other.x === point.x && other.y === point.y) === index,
            );
        KDMapData.Labels.Patrol = KDMapData.PatrolPoints.map((point) => ({
            name: "Patrol",
            type: "Patrol",
            assigned: -1,
            ...point,
        }));
        for (const point of layout.routes.upper) KDMapData.TilesSkin[`${point.x},${point.y}`] = { skin: "cav" };
        for (const prop of props) {
            const key = `${prop.x},${prop.y}`;
            KinkyDungeonMapSet(prop.x, prop.y, prop.type === "barrel" ? "L" : prop.type === "chest" ? "C" : "c");
            if (prop.type === "barrel") KinkyDungeonTilesSet(key, { Type: "Barrel" });
            else if (prop.type === "chest")
                KinkyDungeonTilesSet(key, { Type: "Chest", Loot: "storage", Roll: KDRandom(), NoTrap: true });
        }
        const source = KDPersonalAlt[KDGameData.RoomType]?.data?.SpiderlingsPrisonSource;
        if (!source) throw new Error("Spiderlings prison has no source floor.");
        KDMapData[STATE] = { version: 1, source: { ...source }, ...plan, seenClues: {} };
        KinkyDungeonTilesSet(`${layout.exit.x},${layout.exit.y}`, {
            RoomType: source.room,
            MapMod: source.mapMod,
            Faction: source.faction,
            EscapeMethod: "None",
        });
    }

    function constructionSites(region) {
        const map = roomState();
        if (map?.layoutVersion !== 2) return [];
        return map.fieldSites
            .filter((site) => !region || site.region === region)
            .map((site) => ({
                ...site,
                center: { ...site.center },
                bounds: { ...site.bounds },
            }));
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
        return enterFrom(entrance, mode);
    }

    function start(mode = "captured") {
        if (!["captured", "voluntary"].includes(mode) || isPrison() || !hasNativeLairSupport()) return false;
        return enterFrom(KinkyDungeonPlayerEntity, mode);
    }

    function enterFrom(origin, mode) {
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
        const point = existingShortcut || portalNear(origin);
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
        const map = roomState();
        if (Math.hypot(player.x - map.chamber.x, player.y - map.chamber.y) <= 3) tellClue("SpiderlingsPrisonArrival");
        if (
            map.layoutVersion === 2
                ? map.routes.upper.some((point) => Math.hypot(player.x - point.x, player.y - point.y) <= 3)
                : player.x >= 22 && player.x <= 47 && (player.y <= 12 || player.y >= 32)
        )
            tellClue("SpiderlingsPrisonTrail");
        if (Math.hypot(player.x - map.exit.x, player.y - map.exit.y) <= 4) tellClue("SpiderlingsPrisonExit");
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
    if (typeof KinkyDungeonStatsPresets !== "undefined" && typeof KDPerkStart !== "undefined") {
        KinkyDungeonStatsPresets.SpiderlingsPrisonStart = {
            id: "SpiderlingsPrisonStart",
            category: "Start",
            cost: 0,
            startPriority: 1200,
            tags: ["start"],
            block: ["SpiderlingsBossStart"],
        };
        KDPerkStart.SpiderlingsPrisonStart = () => {
            if (!start()) throw new Error("Cannot start in the Spiderlings nest prison.");
        };
    }
    api.Prison = Object.freeze({
        ROOM,
        STATE,
        enter,
        start,
        isPrison,
        captured,
        recapture,
        onExit,
        updateClues,
        constructionSites,
    });
})();
