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
        for (const name of ["Tunneler", "Spinner"]) {
            if (KDMapData.Entities.some((enemy) => enemy.hp > 0 && enemy.Enemy.name === name && !enemy.allied))
                continue;
            for (const point of [
                { x: 36, y: 20 },
                { x: 36, y: 21 },
                { x: 37, y: 20 },
                { x: 37, y: 21 },
            ]) {
                if (api.BossEncounter.spawnFormation([name], [point], "escort")) break;
            }
        }
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
                const dx = Math.sign(nearest.x - player().x),
                    dy = Math.sign(nearest.y - player().y);
                const next = [
                    { x: player().x + dx, y: player().y + dy },
                    { x: player().x + dx, y: player().y },
                    { x: player().x, y: player().y + dy },
                ].find(
                    (point) =>
                        distance(point, player()) > 0 &&
                        KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(point.x, point.y)) &&
                        !KinkyDungeonEntityAt(point.x, point.y),
                );
                if (!next) return;
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
            movePoints: 1,
            attackPoints: 1,
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
