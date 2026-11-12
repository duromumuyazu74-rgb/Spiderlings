"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const RUNE = "SpiderlingsMatriarchRune";
    const EFFECT = "SpiderlingsMatriarchRuneHit";
    const state = () => api.BossEncounter.state()?.capture;
    const room = () => api.BossEncounter.state();
    const clock = () => room()?.clock || 0;
    const player = () => KinkyDungeonPlayerEntity;
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const otherControl = () => !!api.SpinnerCapture?.state() || !!api.SpinnerRecovery?.state?.() || !!player()?.leash;
    let driver,
        automatic = false,
        pulling = false;
    function stopDriver() {
        if (driver) clearTimeout(driver);
        driver = undefined;
    }
    function scheduleWrap() {
        if (driver || state()?.phase !== "wrap") return;
        driver = setTimeout(() => {
            driver = undefined;
            if (state()?.phase !== "wrap") return;
            if (
                KinkyDungeonState !== "Game" ||
                KinkyDungeonDrawState !== "Game" ||
                KDGameData.CurrentDialog ||
                KinkyDungeonShowInventory
            ) {
                scheduleWrap();
                return;
            }
            automatic = true;
            try {
                KinkyDungeonAdvanceTime(1, true);
            } finally {
                automatic = false;
            }
            scheduleWrap();
        }, 240);
    }
    function interrupt(final = false) {
        const current = state();
        if (!current) return;
        if (!final && api.SpellwovenCocoon.item(current.itemId) && ["wrap", "escape", "escort"].includes(current.phase))
            return;
        stopDriver();
        if (current.runeId) {
            const rune = KDMapData.Entities.find((enemy) => enemy.id === current.runeId);
            if (rune) KDRemoveEntity(rune, false, false, true);
        }
        if (current.phase === "escort") api.PrisonEscort.clear();
        if (room()) delete room().capture;
    }
    function start(source) {
        if (!source || state() || api.SpellwovenCocoon.item() || otherControl()) return false;
        room().capture = { phase: "warning", sourceId: source.id, due: clock() + 3 };
        KinkyDungeonSendTextMessage(10, TextGet("SpiderlingsBossCaptureWarning"), "#eed4ff", 4);
        return true;
    }
    function runeHit(source) {
        const current = state();
        if (!current || current.phase !== "rune" || current.runeId !== source?.id) return { effect: false };
        source.hp = 0;
        delete current.runeId;
        if (otherControl() || !["one", "two"].includes(room()?.phase)) {
            interrupt();
            return { effect: false };
        }
        current.phase = "contest";
        current.binding = 0;
        current.escape = 0;
        current.startedAt = clock();
        KinkyDungeonSendTextMessage(9, TextGet("SpiderlingsBossContestStart"), "#eed4ff", 4);
        return { effect: true };
    }
    function pull() {
        const current = state();
        if (current?.phase !== "contest" || !KinkyDungeonHasStamina(1, true)) return "Blocked";
        KDChangeStamina("struggle", "binding", "spiderlingsBossPull", -1);
        current.escape += 25;
        if (current.escape >= 75) interrupt();
        KinkyDungeonLastAction = "Struggle";
        KinkyDungeonAdvanceTime(1, true);
        return "Struggle";
    }
    function ensureServiceCrew() {
        const center = api.BossRoom.CENTER;
        for (const name of ["Tunneler", "Spinner"]) {
            if (KDMapData.Entities.some((enemy) => enemy.hp > 0 && enemy.Enemy.name === name && !enemy.allied))
                continue;
            // The crew enters at the free floor nearest the east edge, inside every closed ring.
            const point = api.BossRoom.nearestFree({ x: center.x + api.BossRoom.RADIUS, y: center.y });
            if (point) api.BossEncounter.spawnFormation([name], [point], "escort");
        }
    }
    // The next cell on the shortest route from the player to a cell beside the Matriarch.
    // Open floor is preferred; her own Court webs are crossed only when no open route exists.
    function pullStep(source) {
        const start = { x: player().x, y: player().y },
            key = (cell) => `${cell.x},${cell.y}`;
        const kind = (cell) => {
            if (!KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(cell.x, cell.y))) return undefined;
            const occupant = KinkyDungeonEntityAt(cell.x, cell.y);
            if (!occupant) return "open";
            return api.SpinnerNativeField.isOwnedProxy(occupant) ? occupant : undefined;
        };
        const directions = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (dx || dy) directions.push([dx, dy]);
        directions.sort(
            ([ax, ay], [bx, by]) =>
                Math.hypot(source.x - start.x - ax, source.y - start.y - ay) -
                Math.hypot(source.x - start.x - bx, source.y - start.y - by),
        );
        for (const tear of [false, true]) {
            const parents = new Map([[key(start), undefined]]),
                queue = [start];
            for (let index = 0; index < queue.length; index++) {
                const node = queue[index];
                if (node !== start && distance(node, api.BossFootprint.nearest(source, node)) === 1) {
                    let step = node;
                    while (parents.get(key(step)) !== start) step = parents.get(key(step));
                    const blocker = kind(step);
                    return { ...step, web: blocker === "open" ? undefined : blocker };
                }
                for (const [dx, dy] of directions) {
                    const next = { x: node.x + dx, y: node.y + dy },
                        found = kind(next);
                    if (parents.has(key(next)) || !found || (found !== "open" && !tear)) continue;
                    parents.set(key(next), node);
                    queue.push(next);
                }
            }
        }
        return undefined;
    }
    function advance(delta) {
        const current = state(),
            source = api.BossEncounter.boss();
        if (!current || !(delta > 0)) return;
        if (!source || source.hp <= 0) {
            interrupt(true);
            return;
        }
        if (["escape", "escort"].includes(current.phase) && !api.SpellwovenCocoon.item(current.itemId)) {
            interrupt(true);
            return;
        }
        if (current.phase === "warning" && clock() >= current.due) {
            const points = [];
            for (let dy = -2; dy <= 2; dy++)
                for (let dx = -2; dx <= 2; dx++)
                    if (Math.max(Math.abs(dx), Math.abs(dy)) === 2) points.push({ x: source.x + dx, y: source.y + dy });
            points.sort((a, b) => distance(a, player()) - distance(b, player()));
            let created;
            for (const point of points) {
                created = api.BossEncounter.spawnFormation([RUNE], [point], "rune");
                if (created) break;
            }
            if (created) {
                current.phase = "rune";
                current.runeId = created[0].id;
            }
        } else if (current.phase === "rune") {
            if (!KDMapData.Entities.some((enemy) => enemy.id === current.runeId && enemy.hp > 0)) interrupt();
        } else if (current.phase === "contest" && clock() > current.startedAt) {
            if (current.escape >= 75) {
                interrupt();
                return;
            }
            if (KinkyDungeonIsDisabled(source) || KDHelpless(source)) return;
            const nearest = api.BossFootprint.nearest(source, player());
            if (distance(player(), nearest) > 1) {
                const next = pullStep(source);
                if (!next) return;
                // The silk tears through one of her own webs rather than stalling behind it. Link
                // damage falls to a quarter away from anchors, so four times its health breaks it.
                if (next.web) api.SpinnerNativeField.onNativeDamage({ enemy: next.web, dmgDealt: next.web.hp * 4 });
                if (KinkyDungeonEntityAt(next.x, next.y)) return;
                pulling = true;
                try {
                    KDMovePlayer(next.x, next.y, false);
                } finally {
                    pulling = false;
                }
                if (player().x !== next.x || player().y !== next.y) return;
            }
            current.binding = Math.min(
                distance(player(), api.BossFootprint.nearest(source, player())) <= 1 ? 100 : 99,
                current.binding + 12.5 * delta,
            );
            if (current.binding >= 100) {
                current.phase = "wrap";
                current.remaining = 5;
                scheduleWrap();
            }
        } else if (current.phase === "wrap") {
            let cocoon = current.itemId == null ? undefined : api.SpellwovenCocoon.item(current.itemId);
            if (current.remaining === 5) {
                if (
                    distance(player(), api.BossFootprint.nearest(source, player())) > 1 ||
                    KinkyDungeonIsDisabled(source)
                ) {
                    interrupt(true);
                    return;
                }
                cocoon = api.SpellwovenCocoon.equip(source);
                if (!cocoon) {
                    interrupt(true);
                    return;
                }
                current.itemId = cocoon.id;
            }
            if (!cocoon) {
                interrupt(true);
                return;
            }
            current.remaining = Math.max(0, current.remaining - delta);
            api.SpellwovenCocoon.wrap(cocoon, 1 - current.remaining / 5);
            if (current.remaining === 0) {
                stopDriver();
                current.phase = "escape";
                current.deadline = clock() + 24;
                KinkyDungeonSendTextMessage(9, TextGet("SpiderlingsBossEscapeWindow"), "#eed4ff", 5);
            }
        } else if (current.phase === "escape" && clock() >= current.deadline) {
            current.phase = "escort";
            ensureServiceCrew();
            api.PrisonEscort.requestSpellwoven(api.SpellwovenCocoon.item(current.itemId));
        } else if (current.phase === "escort") ensureServiceCrew();
    }
    const controlling = () => ["contest", "wrap"].includes(state()?.phase);
    const peaceful = () =>
        ["escape", "escort"].includes(state()?.phase) || (state()?.phase === "wrap" && state().itemId != null);
    const transportItem = () => (state()?.phase === "escort" ? api.SpellwovenCocoon.item(state().itemId) : undefined);
    api.addEnemies([
        {
            name: RUNE,
            faction: "Enemy",
            nonHumanoid: true,
            color: "#bca0e8",
            tags: KDMapInit(["spiderlings", "notalk", "noreinforce", "unstoppable", "nobrain"]),
            AI: "hunt",
            visionRadius: 40,
            blindSight: 40,
            maxhp: 6,
            minLevel: 0,
            weight: -1000,
            terrainTags: {},
            floors: KDMapInit([]),
            followRange: 1,
            movePoints: 1.5,
            // The second attack point is KD's own one-turn wind-up tile before the rune lands.
            attackPoints: 2,
            attack: "MeleeEffect",
            attackRange: 1,
            attackWidth: 1,
            effect: { damage: "glue", effect: { name: EFFECT } },
            power: 0,
            dmgType: "inert",
            dropTable: [],
        },
    ]);
    KDPlayerEffects[EFFECT] = (_target, _damage, _effect, _spell, _faction, _bullet, source) => runeHit(source);
    if (typeof KDInputTypes !== "undefined") {
        KDInputTypes.spiderlingsBossPull = pull;
        for (const type of [
            "move",
            "movestairs",
            "tick",
            "struggle",
            "equip",
            "consumable",
            "tryCastSpell",
            "doattack",
            "dospecial",
            "docapture",
            "switchWeapon",
        ])
            if (typeof KDInputTypes[type] === "function")
                KDInputTypes[type] = api.Hooks.wrap(
                    `BossCapture.input.${type}`,
                    KDInputTypes[type],
                    (native) =>
                        function () {
                            if (state()?.phase === "wrap" && !automatic) return "Blocked";
                            return native.apply(this, arguments);
                        },
                );
    }
    KDAddEvent(KDEventMapGeneric, "beforeMove", "SpiderlingsBossCapture", () => {
        if (controlling() && !pulling) KinkyDungeonNoMoveFlag = true;
    });
    KDAddEvent(KDEventMapGeneric, "afterLoadGame", "SpiderlingsBossCapture", () => {
        stopDriver();
        if (state()?.phase === "wrap") scheduleWrap();
    });
    api.BossCapture = Object.freeze({
        RUNE,
        state,
        start,
        advance,
        interrupt,
        pull,
        runeHit,
        controlling,
        contesting: () => ["contest", "wrap"].includes(state()?.phase),
        peaceful,
        transportItem,
    });
})();
