"use strict";

// The optional training room owns its map and props. Normal maps are never flattened.
(() => {
    const api = globalThis.Spiderlings,
        ROOM = "SpiderlingsSpinnerTraining",
        KEY = "SpiderlingsSpinnerField";
    const WALL = "SpiderlingsSilkAnchor",
        TRAP = "SpiderlingsSpinnerGroundTrap",
        CONFIG = Object.freeze({
            width: 31,
            height: 21,
            radius: 3,
            rebuildTurns: 20,
            reinforceAmount: 0.1,
            maxSilkHP: 2,
        });
    const field = () => (typeof KDMapData !== "undefined" ? KDMapData[KEY] : undefined);
    const active = () => KDMapData?.RoomType === ROOM;
    let drawing;
    const messages = {
        NameSpiderlingsSilkAnchor: "Web knot",
        KillSpiderlingsSilkAnchor: "The web boundary tears open.",
        SpiderlingsFieldPreparing:
            "Spinners place ground traps, then connect pairs across your retreat. Leave before the web closes, or cut a connection.",
        SpiderlingsFieldReady: "A pair of traps is connected. The Spinners prepare another escape route.",
        SpiderlingsFieldSprung: "The trap connections enclose the area. Players still inside can be captured.",
        SpiderlingsFieldTrap: "Ground silk catches your feet, briefly slowing your movement.",
        SpiderlingsFieldBroken: "A knot breaks. The trap collapses and the threads release you.",
        SpiderlingsFieldReset: "Reset trial",
        SpiderlingsFieldJumper: "Release Jumper",
        SpiderlingsFieldAddSpinner: "Add Spinner",
        SpiderlingsFieldStatus: "Web field: {phase} · traps {count}/4 · connections {links}/4",
        SpiderlingsFieldRebuild: "Spinners resume building in {turns} world turns.",
        SpiderlingsFieldWaiting: "Traps prepared. The western entrance stays open until you enter.",
    };
    for (const [key, text] of Object.entries(messages)) if (typeof addTextKey === "function") addTextKey(key, text);
    function say(key) {
        KinkyDungeonSendTextMessage(9, TextGet(key), "#FFFFFF", 4);
    }
    if (typeof alts !== "undefined") alts[ROOM] = { ...alts.JourneyFloor, spawns: false, enemies: false };
    if (typeof KinkyDungeonEnemies !== "undefined") {
        const ice = KinkyDungeonEnemies.find((e) => e.name === "IceWall");
        KinkyDungeonEnemies.push({
            ...ice,
            name: WALL,
            faction: "Enemy",
            regen: 0,
            maxhp: 2,
            armor: 0,
            evasion: -100,
            immobile: true,
            AI: "wander",
            attack: "",
            attackRange: 0,
            visionRadius: 0,
            movePoints: 1000,
            attackPoints: 0,
            weight: 0,
            dropTable: [],
            events: [],
            tags: KDMapInit(["construct", "immobile", "notalk", "nobrain", "nosignal", "noknockback", "temporary"]),
        });
    }
    if (typeof KDModFiles !== "undefined") {
        for (const prefix of ["", typeof KinkyDungeonRootDirectory === "string" ? KinkyDungeonRootDirectory : ""])
            KDModFiles[prefix + "Enemies/" + WALL + ".png"] =
                KDModFiles[prefix + "Bullets/WebSprayTrail.png"] || KDModFiles["Bullets/WebSprayTrail.png"];
    }
    function clearDrawing() {
        if (drawing && !drawing.destroyed) {
            drawing.parent?.removeChild(drawing);
            drawing.destroy();
        }
        drawing = undefined;
    }
    function clearWalls() {
        const f = field();
        if (!f) return;
        const ids = new Set(f.nodes.map((n) => n.id).filter((id) => id !== undefined));
        KDMapData.Entities = KDMapData.Entities.filter((e) => !ids.has(e.id));
        KDUpdateEnemyCache = true;
        for (const t of f.traps || []) {
            const key = t.x + "," + t.y;
            if (KinkyDungeonTilesGet(key)?.SpinnerTrap === KEY) KinkyDungeonTilesDelete(key);
        }
    }
    function end(phase) {
        const f = field();
        if (!f) return;
        if (["broken", "complete"].includes(f.phase)) return;
        f.phase = phase;
        clearWalls();
        clearDrawing();
        for (const trap of f.traps) trap.placed = false;
        for (const link of f.links || []) link.built = false;
        f.rebuildRemaining = CONFIG.rebuildTurns;
        f.rebuildFresh = true;
        for (const e of KDMapData.Entities) if (f.ids.includes(e.id)) e.SpinnerBuildPoints = 0;
        if (phase === "broken") {
            api.SpinnerCapture.cancel();
            say("SpiderlingsFieldBroken");
        }
        if (phase === "complete") f.jumperEnabled = true;
    }
    function onCaptureEnd(reason) {
        if (field() && !["broken", "complete"].includes(field().phase))
            end(reason === "complete" ? "complete" : "broken");
    }
    function enter() {
        if (api.SpinnerCapture.state()) api.SpinnerCapture.cancel();
        clearDrawing();
        const bag = api.SpinnerCapture.item();
        if (bag) KinkyDungeonRemoveRestraintSpecific(bag, true);
        KDGameData.DelayedActions = [];
        KDGameData.RoomType = ROOM;
        KDGameData.MapMod = "";
        KDGameData.MovePoints = 0;
        KDGameData.SleepTurns = 0;
        KDGameData.SlowMoveTurns = 0;
        KDGameData.CurrentDialog = "";
        KDMapData = KDDefaultMapData(0, 0, ROOM, "");
        KDMapData.GridWidth = CONFIG.width;
        KDMapData.GridHeight = CONFIG.height;
        KDMapData.Grid = Array.from(
            { length: CONFIG.height },
            (_, y) =>
                Array.from({ length: CONFIG.width }, (_, x) =>
                    x === 0 || y === 0 || x === CONFIG.width - 1 || y === CONFIG.height - 1 ? "1" : "0",
                ).join("") + "\n",
        ).join("");
        KDMapData.FogGrid = Array(CONFIG.width * CONFIG.height).fill(3);
        KDMapData.MapBrightness = 10;
        KDMapData.StartPosition = { x: 3, y: 10 };
        KDMapData.EndPosition = { x: 28, y: 10 };
        KinkyDungeonPlayerEntity.x = 3;
        KinkyDungeonPlayerEntity.y = 10;
        KDMapData.PatrolPoints = [
            { x: 10, y: 8 },
            { x: 14, y: 12 },
        ];
        KDPathCache = new Map();
        KDPathCacheIgnoreLocks = new Map();
        KDUpdateEnemyCache = true;
        KinkyDungeonUpdateLightGrid = true;
        const traps = [
            { x: 9, y: 7 },
            { x: 15, y: 7 },
            { x: 15, y: 13 },
            { x: 9, y: 13 },
        ];
        const links = traps.map((_t, i) => ({ a: i, b: (i + 1) % traps.length, built: false, entrance: i === 3 }));
        const f = (KDMapData[KEY] = {
            phase: "preparing",
            x: 12,
            y: 10,
            nodes: [],
            ids: [],
            traps,
            links,
            lastPlayer: { x: 12, y: 10 },
            retreat: { x: 0, y: 0 },
            jumperEnabled: false,
        });
        for (const [name, x, y] of [
            ["Spinner", 10, 8],
            ["Spinner", 14, 12],
            ["Jumper", 17, 10],
        ]) {
            const e = DialogueCreateEnemy(x, y, name);
            e.aware = false;
            e.vp = 0;
            e.hostile = 999;
            if (name === "Spinner") f.ids.push(e.id);
            else f.jumper = e.id;
        }
        KinkyDungeonInventoryAddWeapon("Scissors");
        KinkyDungeonPlayerWeapon = "Scissors";
        KinkyDungeonGetPlayerWeaponDamage();
        KinkyDungeonChangeConsumable(
            KinkyDungeonConsumables.PotionStamina,
            2 - (KinkyDungeonInventoryGetConsumable("PotionStamina")?.quantity || 0),
        );
        if (!KinkyDungeonInventoryGetLoose(api.SpinnerCapture.ID))
            KinkyDungeonInventoryAdd({
                name: api.SpinnerCapture.ID,
                id: KinkyDungeonGetItemID(),
                type: LooseRestraint,
                quantity: 1,
                events: KDRest(api.SpinnerCapture.ID).events,
            });
        KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
        KinkyDungeonStatWill = KinkyDungeonStatWillMax;
        KinkyDungeonDrawState = "Game";
        KinkyDungeonShowInventory = false;
        KinkyDungeonDressPlayer();
        say("SpiderlingsFieldPreparing");
    }
    function place(node) {
        if (
            KinkyDungeonEnemyAt(node.x, node.y) ||
            (KinkyDungeonPlayerEntity.x === node.x && KinkyDungeonPlayerEntity.y === node.y)
        )
            return false;
        const e = DialogueCreateEnemy(node.x, node.y, WALL);
        if (!e) return false;
        e.hostile = 999;
        e.hp = node.weak ? 0.5 : 2;
        node.id = e.id;
        KDUpdateEnemyCache = true;
        return true;
    }
    function usable(e) {
        return (
            e?.hp > 0 &&
            KDHostile(e) &&
            !KinkyDungeonIsDisabled(e) &&
            !KDHelpless(e) &&
            !(e.disarm > 0) &&
            !(e.channel > 0)
        );
    }
    if (typeof KDTrapTypes !== "undefined")
        KDTrapTypes[TRAP] = (tile, entity) => {
            if (entity !== KinkyDungeonPlayerEntity || tile.SpinnerSpent) return { triggered: false, msg: "" };
            tile.SpinnerSpent = true;
            KinkyDungeonApplyBuffToEntity(entity, { id: TRAP, type: "MoveSpeed", power: -1, duration: 2 });
            return { triggered: true, msg: TextGet("SpiderlingsFieldTrap") };
        };
    function linkCells(f, link) {
        const a = f.traps[link.a],
            b = f.traps[link.b],
            cells = [];
        const length = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
        for (let i = 0; i <= length; i++)
            cells.push({
                x: a.x + Math.sign(b.x - a.x) * i,
                y: a.y + Math.sign(b.y - a.y) * i,
                weak: i === Math.floor(length / 2),
            });
        return cells;
    }
    function connect(f, link, enemy) {
        const cells = linkCells(f, link),
            pending = cells.filter((c) => !f.nodes.some((n) => n.x === c.x && n.y === c.y));
        if (
            pending.some(
                (c) =>
                    KinkyDungeonEnemyAt(c.x, c.y) ||
                    (KinkyDungeonPlayerEntity.x === c.x && KinkyDungeonPlayerEntity.y === c.y),
            )
        )
            return false;
        for (const n of pending) {
            if (!place(n)) return false;
            f.nodes.push(n);
        }
        link.built = true;
        link.owner = enemy.id;
        link.turn = KinkyDungeonCurrentTick;
        return true;
    }
    function build(enemy, delta) {
        const f = field();
        if (!f || !["preparing", "ready", "sprung"].includes(f.phase) || !f.ids.includes(enemy.id) || !usable(enemy))
            return false;
        // A sealed field gives nearby Spinners back to the capture approach AI.
        if (f.phase === "sprung" && contains(KinkyDungeonPlayerEntity)) return false;
        if (!(delta > 0)) return true;
        enemy.SpinnerBuildPoints = (enemy.SpinnerBuildPoints || 0) + delta;
        if (enemy.SpinnerBuildPoints >= enemy.Enemy.movePoints) {
            enemy.SpinnerBuildPoints -= enemy.Enemy.movePoints;
            const p = KinkyDungeonPlayerEntity;
            const visible = KinkyDungeonCheckLOS(
                enemy,
                p,
                Math.hypot(p.x - enemy.x, p.y - enemy.y),
                enemy.Enemy.visionRadius,
                false,
                true,
            );
            if (visible) {
                if (p.x !== f.lastPlayer.x || p.y !== f.lastPlayer.y)
                    f.retreat = { x: p.x - f.lastPlayer.x, y: p.y - f.lastPlayer.y };
                f.lastPlayer = { x: p.x, y: p.y };
                enemy.aware = true;
                enemy.vp = 1;
            }
            const focus = visible ? p : { x: f.x, y: f.y },
                direction = visible ? f.retreat : { x: 0, y: 0 };
            const priority = (l) => {
                const a = f.traps[l.a],
                    b = f.traps[l.b],
                    x = (a.x + b.x) / 2,
                    y = (a.y + b.y) / 2;
                return Math.hypot(x - focus.x, y - focus.y) - 2 * ((x - f.x) * direction.x + (y - f.y) * direction.y);
            };
            const pending = f.links
                .filter((l) => !l.built && (!l.entrance || contains(p)))
                .sort((a, b) => priority(a) - priority(b));
            const link = pending[0];
            if (!link) {
                reinforce(f, enemy);
                return true;
            }
            const ends = [f.traps[link.a], f.traps[link.b]];
            ends.sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y));
            const missing = ends.find((t) => !t.placed),
                destination = missing || ends[0];
            if (
                missing &&
                Math.hypot(missing.x - enemy.x, missing.y - enemy.y) <= 5 &&
                KinkyDungeonCheckPath(enemy.x, enemy.y, missing.x, missing.y, false, true, 1, false)
            ) {
                const key = missing.x + "," + missing.y;
                if (!KinkyDungeonTilesGet(key)) {
                    KinkyDungeonTilesSet(key, { Type: "Trap", Trap: TRAP, SpinnerTrap: KEY });
                    missing.placed = true;
                    missing.owner = enemy.id;
                    missing.turn = KinkyDungeonCurrentTick;
                }
            } else if (!missing && ends.some((t) => Math.hypot(t.x - enemy.x, t.y - enemy.y) <= 5))
                connect(f, link, enemy);
            if (destination) {
                const x = Math.max(10, Math.min(14, destination.x)),
                    y = Math.max(8, Math.min(12, destination.y));
                const dir = { x: Math.sign(x - enemy.x), y: Math.sign(y - enemy.y), delta: 1 };
                if (
                    (dir.x || dir.y) &&
                    !KinkyDungeonEnemyAt(enemy.x + dir.x, enemy.y + dir.y) &&
                    KinkyDungeonEnemyCanMove(enemy, dir, KinkyDungeonMovableTilesSmartEnemy, "", false, 0)
                )
                    KinkyDungeonEnemyTryMove(
                        enemy,
                        dir,
                        enemy.Enemy.movePoints,
                        enemy.x + dir.x,
                        enemy.y + dir.y,
                        false,
                    );
            }
        }
        return true;
    }
    function reinforce(f, enemy) {
        const candidates = f.nodes
            .map((n) => ({ node: n, entity: KDMapData.Entities.find((e) => e.id === n.id) }))
            .filter((v) => v.entity?.hp > 0 && v.entity.hp < CONFIG.maxSilkHP)
            .sort(
                (a, b) =>
                    a.entity.hp - b.entity.hp ||
                    Math.hypot(a.node.x - enemy.x, a.node.y - enemy.y) -
                        Math.hypot(b.node.x - enemy.x, b.node.y - enemy.y),
            );
        const chosen = candidates.find(
            (v) =>
                Math.hypot(v.node.x - enemy.x, v.node.y - enemy.y) <= 5 &&
                KinkyDungeonCheckPath(enemy.x, enemy.y, v.node.x, v.node.y, false, true, 1, false),
        );
        if (chosen) {
            const before = chosen.entity.hp;
            chosen.entity.hp = Math.min(CONFIG.maxSilkHP, Math.round((before + CONFIG.reinforceAmount) * 1000) / 1000);
            f.lastReinforcement = {
                source: enemy.id,
                node: chosen.entity.id,
                before,
                after: chosen.entity.hp,
                turn: KinkyDungeonCurrentTick,
            };
        } else if (candidates[0]) {
            const n = candidates[0].node,
                x = Math.max(10, Math.min(14, n.x)),
                y = Math.max(8, Math.min(12, n.y));
            const dir = { x: Math.sign(x - enemy.x), y: Math.sign(y - enemy.y), delta: 1 };
            if (
                (dir.x || dir.y) &&
                !KinkyDungeonEnemyAt(enemy.x + dir.x, enemy.y + dir.y) &&
                KinkyDungeonEnemyCanMove(enemy, dir, KinkyDungeonMovableTilesSmartEnemy, "", false, 0)
            )
                KinkyDungeonEnemyTryMove(enemy, dir, enemy.Enemy.movePoints, enemy.x + dir.x, enemy.y + dir.y, false);
        }
    }
    function fieldTurn(delta) {
        audit();
        const f = field();
        if (!f || !(delta > 0)) return;
        if (f.rebuildFresh) {
            delete f.rebuildFresh;
            return;
        }
        if (!["broken", "complete"].includes(f.phase)) return;
        f.rebuildRemaining = Math.max(0, (f.rebuildRemaining ?? CONFIG.rebuildTurns) - delta);
        if (f.rebuildRemaining > 0) return;
        f.nodes = [];
        for (const t of f.traps) {
            delete t.placed;
            delete t.owner;
            delete t.turn;
        }
        for (const l of f.links || []) l.built = false;
        // Pre-network saves retain their item but receive a fresh four-anchor field.
        if (!f.links) {
            f.traps = [
                { x: 9, y: 7 },
                { x: 15, y: 7 },
                { x: 15, y: 13 },
                { x: 9, y: 13 },
            ];
            f.links = f.traps.map((_t, i) => ({ a: i, b: (i + 1) % 4, built: false, entrance: i === 3 }));
        }
        f.lastPlayer = { x: f.x, y: f.y };
        f.retreat = { x: 0, y: 0 };
        delete f.lastReinforcement;
        f.phase = "preparing";
        say("SpiderlingsFieldPreparing");
    }
    function audit() {
        const f = field();
        if (!f || ["broken", "complete"].includes(f.phase)) return;
        if (
            !f.links ||
            f.nodes.some((n) => !KDMapData.Entities.some((e) => e.id === n.id && e.hp > 0)) ||
            f.traps.some((t) => t.placed && KinkyDungeonTilesGet(t.x + "," + t.y)?.SpinnerTrap !== KEY)
        ) {
            end("broken");
            return;
        }
        if (f.links.every((l) => l.built) && f.phase !== "sprung") {
            f.phase = "sprung";
            say("SpiderlingsFieldSprung");
        } else if (f.phase === "preparing" && f.links.filter((l) => !l.entrance).every((l) => l.built)) {
            f.phase = "ready";
            say("SpiderlingsFieldWaiting");
        }
    }
    function contains(e) {
        const f = field();
        return (
            !!f &&
            e.x > f.x - CONFIG.radius &&
            e.x < f.x + CONFIG.radius &&
            e.y > f.y - CONFIG.radius &&
            e.y < f.y + CONFIG.radius
        );
    }
    function captureReady() {
        const f = field();
        return (
            active() &&
            f?.phase === "sprung" &&
            contains(KinkyDungeonPlayerEntity) &&
            f.links?.length === 4 &&
            f.links.every((l) => l.built) &&
            f.traps.every((t) => t.placed && KinkyDungeonTilesGet(t.x + "," + t.y)?.SpinnerTrap === KEY) &&
            f.nodes.length === 24 &&
            f.nodes.every(
                (n) =>
                    n.id !== undefined &&
                    KDMapData.Entities.some(
                        (e) => e.id === n.id && e.Enemy.name === WALL && e.hp > 0 && e.x === n.x && e.y === n.y,
                    ),
            )
        );
    }
    function addSpinner() {
        const f = field();
        if (!active() || !f || api.SpinnerCapture.state()?.phase === "wrap") return false;
        if (KDMapData.Entities.filter((e) => e.Enemy.name === "Spinner" && e.hp > 0).length >= 8) return false;
        const points = [],
            p = KinkyDungeonPlayerEntity;
        for (let y = f.y - 2; y <= f.y + 2; y++)
            for (let x = f.x - 2; x <= f.x + 2; x++)
                if (
                    (x !== p.x || y !== p.y) &&
                    !KinkyDungeonEnemyAt(x, y) &&
                    KinkyDungeonMovableTilesSmartEnemy.includes(KinkyDungeonMapGet(x, y))
                )
                    points.push({ x, y });
        points.sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y));
        if (!points.length) return false;
        const e = DialogueCreateEnemy(points[0].x, points[0].y, "Spinner");
        if (!e) return false;
        e.aware = true;
        e.vp = 1;
        e.hostile = 999;
        f.ids.push(e.id);
        KDUpdateEnemyCache = true;
        return true;
    }
    function holdsAttack(enemy) {
        return active() && field()?.ids.includes(enemy?.id) && ["preparing", "ready"].includes(field().phase);
    }
    function handleEnemyTurn(enemy, _target, delta) {
        const f = field();
        if (active() && f && !api.SpinnerCapture.state()) {
            if (enemy.id === f.jumper && !f.jumperEnabled) return { idle: true, defeat: false, defeatEnemy: enemy };
            if (build(enemy, delta) || holdsAttack(enemy)) return { idle: false, defeat: false, defeatEnemy: enemy };
        }
        return undefined;
    }
    if (typeof KDInputTypes !== "undefined") {
        KDInputTypes.spiderlingsSpinnerAdd = () => (addSpinner() ? "Added" : "Blocked");
        KDInputTypes.spiderlingsSpinnerReset = () => {
            if (active()) {
                enter();
                return "Reset";
            }
            return "Blocked";
        };
        KDInputTypes.spiderlingsSpinnerJumper = () => {
            if (active()) {
                field().jumperEnabled = true;
                return "Released";
            }
            return "Blocked";
        };
    }
    if (typeof KDEventMapGeneric !== "undefined") {
        KDAddEvent(KDEventMapGeneric, "tickAfter", KEY, (_e, d) => fieldTurn(d?.delta));
        KDAddEvent(KDEventMapGeneric, "afterEnemyTick", KEY, () => audit());
        KDAddEvent(KDEventMapGeneric, "afterLoadGame", KEY, () => {
            clearDrawing();
            const f = field();
            if (f?.links?.length === 4) f.links[3].entrance = true;
            audit();
        });
        for (const event of ["postMapgen", "defeat", "passout", "postPrisonIntro"])
            KDAddEvent(KDEventMapGeneric, event, KEY, () => {
                if (field()) end("broken");
                clearDrawing();
            });
        KDAddEvent(KDEventMapGeneric, "draw", KEY, (_e, d) => {
            const f = field();
            if (!active() || !f) {
                clearDrawing();
                return;
            }
            if (!drawing || drawing.destroyed) {
                drawing = new PIXI.Graphics();
                kdgameboard.addChild(drawing);
            }
            drawing.clear();
            const size = KinkyDungeonGridSizeDisplay;
            // Standalone KD already pans kdgameboard; its children must not pan twice.
            const boardPans = typeof StandalonePatched !== "undefined" && StandalonePatched;
            const xy = (n) => [
                (n.x - d.CamX - (boardPans ? 0 : d.CamX_offset)) * size,
                (n.y - d.CamY - (boardPans ? 0 : d.CamY_offset)) * size,
            ];
            const normalArt =
                api.getSetting?.("spiderlingsPinkWebbing") !== true &&
                typeof KDDraw === "function" &&
                typeof kdpixisprites !== "undefined";
            const root = typeof KinkyDungeonRootDirectory === "string" ? KinkyDungeonRootDirectory : "";
            const border = (cell, name, rotation = 0) => {
                if (!normalArt) return false;
                const [x, y] = xy(cell);
                return !!KDDraw(
                    kdgameboard,
                    kdpixisprites,
                    `SpiderlingsFieldBorder_${cell.x},${cell.y}`,
                    root + `Bullets/SpiderlingsSpinnerTrap${name}.png`,
                    x + size / 2,
                    y + size / 2,
                    size,
                    size,
                    rotation,
                    undefined,
                    true,
                );
            };
            if (!["broken", "complete"].includes(f.phase)) {
                for (const [index, l] of (f.links || []).entries())
                    if (l.built) {
                        const a = xy(f.traps[l.a]),
                            b = xy(f.traps[l.b]);
                        const cells = linkCells(f, l),
                            health = f.nodes
                                .filter((n) => cells.some((c) => c.x === n.x && c.y === n.y))
                                .map((n) => KDMapData.Entities.find((e) => e.id === n.id)?.hp || 0);
                        const art = cells
                            .slice(1, -1)
                            .map((cell) =>
                                border(cell, index % 2 === 0 ? "Top" : "Side", index >= 1 && index <= 2 ? Math.PI : 0),
                            )
                            .every(Boolean);
                        if (!art)
                            drawing
                                .lineStyle(5, 0xffffff, 1)
                                .moveTo(a[0] + size / 2, a[1] + size / 2)
                                .lineTo(b[0] + size / 2, b[1] + size / 2);
                        if (health.length)
                            DrawTextKD(
                                Math.round(Math.min(...health) * 10) / 10 + "/2",
                                (a[0] + b[0]) / 2 + size / 2 + (boardPans ? kdgameboard.x : 0),
                                (a[1] + b[1]) / 2 + size / 2 - 16 + (boardPans ? kdgameboard.y : 0),
                                "#FFFFFF",
                                "#000000",
                                16,
                            );
                    }
                for (let i = 0; i < f.traps.length; i++)
                    if (f.links[i]?.built && f.links[(i + f.traps.length - 1) % f.traps.length]?.built)
                        border(f.traps[i], "Corner", (i * Math.PI) / 2);
                for (const n of f.nodes.filter((n) => n.weak)) {
                    const [x, y] = xy(n);
                    drawing.lineStyle(3, 0xffd76a, 1).drawCircle(x + size / 2, y + size / 2, size * 0.22);
                }
                for (const t of f.traps.filter((t) => t.placed)) {
                    const [x, y] = xy(t);
                    drawing.lineStyle(2, 0xffffff, 0.8);
                    for (let i = 1; i < 4; i++) {
                        drawing.moveTo(x + 5, y + (i * size) / 4).lineTo(x + size - 5, y + (i * size) / 4);
                        drawing.moveTo(x + (i * size) / 4, y + 5).lineTo(x + (i * size) / 4, y + size - 5);
                    }
                }
            }
            DrawTextKD(
                TextGet("SpiderlingsFieldStatus")
                    .replace("{phase}", TextGet("SpiderlingsFieldPhase" + f.phase))
                    .replace("{count}", f.traps.filter((t) => t.placed).length)
                    .replace("{links}", f.links?.filter((l) => l.built).length || 0),
                1050,
                685,
                "#FFFFFF",
                "#000000",
                20,
            );
            if (["broken", "complete"].includes(f.phase))
                DrawTextKD(
                    TextGet("SpiderlingsFieldRebuild").replace("{turns}", f.rebuildRemaining ?? CONFIG.rebuildTurns),
                    1050,
                    725,
                    "#FFFFFF",
                    "#000000",
                    20,
                );
            if (api.SpinnerCapture.state()?.phase !== "wrap")
                DrawButtonKDEx(
                    KEY + "Add",
                    () => {
                        KDSendInput("spiderlingsSpinnerAdd", {});
                        return true;
                    },
                    true,
                    1260,
                    770,
                    220,
                    45,
                    TextGet("SpiderlingsFieldAddSpinner"),
                    "#FFFFFF",
                );
            DrawButtonKDEx(
                KEY + "Reset",
                () => {
                    KDSendInput("spiderlingsSpinnerReset", {});
                    return true;
                },
                true,
                1260,
                825,
                220,
                45,
                TextGet("SpiderlingsFieldReset"),
                "#FFFFFF",
            );
            if (!f.jumperEnabled)
                DrawButtonKDEx(
                    KEY + "Jumper",
                    () => {
                        KDSendInput("spiderlingsSpinnerJumper", {});
                        return true;
                    },
                    true,
                    1490,
                    825,
                    230,
                    45,
                    TextGet("SpiderlingsFieldJumper"),
                    "#FFFFFF",
                );
        });
    }
    for (const phase of ["preparing", "ready", "sprung", "broken", "complete"])
        if (typeof addTextKey === "function") addTextKey("SpiderlingsFieldPhase" + phase, phase);
    api.SpinnerField = {
        CONFIG,
        ROOM,
        WALL,
        field,
        enter,
        handleEnemyTurn,
        holdsAttack,
        onCaptureEnd,
        contains,
        captureReady,
        suppressesBinding: (enemy) =>
            active() &&
            enemy?.Enemy.name === "Spinner" &&
            field() &&
            (field().ids.includes(enemy.id) || (contains(enemy) && contains(KinkyDungeonPlayerEntity))) &&
            ["preparing", "ready", "sprung"].includes(field().phase),
    };
})();
