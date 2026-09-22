"use strict";

// One encounter boundary; equipment uses the existing native Webbing adapters.
(() => {
    const api = globalThis.Spiderlings;
    const ID = "SpiderlingsSpinnerLegbinder";
    const MODEL = ID + "Model";
    const CONFIG = Object.freeze({
        minSpinners: 2,
        maxSpinners: 8,
        weaveGoal: 100,
        weaveBase: 12.5,
        weaveExtra: 4,
        escapeBase: 75,
        escapeExtra: 25,
        pullAmount: 25,
        stamina: 1,
        stun: 6,
        wrapTurns: 5,
        hobble: 2,
        top: 1880,
        halfTop: 2540,
        lineColor: 0xffffff,
    });
    const EVENT = "SpiderlingsLegbinderEscape";
    const PROGRESS = "SpiderlingsLegbinderEscapeProgress";
    const armed = new WeakMap();
    const item = (itemId) =>
        typeof KinkyDungeonAllRestraintDynamic == "function"
            ? KinkyDungeonAllRestraintDynamic().find(
                  (e) => e.item.name === ID && (itemId === undefined || e.item.id === itemId),
              )?.item
            : undefined;
    const progress = (bag = item()) => Math.max(0, Math.min(1, Number(bag?.data?.wrapProgress) || 0));
    function event(map, trigger, type, handler) {
        if (typeof KDAddEvent === "function") KDAddEvent(map, trigger, type, handler);
        else {
            map[trigger] ||= {};
            map[trigger][type] = handler;
        }
    }
    function refresh() {
        if (typeof KinkyDungeonDressPlayer === "function") KinkyDungeonDressPlayer();
        if (typeof ForceRefreshModels === "function") ForceRefreshModels(KinkyDungeonPlayer);
    }
    function canEquip(entity) {
        const restraint = KinkyDungeonGetRestraintByName(ID);
        return (
            !item() &&
            !!restraint &&
            !KDGetBlockersToAddRestraint(restraint, KinkyDungeonPlayerEntity, false).length &&
            KDCanAddRestraint(
                restraint,
                false,
                "",
                false,
                KinkyDungeonGetRestraintItem("ItemLegs"),
                true,
                true,
                entity,
            ) === true
        );
    }
    function equip(wrapProgress = 1, entity) {
        if (!canEquip(entity)) return false;
        const result = KinkyDungeonAddRestraint(
            KinkyDungeonGetRestraintByName(ID),
            0,
            false,
            "",
            false,
            false,
            false,
            undefined,
            "Enemy",
            false,
            undefined,
            undefined,
            true,
            entity,
        );
        const applied = item();
        if (!(result > 0) || !applied) return false;
        applied.data ||= {};
        applied.data.wrapProgress = wrapProgress;
        refresh();
        return applied;
    }
    api.restraintCatalog.register({
        id: ID,
        module: "Legbinder",
        stage: "Legbinder",
        model: MODEL,
        restraint: {
            name: ID,
            inventory: true,
            unlimited: true,
            accessible: true,
            Asset: "Web",
            Model: MODEL,
            Color: "#ffffff",
            Group: "ItemLegs",
            hobble: CONFIG.hobble,
            power: 4,
            weight: 0,
            escapeChance: { Cut: 1, Remove: 1, Struggle: 1 },
            limitChance: { Cut: 0, Remove: 0, Struggle: 0 },
            affinity: {},
            helpChance: {},
            failSuffix: {},
            customEscapeSucc: "SpiderlingsWebbing",
            alwaysEscapable: ["Cut", "Remove", "Struggle"],
            enemyTags: {},
            playerTags: {},
            minLevel: 0,
            allFloors: true,
            shrine: ["Wrapping", "Latex", "SpiderlingsWebbingLegsLayer"],
            addTag: ["FeetLinked", "BlockKneel", "BlockHogtie"],
            LinkableBy: [],
            renderWhenLinked: [],
            events: [
                { inheritLinked: true, trigger: "beforeStruggleCalc", type: EVENT },
                { inheritLinked: true, trigger: "struggle", type: EVENT },
                { inheritLinked: true, trigger: "beforeSuccessRemove", type: api.Webbing.FINAL_ESCAPE_EVENT },
            ],
        },
        text: [
            "Silken Leg Bag",
            "Silk encloses your legs from soles to upper thighs. Your arms remain free.",
            "Demo: broad helical silk bands. Cut in four actions or peel/struggle free in six; half-woven silk takes half as many.",
        ],
    });
    if (typeof AddModel === "function")
        AddModel({
            Name: MODEL,
            Folder: "SpiderlingsSpinnerLegbinder",
            TopLevel: true,
            Restraint: true,
            Categories: ["Restraints", "Wrapping"],
            AddPose: ["FeetLinked", "Closed"],
            RemovePoses: ["Spread", "Kneel", "KneelClosed", "Hogtie"],
            Layers: ToLayerMap([
                {
                    Name: "Finished",
                    Sprite: "Finished",
                    Layer: "FurnitureFront",
                    Pri: 90,
                    Invariant: true,
                    NoColorize: true,
                    NoOverride: true,
                    HidePoses: ToMap(["SpiderlingsWebbingCocoonCover"]),
                },
            ]),
        });
    if (typeof KinkyDungeonRefreshRestraintsCache === "function") KinkyDungeonRefreshRestraintsCache();
    if (typeof KDEventMapInventory !== "undefined") {
        event(KDEventMapInventory, "beforeStruggleCalc", EVENT, (_e, target, data) => {
            armed.delete(target);
            if (
                target !== data?.restraint ||
                target.name !== ID ||
                data.query ||
                !["Cut", "Remove", "Struggle"].includes(data.struggleType) ||
                (data.struggleType === "Cut" && data.canCut === false && !data.hasAffinity) ||
                (data.struggleGroup && KDGroupBlocked(data.struggleGroup)) ||
                !KinkyDungeonHasStamina(-Number(data.cost || 0), true)
            )
                return;
            const half = (target.data?.wrapProgress ?? 1) < 1;
            const steps = data.struggleType === "Cut" ? (half ? 2 : 4) : half ? 3 : 6;
            const amount = 1 / steps;
            if (Number(target.data?.[PROGRESS] || 0) + amount >= 1 - 1e-8) {
                target.cutProgress = 1;
                data.escapeChance = 1;
                data.escapePenalty = -100;
            } else {
                data.escapeSpeed = 0;
                data.cutSpeed = 0;
                data.minSpeed = 1e-6;
                data.limitChance = 0;
                data.escapeChance = 0;
                data.escapePenalty = 100;
                data.failSuffix = "SpiderlingsWebbing";
                armed.set(target, { method: data.struggleType, amount });
            }
        });
        event(KDEventMapInventory, "struggle", EVENT, (_e, target, data) => {
            const action = armed.get(target);
            armed.delete(target);
            if (target !== data?.restraint || data.result !== "Fail" || action?.method !== data.struggleType) return;
            target.data ||= {};
            target.data[PROGRESS] = Number(target.data[PROGRESS] || 0) + action.amount;
        });
    }

    const texturesReady = api.SpinnerArt?.ready || Promise.resolve();
    texturesReady.then(refresh);
    const STATE = "SpiderlingsSpinnerCapture";
    const REWARD = "SpiderlingsSpinnerStunTurns";
    let turnState,
        pendingPull,
        automatic = false,
        driver,
        inputContext;
    let tween = { from: 0, to: 0, start: 0 },
        lastAnimationFrame = 0;
    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    function visualProgress() {
        const t = Math.min(1, Math.max(0, (now() - tween.start) / 500));
        return tween.from + (tween.to - tween.from) * (t * t * (3 - 2 * t));
    }
    function animate(to) {
        tween = { from: visualProgress(), to, start: now() };
    }
    let acted = new Set(),
        mapLines;
    const state = () => (typeof KDGameData !== "undefined" ? KDGameData[STATE] : undefined);
    const player = () => KinkyDungeonPlayerEntity;
    const entities = () => KDMapData.Entities || [];
    const source = (id) => entities().find((e) => e.id === id);
    function say(key) {
        if (typeof KinkyDungeonSendTextMessage === "function")
            KinkyDungeonSendTextMessage(9, TextGet(key), "#FFFFFF", 3);
    }
    const messages = {
        SpiderlingsSpinnerPull: "Pull free · 10 stamina · 1 turn",
        SpiderlingsSpinnerContest: "Spinners: {count} · weaving +{rate}/turn",
        SpiderlingsSpinnerWeave: "Binding: {value}/100",
        SpiderlingsSpinnerEscape: "Escape: {value}/{goal}",
        SpiderlingsSpinnerStart:
            "The connected traps hold your legs together. Fill your escape bar before the binding bar; joining Spinners increase both their speed and your escape target.",
        SpiderlingsSpinnerWin: "You pull the threads apart. All participating spinners are held for six turns.",
        SpiderlingsSpinnerInterrupt: "The weaving breaks off. You can act again; any deposited silk remains.",
        SpiderlingsSpinnerTired: "You need 10 stamina to pull. You can still wait or use a potion.",
        SpiderlingsSpinnerWrap: "The spinners begin weaving a leg bag. Five world turns; your arms remain free.",
        SpiderlingsSpinnerDone: "The leg bag is complete. You can attack, use items, move slowly, or remove it.",
        KinkyDungeonStatSpiderlingsSpinnerDemo: "Spinner field trial",
        KinkyDungeonStatDescSpiderlingsSpinnerDemo:
            "Enter a flat training ground. Spinners place traps and connect them across escape routes. Try the contest, five-turn capture and Jumper response.",
    };
    if (typeof addTextKey === "function") for (const [key, text] of Object.entries(messages)) addTextKey(key, text);
    if (typeof KinkyDungeonStatsPresets !== "undefined" && typeof KDPerkStart !== "undefined") {
        KinkyDungeonStatsPresets.SpiderlingsSpinnerDemo = {
            id: "SpiderlingsSpinnerDemo",
            category: "Start",
            cost: 0,
            startPriority: 1200,
            tags: ["start"],
        };
        KDPerkStart.SpiderlingsSpinnerDemo = () => {
            if (api.SpinnerField) {
                api.SpinnerField.enter();
                return;
            }
            KinkyDungeonInventoryAdd({
                name: ID,
                id: KinkyDungeonGetItemID(),
                type: LooseRestraint,
                quantity: 1,
                events: KinkyDungeonGetRestraintByName(ID).events,
            });
            KinkyDungeonInventoryAddWeapon("Scissors");
            KinkyDungeonChangeConsumable(KinkyDungeonConsumables.PotionStamina, 2);
            const p = KinkyDungeonPlayerEntity,
                points = [];
            for (let dy = -4; dy <= 4; dy++)
                for (let dx = -4; dx <= 4; dx++) {
                    const x = p.x + dx,
                        y = p.y + dy,
                        d = Math.hypot(dx, dy);
                    if (
                        d > 0 &&
                        d <= 4 &&
                        KinkyDungeonMovableTilesSmartEnemy.includes(KinkyDungeonMapGet(x, y)) &&
                        !KinkyDungeonEnemyAt(x, y) &&
                        KinkyDungeonCheckPath(x, y, p.x, p.y, false, true, 1, false)
                    )
                        points.push({ x, y, d });
                }
            const chosen = [
                ...points
                    .filter((p) => p.d <= 1.5)
                    .slice(0, 2)
                    .map((p) => ({ ...p, name: "Spinner" })),
                ...points
                    .filter((p) => p.d > 2)
                    .sort((a, b) => b.d - a.d)
                    .slice(0, 1)
                    .map((p) => ({ ...p, name: "Jumper" })),
            ];
            for (const p of chosen) {
                const e = DialogueCreateEnemy(p.x, p.y, p.name);
                if (e) {
                    e.aware = true;
                    e.vp = 1;
                    e.hostile = 100;
                }
            }
        };
    }
    function eligible(enemy) {
        if (
            !enemy ||
            enemy.Enemy?.name !== "Spinner" ||
            !(enemy.hp > 0) ||
            !KDHostile(enemy) ||
            enemy.Enemy.noAttack ||
            !enemy.Enemy.attack?.includes("Melee") ||
            [enemy.stun, enemy.freeze, enemy.disarm, enemy.channel, enemy.teleporting].some((n) => n > 0) ||
            KDHelpless(enemy) ||
            KinkyDungeonIsDisabled(enemy)
        )
            return false;
        const distance = Math.hypot(enemy.x - player().x, enemy.y - player().y);
        const range = enemy.Enemy.attackRange === 1 ? 1.5 : enemy.Enemy.attackRange;
        return distance <= range && KinkyDungeonCheckPath(enemy.x, enemy.y, player().x, player().y, false, false);
    }
    function clearLines() {
        if (mapLines && !mapLines.destroyed) {
            mapLines.parent?.removeChild(mapLines);
            mapLines.destroy();
        }
        mapLines = undefined;
        api.SpinnerArt?.clear();
    }
    function clearTemporary(reason, announce = true) {
        const s = state();
        delete KDGameData[STATE];
        pendingPull = undefined;
        turnState = undefined;
        acted = new Set();
        inputContext = undefined;
        if (driver) clearTimeout(driver);
        driver = undefined;
        clearLines();
        if (!s) return;
        refresh();
        if (announce)
            say(
                reason === "success"
                    ? "SpiderlingsSpinnerWin"
                    : reason === "complete"
                      ? "SpiderlingsSpinnerDone"
                      : "SpiderlingsSpinnerInterrupt",
            );
    }
    const escapeGoal = (count) =>
        count <= 0 ? 0 : count === 1 ? 50 : CONFIG.escapeBase + CONFIG.escapeExtra * (count - 2);
    const weaveRate = (count) =>
        count <= 0 ? 0 : count === 1 ? 6.25 : CONFIG.weaveBase + CONFIG.weaveExtra * (count - 2);
    const sourceIds = (capture = state()) => (Array.isArray(capture?.sourceIds) ? capture.sourceIds : []);
    function effectiveSources(capture = state()) {
        const seen = new Set(),
            result = [];
        for (const id of sourceIds(capture)) {
            const enemy = source(id);
            if (seen.has(id) || !eligible(enemy)) continue;
            seen.add(id);
            result.push(enemy);
            if (result.length === CONFIG.maxSpinners) break;
        }
        return result;
    }
    const completedBag = () => !!item() && progress() >= 1;

    function captureView() {
        const s = state();
        if (!s) return {};
        if (KinkyDungeonAllRestraintDynamic().some((e) => e.item.name === api.Webbing.COCOON_ID))
            return { reason: "interrupted" };
        if (s.itemId !== undefined && !item(s.itemId)) return { reason: "interrupted" };
        const ids = effectiveSources(s).map((enemy) => enemy.id);
        return { capture: { ...s, sourceIds: ids, ids, escapeGoal: escapeGoal(ids.length) } };
    }

    function rewardEscape(sources) {
        for (const enemy of sources) {
            enemy.stun = Math.max(enemy.stun || 0, CONFIG.stun);
            enemy[REWARD] = CONFIG.stun;
        }
        clearTemporary("success");
    }

    function auditSources() {
        const view = captureView();
        if (view.reason) {
            clearTemporary(view.reason);
            return false;
        }
        if (!view.capture) return false;
        const s = state();
        s.sourceIds = view.capture.sourceIds;
        if (s.sourceIds.length === 0) {
            if (s.phase === "contest") {
                s.escapeProgress = 0;
                rewardEscape([]);
            } else clearTemporary("sources-lost");
            return false;
        }
        if (s.phase === "contest") {
            if (s.escapeProgress >= view.capture.escapeGoal) {
                rewardEscape(effectiveSources(s));
                return false;
            }
        }
        return true;
    }

    function onSuccessfulPlayerHit(enemy) {
        if (auditSources()) return true;
        const composite = api.SpinnerNativeField?.containingComposite(player());
        if (
            !composite ||
            !api.SpinnerNativeField.captureGeometryReady(player()) ||
            !eligible(enemy) ||
            completedBag() ||
            KinkyDungeonAllRestraintDynamic().some((e) => e.item.name === api.Webbing.COCOON_ID) ||
            entities().filter(eligible).length < CONFIG.minSpinners
        )
            return false;
        KDGameData[STATE] = {
            version: 3,
            phase: "contest",
            target: { kind: "player", x: player().x, y: player().y },
            admittedCompositeId: composite.id,
            sourceIds: [enemy.id],
            weaveProgress: 0,
            escapeProgress: 0,
        };
        animate(0.08);
        api.JumperDash?.runtimeController.auditSources();
        say("SpiderlingsSpinnerStart");
        refresh();
        return true;
    }
    const hit = onSuccessfulPlayerHit;

    function joinSource(enemy) {
        const s = state();
        if (!s || s.phase !== "contest" || !eligible(enemy)) return false;
        if (s.sourceIds.includes(enemy.id) || s.sourceIds.length >= CONFIG.maxSpinners) return false;
        s.sourceIds.push(enemy.id);
        return true;
    }
    function recordSourceAction(enemy) {
        const s = state();
        if (!s || !s.sourceIds.includes(enemy?.id) || !eligible(enemy)) return false;
        acted.add(enemy.id);
        return true;
    }
    function pull() {
        if (!auditSources() || state().phase !== "contest") return "Blocked";
        if (!KinkyDungeonHasStamina(CONFIG.stamina, true)) {
            say("SpiderlingsSpinnerTired");
            return "NoStamina";
        }
        KDChangeStamina("struggle", "binding", "spiderlingsSpinnerPull", -CONFIG.stamina);
        KinkyDungeonLastAction = "Struggle";
        pendingPull = state();
        try {
            KinkyDungeonAdvanceTime(1);
        } finally {
            pendingPull = undefined;
        }
        return "Pull";
    }
    function schedule() {
        if (driver || state()?.phase !== "wrap" || typeof setTimeout !== "function") return;
        driver = setTimeout(() => {
            driver = undefined;
            if (!auditSources()) return;
            if (
                KinkyDungeonState === "Game" &&
                KinkyDungeonDrawState === "Game" &&
                !KDGameData.CurrentDialog &&
                !KinkyDungeonShowInventory
            ) {
                automatic = true;
                try {
                    KDSendInput("tick", { delta: 1 });
                } finally {
                    automatic = false;
                }
            }
            schedule();
        }, 650);
    }
    function wrapTurn(s) {
        const actingSourceId = s.sourceIds.find((id) => acted.has(id));
        if (actingSourceId === undefined) return;
        let bag = s.itemId === undefined ? item() : item(s.itemId);
        let deposited = false;
        if (!bag) {
            bag = equip(1 / CONFIG.wrapTurns, source(actingSourceId));
            if (!bag) {
                clearTemporary("equipment-failed");
                return;
            }
            s.itemId = bag.id;
            deposited = true;
        } else if (s.itemId === undefined) {
            s.itemId = bag.id;
        }
        bag.data ||= {};
        if (!deposited)
            bag.data.wrapProgress = Math.min(1, Math.round((progress(bag) + 1 / CONFIG.wrapTurns) * 1000) / 1000);
        animate(bag.data.wrapProgress);
        if (bag.data.wrapProgress >= 1) clearTemporary("complete");
        else refresh();
    }
    function finishTurn(delta) {
        for (const e of entities()) if (e[REWARD] > 0) e[REWARD] = Math.max(0, e[REWARD] - 1);
        if (!auditSources()) return;
        const s = state();
        if (s !== turnState) return; // The triggering hit does not spend the first contest turn.
        if (s.phase === "contest") {
            if (pendingPull === s) {
                s.escapeProgress += CONFIG.pullAmount;
                pendingPull = undefined;
            }
            const count = s.sourceIds.filter((id) => acted.has(id)).length;
            s.weaveProgress = Math.min(CONFIG.weaveGoal, s.weaveProgress + weaveRate(count) * delta);
            animate(Math.max(0.08, s.weaveProgress / CONFIG.weaveGoal));
            // A committed pull that fills the escape bar wins a simultaneous finish.
            if (s.escapeProgress >= escapeGoal(s.sourceIds.length)) {
                rewardEscape(effectiveSources(s));
            } else if (s.weaveProgress >= CONFIG.weaveGoal) {
                s.phase = "wrap";
                delete s.weaveProgress;
                delete s.escapeProgress;
                const bag = item();
                if (bag) s.itemId = bag.id;
                const deposited = progress(bag);
                tween = { from: deposited, to: deposited, start: now() };
                say("SpiderlingsSpinnerWrap");
                refresh();
                schedule();
            }
        } else if (s.phase === "wrap") wrapTurn(s, delta);
    }
    if (typeof KDEventMapGeneric !== "undefined") {
        event(KDEventMapGeneric, "afterDress", STATE, (_e, d) => {
            if (d?.Character && d.Character !== KinkyDungeonPlayer) return;
            if (!state() && !item()) return;
            const mc = KDCurrentModels.get(KinkyDungeonPlayer);
            if (mc) {
                mc.Poses.Closed = true;
                mc.Poses.FeetLinked = true;
                for (const pose of ["Spread", "Kneel", "KneelClosed", "Hogtie"]) delete mc.Poses[pose];
            }
        });
        event(KDEventMapGeneric, "tick", STATE, () => {
            auditSources();
            turnState = state();
            acted = new Set();
        });
        event(KDEventMapGeneric, "tickAfter", STATE, (_e, d) => {
            if (d?.delta > 0) finishTurn(d.delta);
        });
        event(KDEventMapGeneric, "beforeMove", STATE, () => {
            if (auditSources()) KinkyDungeonNoMoveFlag = true;
        });
        event(KDEventMapGeneric, "afterEnemyTick", STATE, () => {
            auditSources();
        });
        for (const trigger of ["postMapgen", "defeat", "passout", "postPrisonIntro", "afterNewGame"])
            event(KDEventMapGeneric, trigger, STATE, () => {
                clearTemporary(trigger, false);
                for (const enemy of entities()) delete enemy[REWARD];
            });
        event(KDEventMapGeneric, "afterLoadGame", STATE, () => {
            if (driver) clearTimeout(driver);
            driver = undefined;
            pendingPull = undefined;
            turnState = undefined;
            acted = new Set();
            inputContext = undefined;
            automatic = false;
            tween = { from: 0, to: 0, start: now() };
            lastAnimationFrame = 0;
            clearLines();
            delete KDGameData.SpiderlingsSpinnerRetries;
            if (state() && state().version !== 3) clearTemporary("legacy-save", false);
            if (auditSources()) {
                const s = state();
                const deposited = progress(s.itemId === undefined ? item() : item(s.itemId));
                if (s.phase === "wrap" && deposited >= 1) {
                    clearTemporary("complete", false);
                    refresh();
                    return;
                }
                tween = {
                    from: deposited,
                    to: deposited,
                    start: now(),
                };
                if (s.phase === "wrap") schedule();
            } else {
                const deposited = progress();
                tween = { from: deposited, to: deposited, start: now() };
            }
            refresh();
        });
        event(KDEventMapGeneric, "draw", STATE, (_e, d) => {
            const { capture: s } = captureView();
            const admitted = !!s;
            if (now() - lastAnimationFrame >= 50 && (admitted || item())) {
                lastAnimationFrame = now();
                const mc = KDCurrentModels.get(KinkyDungeonPlayer);
                if (mc)
                    for (const c of mc.Containers.values())
                        if (c.Mesh.parent && c.Mesh.visible && c.Container && !c.Container.destroyed) renderPreview(c);
            }
            if (!admitted) {
                if (mapLines) mapLines.visible = false;
                return;
            }
            if (!mapLines || mapLines.destroyed) {
                mapLines = new PIXI.Graphics();
                kdgameboard.addChild(mapLines);
            }
            mapLines.clear().lineStyle(2, CONFIG.lineColor, 1);
            mapLines.visible = true;
            const size = KinkyDungeonGridSizeDisplay;
            const boardPans = typeof StandalonePatched !== "undefined" && StandalonePatched;
            const point = (e) => [
                (e.x - d.CamX - (boardPans ? 0 : d.CamX_offset) + 0.5) * size,
                (e.y - d.CamY - (boardPans ? 0 : d.CamY_offset) + 0.5) * size,
            ];
            const p = point(player());
            for (const id of s.sourceIds) {
                const enemy = source(id);
                if (!enemy) continue;
                const xy = point(enemy);
                mapLines.moveTo(...xy).lineTo(...p);
            }
            if (s.phase === "contest") {
                DrawTextKD(
                    TextGet("SpiderlingsSpinnerContest")
                        .replace("{count}", s.sourceIds.length)
                        .replace("{rate}", weaveRate(s.sourceIds.length)),
                    1000,
                    725,
                    "#FFFFFF",
                    "#000000",
                    22,
                );
                for (const [key, value, goal, y, color] of [
                    ["SpiderlingsSpinnerWeave", s.weaveProgress, CONFIG.weaveGoal, 750, "#FFFFFF"],
                    ["SpiderlingsSpinnerEscape", s.escapeProgress, s.escapeGoal, 790, "#69E1CC"],
                ]) {
                    FillRectKD(kdcanvas, kdpixisprites, key + "Back", {
                        Left: 750,
                        Top: y,
                        Width: 500,
                        Height: 30,
                        Color: "#222222",
                        zIndex: 90,
                    });
                    FillRectKD(kdcanvas, kdpixisprites, key + "Fill", {
                        Left: 750,
                        Top: y,
                        Width: Math.max(1, 500 * Math.min(1, value / goal)),
                        Height: 30,
                        Color: color,
                        zIndex: 91,
                    });
                    DrawTextKD(
                        TextGet(key)
                            .replace("{value}", Math.round(value * 10) / 10)
                            .replace("{goal}", goal),
                        1000,
                        y + 15,
                        "#FFFFFF",
                        "#000000",
                        21,
                        undefined,
                        92,
                    );
                }
                DrawButtonKDEx(
                    STATE,
                    () => {
                        KDSendInput("spiderlingsSpinnerPull", {});
                        return true;
                    },
                    true,
                    750,
                    825,
                    500,
                    50,
                    TextGet("SpiderlingsSpinnerPull"),
                    "#FFFFFF",
                );
            }
        });
    }
    function handleEnemyTurn(enemy, target, delta) {
        if (enemy[REWARD] > 0) return { idle: true, defeat: false, defeatEnemy: enemy };
        if (auditSources() && state().sourceIds.includes(enemy.id)) {
            if (state().phase === "wrap" || state().phase === "contest") {
                // A legal adjacent weaving action is sufficient in a narrow corridor.
                // When space permits, use the native move budget for a step around the player.
                const ring = [
                    [-1, -1],
                    [0, -1],
                    [1, -1],
                    [1, 0],
                    [1, 1],
                    [0, 1],
                    [-1, 1],
                    [-1, 0],
                ];
                const index = ring.findIndex(([x, y]) => player().x + x === enemy.x && player().y + y === enemy.y);
                const next = ring[(index + 1) % ring.length];
                const x = player().x + next[0],
                    y = player().y + next[1];
                const dir = { x: x - enemy.x, y: y - enemy.y, delta: 1 };
                if (
                    !KinkyDungeonEnemyAt(x, y) &&
                    KinkyDungeonEnemyCanMove(enemy, dir, KinkyDungeonMovableTilesSmartEnemy, "", false, 0)
                )
                    KinkyDungeonEnemyTryMove(enemy, dir, delta, x, y, false);
            }
            recordSourceAction(enemy);
            return { idle: false, defeat: false, defeatEnemy: enemy };
        }
        if (state()?.phase === "contest" && joinSource(enemy))
            return { idle: false, defeat: false, defeatEnemy: enemy };
        if (holdsSpiderAttack(enemy, target)) {
            waitAround(enemy, delta);
            return { idle: false, defeat: false, defeatEnemy: enemy };
        }
        return undefined;
    }
    function holdsSpiderAttack(enemy, target) {
        return (
            !!state() &&
            !!enemy?.Enemy?.tags?.spiderlings &&
            KDHostile(enemy) &&
            (!target?.Enemy || target.player === true)
        );
    }
    function waitAround(enemy, delta) {
        enemy.attackPoints = 0;
        enemy.warningTiles = [];
        if (!(delta > 0) || enemy.Enemy.immobile || KinkyDungeonIsDisabled(enemy) || KDHelpless(enemy)) return;
        const spinner = enemy.Enemy.name === "Spinner",
            goal = spinner ? 1.4 : 2.5,
            p = player();
        const distance = (x, y) => Math.hypot(x - p.x, y - p.y),
            before = Math.abs(distance(enemy.x, enemy.y) - goal);
        const steps = [];
        for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
                if (!dx && !dy) continue;
                const x = enemy.x + dx,
                    y = enemy.y + dy,
                    dir = { x: dx, y: dy, delta: 1 },
                    d = distance(x, y);
                if (
                    d === 0 ||
                    (!spinner && d < 2) ||
                    KinkyDungeonEnemyAt(x, y) ||
                    !KinkyDungeonEnemyCanMove(enemy, dir, KinkyDungeonMovableTilesSmartEnemy, "", false, 0)
                )
                    continue;
                steps.push({ x, y, dir, score: Math.abs(d - goal) });
            }
        steps.sort((a, b) => a.score - b.score);
        if (steps[0] && steps[0].score < before) {
            const n = steps[0];
            KinkyDungeonEnemyTryMove(enemy, n.dir, delta, n.x, n.y, false);
        }
    }
    if (typeof KDInputTypes !== "undefined") {
        KDInputTypes.spiderlingsSpinnerPull = pull;
        const blocked = [
            "move",
            "movestairs",
            "tick",
            "struggle",
            "struggleCurse",
            "curseUnlock",
            "equip",
            "quickRestraint",
            "consumable",
            "tryCastSpell",
            "doattack",
            "dospecial",
            "docapture",
            "switchWeapon",
            "offhandswitch",
        ];
        for (const type of blocked)
            if (typeof KDInputTypes[type] === "function") {
                const native = KDInputTypes[type];
                KDInputTypes[type] = function (_data) {
                    if (auditSources() && state().phase === "wrap" && !automatic) return "Blocked";
                    return native.apply(this, arguments);
                };
            }
    }
    if (typeof KDProcessInput === "function") {
        const native = KDProcessInput;
        KDProcessInput = function (type, _data) {
            const previous = inputContext;
            inputContext = { genuine: type !== "tick" && !automatic, counted: false };
            try {
                return native.apply(this, arguments);
            } finally {
                inputContext = previous;
            }
        };
    }
    function reactionOpportunity() {
        if (automatic) return false;
        if (!state() && !item()) return true;
        if (!inputContext?.genuine || inputContext.counted) return false;
        inputContext.counted = true;
        return true;
    }
    function renderPreview(c) {
        if (!c) return;
        if (
            (!state() && !item()) ||
            KinkyDungeonAllRestraintDynamic().some((e) => e.item.name === api.Webbing.COCOON_ID)
        ) {
            api.SpinnerArt?.clear();
            return;
        }
        const s = state();
        const saved = progress(s?.itemId === undefined ? item() : item(s.itemId));
        const amount = s?.phase === "wrap" && tween.to === saved ? visualProgress() : saved;
        api.SpinnerArt?.render(c, {
            amount,
            active: !!s,
            contest: s?.phase === "contest",
            pink: api.getSetting?.("spiderlingsPinkWebbing") === true,
            scale: c.Zoom * MODEL_SCALE,
        });
    }
    if (typeof RenderModelContainer === "function") {
        const native = RenderModelContainer;
        RenderModelContainer = function (mc, character, cid) {
            if (character === KinkyDungeonPlayer) renderPreview(mc.Containers.get(cid));
            return native.apply(this, arguments);
        };
    }
    if (typeof ModelDrawLayer === "function") {
        const native = ModelDrawLayer;
        ModelDrawLayer = function (mc, model) {
            if (model.Name === MODEL && mc === KDCurrentModels.get(KinkyDungeonPlayer)) return false; // Dedicated PNG overlays supply every stage.
            return native.apply(this, arguments);
        };
    }
    api.SpinnerCapture = {
        ID,
        MODEL,
        CONFIG,
        item,
        equip,
        canEquip,
        texturesReady,
        hit,
        onSuccessfulPlayerHit,
        state,
        escapeGoal,
        weaveRate,
        joinSource,
        recordSourceAction,
        auditSources,
        settleTurn: finishTurn,
        pullFree: pull,
        handleEnemyTurn,
        holdsSpiderAttack,
        phase: () => state()?.phase,
        isControllingPlayer: () => ["contest", "wrap"].includes(state()?.phase),
        isAutomaticTurn: () => automatic,
        reactionOpportunity,
        visualProgress,
        clearTemporary,
        cancel: () => clearTemporary("interrupted"),
    };
})();
