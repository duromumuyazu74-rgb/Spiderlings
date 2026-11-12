"use strict";

(() => {
    const api = globalThis.Spiderlings;
    const KEY = "SpiderlingsBossEncounter";
    const NAME = api.BossFootprint.NAME;
    const BODY = ["fan", "ring", "track", "barrage", "capture"];
    const SUPPORT = ["WebCaster", "Jumper", "MageSpiderlings"];
    // Nine Jumpers leap at the 3x3 around the player; the player's own cell goes first.
    const COMBO = [
        [0, 0],
        [-1, -1],
        [0, -1],
        [1, -1],
        [1, 0],
        [1, 1],
        [0, 1],
        [-1, 1],
        [-1, 0],
    ];
    const STEPS = COMBO.slice(1);
    const key = (point) => `${point.x},${point.y}`;
    const state = () => (api.BossRoom.active() ? KDMapData[KEY] : undefined);
    const boss = () =>
        KDMapData.Entities.find((enemy) => api.BossFootprint.isBoss(enemy) && enemy.id === state()?.bossId);
    const fixed = (enemy) => !!state() && enemy?.SpiderlingsBossFormation?.room === KDGameData.RoomType;
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
    const disabled = (enemy) => !enemy || enemy.hp <= 0 || KinkyDungeonIsDisabled(enemy) || KDHelpless(enemy);
    const paused = () => !!api.BossCapture?.peaceful();
    const hostileResult = (enemy) => ({ idle: false, defeat: false, defeatEnemy: enemy });
    function resonanceSource() {
        const saved = state();
        if (!saved || !["one", "two"].includes(saved.phase) || api.BossCapture?.state()?.phase === "escort")
            return undefined;
        const enemy = boss();
        return disabled(enemy) ? undefined : enemy;
    }
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
    // Formations stay on the arena floor; only phase-two Nests use the corner alcoves.
    function legal(point, reserved = new Set(), alcove = false) {
        return (
            (alcove || api.BossRoom.inArena(point)) &&
            KinkyDungeonGroundTiles.includes(KinkyDungeonMapGet(point.x, point.y)) &&
            !KinkyDungeonEntityAt(point.x, point.y) &&
            !reserved.has(key(point))
        );
    }
    function spawnFormation(names, points, kind, options = {}) {
        const reserved = new Set();
        if (
            names.length !== points.length ||
            points.some((point) => {
                if (!legal(point, reserved, options.alcove)) return true;
                reserved.add(key(point));
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
        if (!api.BossRoom.active()) return;
        if (api.BossRoom.migrate() && state()) state().restart = true;
        if (api.BossRoom.state().complete) return;
        if (state()?.restart) {
            clearThreats();
            delete KDMapData[KEY];
            api.BossRoom.startNextAttempt();
        }
        if (state()) return;
        const center = api.BossRoom.CENTER,
            edge = api.BossRoom.RADIUS - 1;
        // She enters from the north edge, inside the first ring and clear of the north builder.
        const enemy = DialogueCreateEnemy(center.x, center.y - edge + 2, NAME);
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
        // Eight builders start just inside the edge ring, one per compass direction.
        const builders = spawnFormation(
            Array(8).fill("Spinner"),
            STEPS.map(([dx, dy]) => ({ x: center.x + dx * edge, y: center.y + dy * edge })),
            "builder",
        );
        state().builderIds = (builders || []).map((actor) => actor.id);
        api.BossFields?.initialize();
        schedule();
    }
    // One caster per quadrant around the player. A quadrant against the shrinking rings
    // borrows the left/right side, then the opposite side; closer rings relax the spacing.
    function supportPositions() {
        const player = KinkyDungeonPlayerEntity;
        for (const minimum of [4, 3, 2]) {
            const points = [],
                reserved = new Set();
            for (const [dx, dy] of [
                [-1, -1],
                [1, -1],
                [-1, 1],
                [1, 1],
            ]) {
                let selected;
                for (const [sx, sy] of [
                    [dx, dy],
                    [-dx, dy],
                    [dx, -dy],
                    [-dx, -dy],
                ]) {
                    const preferred = { x: player.x + sx * 5, y: player.y + sy * 5 },
                        candidates = [];
                    for (let y = player.y - 7; y <= player.y + 7; y++)
                        for (let x = player.x - 7; x <= player.x + 7; x++) {
                            const point = { x, y };
                            if (
                                Math.sign(x - player.x) === sx &&
                                Math.sign(y - player.y) === sy &&
                                distance(point, player) >= minimum &&
                                legal(point, reserved)
                            )
                                candidates.push(point);
                        }
                    candidates.sort(
                        (a, b) => distance(a, preferred) - distance(b, preferred) || a.y - b.y || a.x - b.x,
                    );
                    selected = candidates[0];
                    if (selected) break;
                }
                if (!selected) break;
                points.push(selected);
                reserved.add(key(selected));
            }
            if (points.length === 4) return points;
        }
        return undefined;
    }
    function comboTargets(player) {
        const open = (point) =>
            api.BossRoom.inArena(point) &&
            KinkyDungeonMovableTilesSmartEnemy.includes(KinkyDungeonMapGet(point.x, point.y)) &&
            !KinkyDungeonEnemyAt(point.x, point.y);
        const cells = COMBO.map(([dx, dy]) => ({ x: player.x + dx, y: player.y + dy }));
        const usable = cells.filter(open);
        // A walled or occupied cell is covered by the nearest open cell of the same 3x3.
        return cells.map((cell) =>
            open(cell)
                ? cell
                : usable.reduce((best, other) =>
                      Math.hypot(other.x - cell.x, other.y - cell.y) < Math.hypot(best.x - cell.x, best.y - cell.y)
                          ? other
                          : best,
                  ),
        );
    }
    // Leap lines of Jumpers already placed, so later Jumpers do not stand in them.
    function leapLine(from, to) {
        const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)),
            cells = [];
        for (let step = 1; step < steps; step++)
            cells.push(
                key({
                    x: Math.round(from.x + ((to.x - from.x) * step) / steps),
                    y: Math.round(from.y + ((to.y - from.y) * step) / steps),
                }),
            );
        return cells;
    }
    // Each Jumper starts within its own Dash range (more than two, at most four cells) of
    // its target, preferably behind it as seen from the player. Candidates come best first.
    function comboOrigins(target, offset, player, lanes) {
        const candidates = [];
        for (let y = target.y - 4; y <= target.y + 4; y++)
            for (let x = target.x - 4; x <= target.x + 4; x++) {
                const point = { x, y },
                    reach = Math.hypot(x - target.x, y - target.y);
                if (!(reach > 2 && reach <= 4) || distance(point, player) < 2 || lanes.has(key(point))) continue;
                if (!legal(point) || !KinkyDungeonCheckPath(x, y, target.x, target.y, false, true, 1, false)) continue;
                const away = Math.hypot(x - player.x, y - player.y),
                    length = Math.hypot(offset[0], offset[1]),
                    behind = length ? ((x - player.x) * offset[0] + (y - player.y) * offset[1]) / (away * length) : 0;
                candidates.push({ point, score: Math.abs(reach - 3) - behind * 2 });
            }
        candidates.sort((a, b) => a.score - b.score || a.point.y - b.point.y || a.point.x - b.point.x);
        return candidates.map((candidate) => candidate.point);
    }
    function summonCombo() {
        const player = { x: KinkyDungeonPlayerEntity.x, y: KinkyDungeonPlayerEntity.y },
            targets = comboTargets(player),
            lanes = new Set(),
            members = [];
        targets.forEach((target, index) => {
            // KD samples cells beside the leap line, including the Jumper's own cell, so the
            // Dash itself decides whether a placed Jumper can leap; a refused one tries the next cell.
            for (const origin of comboOrigins(target, COMBO[index], player, lanes).slice(0, 8)) {
                const [jumper] = spawnFormation(["Jumper"], [origin], "support") || [];
                if (!jumper) continue;
                jumper.SpiderlingsBossCombo = { x: target.x, y: target.y };
                if (!api.JumperDash.runtimeController.begin(jumper, target, { afterAction: true }).started) {
                    KDRemoveEntity(jumper, false, false, true);
                    continue;
                }
                for (const cell of leapLine(origin, target)) lanes.add(cell);
                members.push(jumper);
                return;
            }
        });
        return members;
    }
    function summon() {
        const saved = state(),
            name = SUPPORT[saved.supportIndex % 3];
        let members;
        if (name === "Jumper") members = summonCombo();
        else {
            const points = supportPositions();
            members = points && spawnFormation(Array(points.length).fill(name), points, "support");
        }
        if (!members?.length) return false;
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
    function warn(kind, turns = 2, reversed = false, startedAt = state().clock) {
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
            at: startedAt + turns,
            follow: saved.phase === "two" && !reversed && ["fan", "ring"].includes(kind),
        });
        // Skill announcements use the native enemy cast colour.
        KinkyDungeonSendTextMessage(6, TextGet("SpiderlingsBossSkill_" + kind), "#ff8844", turns + 1);
    }
    function schedule() {
        const enemy = resonanceSource();
        if (!enemy) return;
        const saved = state();
        if (saved.clock >= saved.nextPulse) {
            api.SilkDensity.refresh();
            saved.nextPulse = saved.clock + 6;
            KinkyDungeonSendEvent("spiderlingsBossResonance", { enemy });
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
                KinkyDungeonSendEvent("spiderlingsBossWarningResolved", {
                    kind: warning.kind,
                    cells: warning.cells,
                });
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
            const formation = spawnFormation(
                ["NestEntrance", "Spinner", "Spinner", "Spinner"],
                api.BossRoom.openNestAlcove(goal.corner),
                "nest-guard",
                { alcove: true },
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
            saved.nests = [0, 1, 2, 3].map((corner) => ({ corner, spawned: false, destroyed: false }));
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
    // The next footprint step toward melee reach of the target. She walks on webs like other
    // spiders, and builders may lay silk beneath her, so the rings do not bound her path. Her
    // footprint stays off the floor's edge row only: with rock behind it, no builder could reach
    // the edge-ring cell between her legs, and that ring could not close while she stood there.
    function bossStep(enemy, target) {
        if (!target) return undefined;
        const center = api.BossRoom.CENTER,
            limit = api.BossRoom.RADIUS - 2;
        const reach = (point) => distance(api.BossFootprint.nearest(point, target), target);
        if (reach(enemy) <= 2) return undefined;
        const directions = [...STEPS].sort(
            ([ax, ay], [bx, by]) =>
                Math.hypot(target.x - enemy.x - ax, target.y - enemy.y - ay) -
                Math.hypot(target.x - enemy.x - bx, target.y - enemy.y - by),
        );
        const start = { x: enemy.x, y: enemy.y },
            parents = new Map([[key(start), undefined]]),
            queue = [start];
        let best = start;
        for (let index = 0; index < queue.length; index++) {
            const node = queue[index];
            if (node !== start && reach(node) <= 2) {
                best = node;
                break;
            }
            if (reach(node) < reach(best)) best = node;
            for (const [dx, dy] of directions) {
                const next = { x: node.x + dx, y: node.y + dy };
                if (parents.has(key(next)) || distance(next, center) > limit) continue;
                if (!api.BossFootprint.canPlace(enemy, next.x, next.y)) continue;
                parents.set(key(next), node);
                queue.push(next);
            }
        }
        if (best === start) return undefined;
        let step = best;
        while (parents.get(key(step)) !== start) step = parents.get(key(step));
        return step;
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
                // A blocked turn keeps one ready step instead of banking a burst of moves.
                enemy.SpiderlingsBossMoveCredit = Math.min(2, (enemy.SpiderlingsBossMoveCredit || 0) + delta);
                enemy.SpiderlingsBossMeleeCredit = Math.min(3, (enemy.SpiderlingsBossMeleeCredit || 0) + delta);
                if (
                    distance(api.BossFootprint.nearest(enemy, target), target) <= 1 &&
                    saved.clock >= (saved.lastBodyAt || 0) + 4 &&
                    enemy.SpiderlingsBossMeleeCredit >= (saved.phase === "two" ? 2 : 3) &&
                    !saved.warnings.length
                ) {
                    // Native enemy actions precede tickAfter. Start this
                    // warning at the end of the paid turn that creates it.
                    warn("melee", 1, false, saved.clock + delta);
                    enemy.SpiderlingsBossMeleeCredit = 0;
                }
                const step = enemy.SpiderlingsBossMoveCredit >= 2 && bossStep(enemy, target);
                if (step) {
                    KDMoveEntity(enemy, step.x, step.y, true);
                    if (enemy.x === step.x && enemy.y === step.y) enemy.SpiderlingsBossMoveCredit -= 2;
                }
            }
            return hostileResult(enemy);
        }
        if (saved.phase === "victory") return hostileResult(enemy);
        if (api.PrisonEscort?.ownsActor(enemy)) return undefined;
        // A combo Jumper exists for its one leap; an interrupted or reloaded leap also ends it.
        if (enemy.SpiderlingsBossCombo) {
            if (!api.JumperDash.runtimeController.snapshot().some((entry) => entry.sourceId === enemy.id))
                KDRemoveEntity(enemy, false, false, true);
            return hostileResult(enemy);
        }
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
            const actionClock = saved.clock + delta;
            if (!support.fired && actionClock >= support.castAt) {
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
                    support.retireAt = actionClock + (spell === "SpiderlingsMageCollapse" ? 6 : 8);
                }
            }
            if (support.fired && actionClock >= support.retireAt) KDRemoveEntity(enemy, false, false, true);
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
    KDAddEvent(KDEventMapGeneric, "afterLoadGame", KEY, initialize);
    for (const trigger of [
        "hit",
        "missPlayer",
        "blockPlayer",
        "NPCHitNPC",
        "missEnemy",
        "blockEnemy",
        "spiderlingsJumperDashResolved",
    ])
        KDAddEvent(KDEventMapGeneric, trigger, KEY, (_event, data) => {
            const enemy = data.enemy;
            if (enemy?.Enemy.name === "Jumper" && fixed(enemy) && enemy.SpiderlingsBossFormation.kind === "support")
                KDRemoveEntity(enemy, false, false, true);
        });
    api.BossEncounter = Object.freeze({
        state,
        boss,
        resonanceSource,
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
