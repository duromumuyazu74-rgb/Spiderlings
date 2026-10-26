"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsBossEncounter";
    const NAME = api.BossFootprint.NAME;
    const BODY = ["fan", "ring", "track", "barrage", "capture"];
    const SUPPORT = ["WebCaster", "Jumper", "MageSpiderlings"];
    const CENTERS = [
        { x: 5, y: 5 },
        { x: 35, y: 5 },
        { x: 5, y: 35 },
        { x: 35, y: 35 },
    ];
    const state = () => (api.BossRoom.active() ? KDMapData[KEY] : undefined);
    const boss = () =>
        KDMapData.Entities.find((enemy) => api.BossFootprint.isBoss(enemy) && enemy.id === state()?.bossId);
    const fixed = (enemy) => !!state() && enemy?.SpiderlingsBossFormation?.room === KDGameData.RoomType;
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const disabled = (enemy) => !enemy || enemy.hp <= 0 || KinkyDungeonIsDisabled(enemy) || KDHelpless(enemy);
    const paused = () => !!api.BossCapture?.peaceful();
    const hostileResult = (enemy) => ({ idle: false, defeat: false, defeatEnemy: enemy });
    function ownsThreat(enemy) {
        if (api.BossFootprint.isBoss(enemy) || api.BossFootprint.isPart(enemy)) return true;
        if (enemy.allied || enemy.Enemy?.allied || KDAllied(enemy) || KDIsInParty(enemy)) return false;
        return fixed(enemy) || (enemy.Enemy?.tags?.spiderlings && KDHostile(enemy));
    }
    function clearThreats(keepBoss) {
        const removedIds = new Set([...(state()?.actorIds || []), ...(state()?.builderIds || [])]);
        for (const enemy of KDMapData.Entities) if (ownsThreat(enemy)) removedIds.add(enemy.id);
        const graph = api.SpinnerNativeField.state()?.topology;
        for (const field of Object.values(graph?.fields || {})) {
            if (
                field.id?.startsWith("spiderlings-boss-court:") ||
                (graph.fieldOwners?.[field.id] || []).some((id) => removedIds.has(id))
            )
                api.SpinnerNativeField.retireField(field.id);
        }
        for (const enemy of [...KDMapData.Entities])
            if (enemy !== keepBoss && ownsThreat(enemy)) KDRemoveEntity(enemy, false, false, true);
        for (const bullet of KDMapData.Bullets)
            if (removedIds.has(bullet.source ?? bullet.bullet?.source) && bullet.bullet?.faction !== "Player")
                bullet.time = 0;
    }
    function legal(point, reserved = new Set()) {
        return (
            point.x > 1 &&
            point.y > 1 &&
            point.x < 39 &&
            point.y < 39 &&
            KinkyDungeonGroundTiles.includes(KinkyDungeonMapGet(point.x, point.y)) &&
            !KinkyDungeonEntityAt(point.x, point.y) &&
            !reserved.has(`${point.x},${point.y}`)
        );
    }
    function spawnFormation(names, points, kind) {
        const reserved = new Set();
        if (
            names.length !== points.length ||
            points.some((point) => {
                if (!legal(point, reserved)) return true;
                reserved.add(`${point.x},${point.y}`);
                return false;
            })
        )
            return undefined;
        const created = [];
        for (let index = 0; index < names.length; index++) {
            const point = points[index];
            const enemy = DialogueCreateEnemy(point.x, point.y, names[index]);
            if (!enemy) {
                for (const child of created) KDRemoveEntity(child, false, false, true);
                return undefined;
            }
            enemy.faction = "Enemy";
            enemy.aware = true;
            enemy.vp = 10;
            enemy.SpiderlingsBossFormation = { room: KDGameData.RoomType, kind };
            created.push(enemy);
            if (state()) (state().actorIds ||= []).push(enemy.id);
        }
        KDUpdateEnemyCache = true;
        return created;
    }
    function initialize() {
        if (!api.BossRoom.active() || api.BossRoom.state().complete) return;
        if (state()?.restart) {
            clearThreats();
            delete KDMapData[KEY];
            api.BossRoom.startNextAttempt();
        }
        if (state()) return;
        const enemy = DialogueCreateEnemy(20, 5, NAME);
        if (!enemy) return;
        enemy.faction = "Enemy";
        enemy.aware = true;
        enemy.vp = 10;
        KDMapData[KEY] = {
            version: 1,
            bossId: enemy.id,
            phase: "one",
            clock: 0,
            nextBody: 0,
            bodyIndex: 0,
            nextSupport: 0,
            supportIndex: 0,
            nextPulse: 0,
            warnings: [],
            barrages: [],
            nests: [],
            builderIds: [],
            actorIds: [enemy.id],
            history: [],
        };
        api.BossFootprint.sync(enemy);
        const builders = spawnFormation(
            Array(8).fill("Spinner"),
            [
                { x: 7, y: 7 },
                { x: 20, y: 7 },
                { x: 33, y: 7 },
                { x: 33, y: 20 },
                { x: 33, y: 33 },
                { x: 20, y: 33 },
                { x: 7, y: 33 },
                { x: 7, y: 20 },
            ],
            "builder",
        );
        state().builderIds = (builders || []).map((actor) => actor.id);
        api.BossFields?.initialize();
        schedule();
    }
    function supportPositions(name) {
        const player = KinkyDungeonPlayerEntity;
        const wanted =
            name === "Jumper"
                ? [
                      [-1, -1],
                      [-1, 0],
                      [-1, 1],
                      [1, -1],
                      [1, 0],
                      [1, 1],
                  ]
                : [
                      [-1, -1],
                      [1, -1],
                      [-1, 1],
                      [1, 1],
                  ];
        const points = [],
            reserved = new Set();
        for (const [dx, dy] of wanted) {
            let selected;
            for (const radius of [5, 6, 7, 4]) {
                const point = { x: player.x + dx * radius, y: player.y + (name === "Jumper" ? dy : dy * radius) };
                if (legal(point, reserved)) {
                    selected = point;
                    break;
                }
            }
            if (!selected) {
                const preferred = { x: player.x + dx * 5, y: player.y + (name === "Jumper" ? dy : dy * 5) };
                const alternatives = [];
                for (let y = player.y - 7; y <= player.y + 7; y++)
                    for (let x = player.x - 7; x <= player.x + 7; x++) {
                        const point = { x, y };
                        if (
                            Math.sign(x - player.x) === dx &&
                            (name === "Jumper" || Math.sign(y - player.y) === dy) &&
                            distance(point, player) >= 4 &&
                            legal(point, reserved)
                        )
                            alternatives.push(point);
                    }
                alternatives.sort((a, b) => distance(a, preferred) - distance(b, preferred) || a.y - b.y || a.x - b.x);
                selected = alternatives[0];
            }
            if (!selected) return undefined;
            points.push(selected);
            reserved.add(`${selected.x},${selected.y}`);
        }
        return points;
    }
    function summon() {
        const saved = state(),
            name = SUPPORT[saved.supportIndex % 3],
            points = supportPositions(name);
        if (!points) return false;
        const members = spawnFormation(Array(points.length).fill(name), points, "support");
        if (!members) return false;
        const target = { x: KinkyDungeonPlayerEntity.x, y: KinkyDungeonPlayerEntity.y };
        members.forEach((enemy, index) => {
            if (name === "Jumper") return;
            const signs = [
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1],
            ][index];
            enemy.SpiderlingsBossSupport = {
                castAt: saved.clock + (name === "MageSpiderlings" ? 0 : 2),
                target: name === "MageSpiderlings" ? { x: target.x + signs[0], y: target.y + signs[1] } : target,
                fired: false,
            };
        });
        saved.history.push({ kind: "support", name, at: saved.clock, count: members.length });
        saved.history = saved.history.slice(-24);
        saved.supportIndex++;
        saved.nextSupport = saved.clock + (saved.phase === "two" ? 9 : 12);
        return true;
    }
    function warn(kind, turns = 2, reversed = false) {
        const saved = state(),
            enemy = boss(),
            player = KinkyDungeonPlayerEntity;
        const origin = { x: enemy.x, y: enemy.y };
        const aim = { x: Math.sign(player.x - enemy.x), y: Math.sign(player.y - enemy.y) };
        const cells = [];
        for (let y = 1; y < 40; y++)
            for (let x = 1; x < 40; x++) {
                const dx = x - origin.x,
                    dy = y - origin.y,
                    r = Math.max(Math.abs(dx), Math.abs(dy));
                const dot = dx * aim.x + dy * aim.y;
                if (kind === "melee" && r === 2) cells.push({ x, y });
                if (
                    kind === "fan" &&
                    r > 1 &&
                    r <= 10 &&
                    (reversed ? dot < 0 : dot > 0) &&
                    Math.abs(dx * aim.y - dy * aim.x) <= Math.abs(dot)
                )
                    cells.push({ x, y });
                if (kind === "ring" && (reversed ? r >= 5 && r <= 8 : r >= 2 && r <= 4)) cells.push({ x, y });
                if (kind === "track" && distance({ x, y }, player) <= 1) cells.push({ x, y });
            }
        saved.warnings.push({
            kind,
            cells,
            at: saved.clock + turns,
            follow: saved.phase === "two" && !reversed && ["fan", "ring"].includes(kind),
        });
        KinkyDungeonSendTextMessage(
            6,
            TextGet("SpiderlingsBossSkill_" + kind).replace("TURNS", String(turns)),
            "#e7c77d",
            turns + 1,
        );
    }
    function schedule() {
        const saved = state(),
            enemy = boss();
        if (!saved || !["one", "two"].includes(saved.phase) || disabled(enemy)) return;
        if (api.BossCapture?.state()?.phase === "escort") return;
        if (saved.clock >= saved.nextPulse) {
            api.SilkDensity.refresh();
            saved.nextPulse = saved.clock + 6;
        }
        if (paused()) return;
        if (saved.clock >= saved.nextSupport) summon();
        if (saved.clock < saved.nextBody) return;
        const kind = BODY[saved.bodyIndex++ % BODY.length];
        if (api.BossCapture?.contesting() && !["barrage"].includes(kind)) {
            saved.nextBody = saved.clock + 2;
            return;
        }
        if (kind === "barrage") {
            const count = saved.phase === "two" ? 5 : 2;
            for (let index = 0; index < count; index++) {
                const angle = (Math.PI * 2 * index) / count;
                const point = {
                    x: enemy.x + Math.round(Math.cos(angle) * 4),
                    y: enemy.y + Math.round(Math.sin(angle) * 4),
                };
                if (KinkyDungeonMovableTilesEnemy.includes(KinkyDungeonMapGet(point.x, point.y)))
                    saved.barrages.push({ ...point, remaining: 6, nextAt: saved.clock + 2, sourceId: enemy.id });
            }
        } else if (kind === "capture") api.BossCapture?.start(enemy);
        else if (kind === "track") {
            saved.tracking = { remaining: saved.phase === "two" ? 5 : 3, nextAt: saved.clock };
        } else warn(kind);
        saved.history.push({ kind: "body", name: kind, at: saved.clock });
        saved.lastBodyAt = saved.clock;
        saved.history = saved.history.slice(-24);
        saved.nextBody =
            saved.clock + (kind === "track" ? (saved.phase === "two" ? 12 : 8) : kind === "capture" ? 12 : 6);
    }
    function advanceEffects() {
        const saved = state(),
            enemy = boss();
        if (
            saved.tracking &&
            saved.clock >= saved.tracking.nextAt &&
            ["one", "two"].includes(saved.phase) &&
            !paused()
        ) {
            warn("track");
            saved.tracking.remaining--;
            saved.tracking.nextAt = saved.clock + 2;
            if (!saved.tracking.remaining) delete saved.tracking;
        }
        for (const warning of [...saved.warnings])
            if (warning.at <= saved.clock) {
                if (
                    warning.cells.some((cell) => distance(cell, KinkyDungeonPlayerEntity) === 0) &&
                    enemy &&
                    enemy.hp > 0
                )
                    api.Webbing.applyEnemyProgression("MageSpiderlings", enemy, "Enemy");
                saved.warnings.splice(saved.warnings.indexOf(warning), 1);
                if (warning.follow && ["one", "two"].includes(saved.phase) && !paused()) warn(warning.kind, 2, true);
            }
        for (const circle of [...saved.barrages])
            if (circle.nextAt <= saved.clock) {
                if (enemy?.hp > 0) {
                    const caster = { ...enemy, x: circle.x, y: circle.y };
                    KinkyDungeonCastSpell(
                        KinkyDungeonPlayerEntity.x,
                        KinkyDungeonPlayerEntity.y,
                        KinkyDungeonFindSpell("SpiderlingsMageBolt", true),
                        caster,
                        undefined,
                        undefined,
                        "Enemy",
                    );
                }
                circle.remaining--;
                circle.nextAt = saved.clock + 1;
                if (!circle.remaining) saved.barrages.splice(saved.barrages.indexOf(circle), 1);
            }
    }
    function spawnNests() {
        const saved = state();
        for (const goal of saved.nests) {
            if (goal.spawned) continue;
            const center = CENTERS[goal.corner];
            const positions = [
                center,
                { x: center.x - 1, y: center.y + 1 },
                { x: center.x, y: center.y + 1 },
                { x: center.x + 1, y: center.y + 1 },
            ];
            const formation = spawnFormation(
                ["NestEntrance", "Spinner", "Spinner", "Spinner"],
                positions,
                "nest-guard",
            );
            if (!formation) continue;
            goal.spawned = true;
            goal.id = formation[0].id;
            delete formation[0].SpiderlingsBossFormation;
            formation[0].questtarget = true;
        }
    }
    function checkDefeat(enemy) {
        const saved = state();
        if (!saved || enemy.id !== saved.bossId || enemy.hp > 0) return false;
        if (saved.phase === "one") {
            saved.phase = "interlude";
            saved.warnings = [];
            delete saved.tracking;
            api.BossCapture?.interrupt(false);
            enemy.hp = 2.8;
            saved.nests = CENTERS.map((_point, corner) => ({ corner, spawned: false, destroyed: false }));
            spawnNests();
            KinkyDungeonSendTextMessage(10, TextGet("SpiderlingsBossInterlude"), "#cdb4ff", 6);
            return true;
        }
        if (saved.phase === "two") {
            saved.phase = "victory";
            saved.warnings = [];
            saved.barrages = [];
            delete saved.tracking;
            api.BossCapture?.interrupt(true);
            api.BossRoom.complete();
            clearThreats(enemy);
            KinkyDungeonSendTextMessage(10, TextGet("SpiderlingsCourtVictory"), "#b7e7b0", 8);
        }
        return false;
    }
    function advance(delta) {
        initialize();
        const saved = state();
        if (!saved || !(delta > 0) || saved.phase === "victory") return;
        for (let time = 0; time < delta; time += 1) {
            saved.clock += Math.min(1, delta - time);
            const enemy = boss();
            if (!enemy) return;
            checkDefeat(enemy);
            advanceEffects();
            if (saved.phase === "interlude") {
                spawnNests();
                if (saved.nests.every((goal) => goal.spawned && goal.destroyed)) {
                    saved.phase = "two";
                    saved.nextBody = saved.clock;
                    saved.nextSupport = saved.clock;
                    saved.bodyIndex = 0;
                    saved.supportIndex = 0;
                } else enemy.hp = Math.min(140, enemy.hp + 2.8);
            }
            api.BossFields?.advance();
            api.BossCapture?.advance(Math.min(1, delta - time));
            if (state() !== saved) return;
            schedule();
        }
    }
    function handleEnemyTurn(enemy, target, delta) {
        const saved = state();
        if (!saved) return undefined;
        if (api.BossFootprint.isBoss(enemy)) {
            if (
                delta > 0 &&
                !disabled(enemy) &&
                ["one", "two"].includes(saved.phase) &&
                !paused() &&
                !api.BossCapture?.contesting()
            ) {
                enemy.SpiderlingsBossMoveCredit = (enemy.SpiderlingsBossMoveCredit || 0) + delta;
                enemy.SpiderlingsBossMeleeCredit = (enemy.SpiderlingsBossMeleeCredit || 0) + delta;
                if (
                    distance(api.BossFootprint.nearest(enemy, target), target) <= 1 &&
                    saved.clock >= (saved.lastBodyAt || 0) + 4 &&
                    enemy.SpiderlingsBossMeleeCredit >= (saved.phase === "two" ? 2 : 3) &&
                    !saved.warnings.length
                ) {
                    warn("melee", 1);
                    enemy.SpiderlingsBossMeleeCredit = 0;
                }
                if (
                    enemy.SpiderlingsBossMoveCredit >= 2 &&
                    distance(api.BossFootprint.nearest(enemy, target), target) > 2
                ) {
                    const directions = [
                        [Math.sign(target.x - enemy.x), Math.sign(target.y - enemy.y)],
                        [Math.sign(target.x - enemy.x), 0],
                        [0, Math.sign(target.y - enemy.y)],
                    ];
                    const step = directions.find(
                        ([x, y]) => (x || y) && api.BossFootprint.canPlace(enemy, enemy.x + x, enemy.y + y),
                    );
                    if (step) {
                        KDMoveEntity(enemy, enemy.x + step[0], enemy.y + step[1], true);
                        enemy.SpiderlingsBossMoveCredit -= 2;
                    }
                }
            }
            return hostileResult(enemy);
        }
        if (saved.phase === "victory") return hostileResult(enemy);
        if (api.PrisonEscort?.ownsActor(enemy)) return undefined;
        if (paused() && target?.player) {
            if (api.BossCapture?.state()?.phase === "escort" && !enemy.Enemy.immobile && !disabled(enemy)) {
                const escortId = api.PrisonEscort.state()?.escortId;
                const escort = KDMapData.Entities.find((actor) => actor.id === escortId);
                if (distance(enemy, target) <= 3 || (escort && distance(enemy, escort) <= 2)) {
                    const parking = [];
                    for (let dy = -5; dy <= 5; dy++)
                        for (let dx = -5; dx <= 5; dx++) {
                            const point = { x: target.x + dx, y: target.y + dy };
                            if (
                                distance(point, target) >= 4 &&
                                (!escort || distance(point, escort) >= 3) &&
                                legal(point)
                            )
                                parking.push(point);
                        }
                    const next = api.SpinnerAI.occupancyRoute(enemy, parking)?.find(
                        (cell) => cell.x !== enemy.x || cell.y !== enemy.y,
                    );
                    if (next && !KinkyDungeonEntityAt(next.x, next.y))
                        KinkyDungeonEnemyTryMove(
                            enemy,
                            { x: next.x - enemy.x, y: next.y - enemy.y },
                            delta,
                            next.x,
                            next.y,
                            false,
                        );
                }
            }
            return hostileResult(enemy);
        }
        const support = enemy.SpiderlingsBossSupport;
        if (support && delta > 0) {
            if (disabled(enemy)) return hostileResult(enemy);
            if (!support.fired && saved.clock >= support.castAt) {
                const spell = enemy.Enemy.name === "MageSpiderlings" ? "SpiderlingsMageCollapse" : "WebSpray";
                const result = KinkyDungeonCastSpell(
                    support.target.x,
                    support.target.y,
                    KinkyDungeonFindSpell(spell, true),
                    enemy,
                    undefined,
                    undefined,
                    "Enemy",
                );
                if (result?.result === "Cast") {
                    support.fired = true;
                    support.retireAt = saved.clock + (spell === "SpiderlingsMageCollapse" ? 6 : 8);
                }
            }
            if (support.fired && saved.clock >= support.retireAt) KDRemoveEntity(enemy, false, false, true);
            return hostileResult(enemy);
        }
        return undefined;
    }
    function leave() {
        const saved = state();
        if (!saved) return;
        api.BossCapture?.interrupt(true);
        if (saved.phase !== "victory") saved.restart = true;
    }
    api.addEnemies([
        {
            name: NAME,
            faction: "Enemy",
            color: "#cdb4ff",
            nonHumanoid: true,
            GFX: { spriteWidth: 216, spriteHeight: 216 },
            tags: KDMapInit([
                "spiderlings",
                "boss",
                "notalk",
                "noreinforce",
                "unstoppable",
                "glueresist",
                "fireweakness",
            ]),
            AI: "hunt",
            visionRadius: 40,
            blindSight: 40,
            maxhp: 140,
            minLevel: 0,
            weight: -1000,
            terrainTags: {},
            floors: KDMapInit([]),
            movePoints: 2,
            attackPoints: 2,
            attack: "",
            attackRange: 2,
            armor: 1,
            evasion: -1,
            power: 2,
            dmgType: "glue",
            dropTable: [],
        },
    ]);
    api.NativeActions.registerBehavior("BossEncounter", { handleEnemyTurn });
    if (typeof KDRemoveEntity === "function")
        KDRemoveEntity = api.Hooks.wrap(
            "BossEncounter.nestDeath",
            KDRemoveEntity,
            (native) =>
                function (enemy, kill) {
                    const saved = state(),
                        goal = saved?.nests.find((entry) => entry.id === enemy.id);
                    const removed = native.apply(this, arguments);
                    if (removed && kill && goal && !KDMapData.Entities.includes(enemy)) goal.destroyed = true;
                    return removed;
                },
        );
    KDAddEvent(KDEventMapGeneric, "tickAfter", KEY, (_event, data) => advance(Number(data?.delta || 0)));
    KDAddEvent(KDEventMapGeneric, "postMapgen", KEY, initialize);
    api.BossEncounter = Object.freeze({
        state,
        boss,
        initialize,
        advance,
        checkDefeat,
        spawnFormation,
        isFixedFormation: fixed,
        invulnerable: () => state()?.phase === "interlude",
        leave,
        paused,
    });
})();
