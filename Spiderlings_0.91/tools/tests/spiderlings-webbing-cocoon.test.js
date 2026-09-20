"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const modRoot = path.join(__dirname, "..", "..");
const families = [
    "Arm",
    "MittenLeft",
    "MittenRight",
    "Belly",
    "Legs",
    "Ankles",
    "Foot",
    "Blindfold",
    "Stuffing",
    "Gag",
];
const lv2Families = ["Arm", "Belly", "Legs", "Ankles", "Foot"];
const lv3Families = ["Arm", "Belly", "Legs", "Ankles", "Foot", "Blindfold", "Gag", "Hood"];
const groups = {
    Arm: "ItemArms",
    MittenLeft: "ItemHands",
    MittenRight: "ItemHands",
    Belly: "ItemTorso",
    Legs: "ItemLegs",
    Ankles: "ItemFeet",
    Foot: "ItemBoots",
    Blindfold: "ItemHead",
    Stuffing: "ItemMouth",
    Gag: "ItemMouth",
    Hood: "ItemHead",
};
const cocoonId = "SpiderlingsWebbingCocoon";
const cocoonModelId = "SpiderlingsWebbingCocoonModel";
const cocoonEscapeEvent = "SpiderlingsCocoonEscape";
const runtimeAsset = "Models/SpiderlingsWebbingCocoon/Cocoon.png";
const kd55EscapeCosts = { Cut: -0.2, Struggle: -3, Remove: -0.5 };

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function id(stage, family) {
    return `SpiderlingsWebbingLv${stage}${family}`;
}

function owned(stage, family, extra = {}) {
    return { name: id(stage, family), group: groups[family], data: {}, ...extra };
}

function slow(stacks) {
    return { stacks, inactiveTurns: 0, lastTriggerTurn: stacks ? 1 : null, lastTrailTurn: null };
}

function snapshot(items, stacks = 0) {
    const grouped = {};
    for (const entry of items) {
        grouped[entry.group] = grouped[entry.group] || [];
        grouped[entry.group].push(entry);
    }
    return { items, groups: grouped, webSpray: slow(stacks) };
}

function loadRuntime(options = {}) {
    const equipment = new Map();
    const loose = new Map();
    const addCalls = [];
    const staminaChecks = [];
    const buffs = {};
    const models = [];
    const text = {};
    let addResult = options.addResult == null ? 1 : options.addResult;
    let canAdd = options.canAdd || (() => true);
    let hasStamina = options.hasStamina == null ? true : options.hasStamina;
    const player = { player: true, id: -1 };
    const context = {
        console,
        globalThis: null,
        window: null,
        KinkyDungeonEnemies: [],
        KinkyDungeonRestraints: [],
        KinkyDungeonSpellListEnemies: [],
        KDEventMapGeneric: {},
        KDEventMapInventory: {},
        KDEventMapSpell: {},
        KDPlayerEffects: { TrapBindings: () => ({ effect: true }) },
        KDModConfigs: {},
        KDModSettings: {},
        KinkyDungeonFlags: new Map(),
        KinkyDungeonPlayer: player,
        KinkyDungeonPlayerEntity: player,
        KinkyDungeonPlayerBuffs: buffs,
        KinkyDungeonNoMoveFlag: false,
        KDGameData: { PrisonerState: "" },
        KDMapData: { Entities: [] },
        KinkyDungeonLastAction: "Wait",
        KDOverrideIgnore: (enemy) => !!enemy.nativeOverride,
        KDHostile: (enemy) => !enemy.allied,
        KDGetFaction: (enemy) => (enemy.allied || enemy.player ? "Player" : "Enemy"),
        KinkyDungeonAggressive: (enemy) => !enemy.ceasefire,
        KDAIType: { hunt: { beforemove: () => false }, wander: { beforemove: () => false } },
        KDIsImmobile: (enemy) => !!enemy.immobile,
        KDEnemyHasFlag: () => false,
        KinkyDungeonEnemyCanMove: () => true,
        KDCurrentModels: new Map([[player, { Poses: { Closed: true, Wristtie: true } }]]),
        KDTapeLink: ["Wrapping"],
        KDTapeRender: ["Wrapping"],
        KinkyDungeonRootDirectory: "Game/",
        KinkyDungeonPlaySound() {},
        KDBindable: "Bindable",
        KDDevices: "Devices",
        KDCorsetLink: "Corsets",
        KDHarnessLink: "Harnesses",
        KDElbowBind: "ElbowBind",
        KDWrappable: "Wrappable",
        KDRandom: options.random || (() => 0),
        KDMapInit(values) {
            return Object.fromEntries((values || []).map((value) => [value, true]));
        },
        ToMap(values) {
            return Object.fromEntries((values || []).map((value) => [value, true]));
        },
        ToLayerMap(values) {
            return Object.fromEntries((values || []).map((value) => [value.Name, value]));
        },
        AddModel(model) {
            const index = models.findIndex((entry) => entry.Name === model.Name);
            if (index >= 0) models.splice(index, 1, model);
            else models.push(model);
        },
        KDAddEvent(map, trigger, type, handler) {
            map[trigger] = map[trigger] || {};
            map[trigger][type] = handler;
        },
        KinkyDungeonAddRestraintText(name, display, description, flavor) {
            text[`Restraint${name}`] = display;
            text[`Restraint${name}Desc`] = description;
            text[`Restraint${name}Desc2`] = flavor;
        },
        addTextKey(key, value) {
            text[key] = value;
        },
        TextGet(key) {
            return text[key] || key;
        },
        KinkyDungeonRefreshRestraintsCache() {},
        KinkyDungeonRefreshEnemiesCache() {},
        KinkyDungeonGetRestraintByName(name) {
            return context.KinkyDungeonRestraints.find((restraint) => restraint.name === name);
        },
        KinkyDungeonGetRestraintItem(group) {
            return equipment.get(group);
        },
        KinkyDungeonAllRestraintDynamic() {
            const entries = [];
            for (const root of equipment.values()) {
                const seen = new Set();
                let item = root;
                while (item && !seen.has(item)) {
                    seen.add(item);
                    entries.push({ item });
                    item = item.dynamicLink;
                }
            }
            return entries;
        },
        KinkyDungeonReplaceRestraintRoot(group, previous, next) {
            if (equipment.get(group) !== previous) return false;
            equipment.set(group, next);
            return true;
        },
        KinkyDungeonInventoryGetLoose(name) {
            return loose.get(name);
        },
        KinkyDungeonInventoryRemove(item) {
            loose.delete(item.name);
        },
        KDCanAddRestraint(restraint) {
            return canAdd(restraint);
        },
        KDGetBlockersToAddRestraint() {
            return [];
        },
        KinkyDungeonAddRestraint(...args) {
            addCalls.push(args);
            const [restraint, tightness, , lock] = args;
            const result = typeof addResult === "function" ? addResult(restraint) : addResult;
            if (!(Number(result) > 0)) return 0;
            const item = {
                name: restraint.name,
                group: restraint.Group,
                restraint,
                tightness,
                lock,
                data: {},
                dynamicLink: equipment.get(restraint.Group),
            };
            equipment.set(restraint.Group, item);
            return 1;
        },
        KinkyDungeonAddRestraintIfWeaker(...args) {
            return context.KinkyDungeonAddRestraint(...args);
        },
        KinkyDungeonRemoveRestraintSpecific(item, keep, _add, _noEvent, _shrine, _unlink, _remover, forceRemove) {
            if (!item) return false;
            const group = item.group || (item.restraint && item.restraint.Group);
            const root = equipment.get(group);
            if (root === item) {
                if (item.dynamicLink) equipment.set(group, item.dynamicLink);
                else equipment.delete(group);
            } else {
                let parent = root;
                while (parent && parent.dynamicLink !== item) parent = parent.dynamicLink;
                if (!parent) return false;
                parent.dynamicLink = item.dynamicLink;
            }
            if (keep && !forceRemove) loose.set(item.name, { name: item.name, type: "LooseRestraint", quantity: 1 });
            return [item];
        },
        KinkyDungeonApplyBuffToEntity(_target, buff) {
            buffs[buff.id] = { ...buff };
        },
        KinkyDungeonExpireBuff(_target, buffId) {
            delete buffs[buffId];
        },
        KinkyDungeonCalculateSlowLevel() {},
        KinkyDungeonUpdateRestraints() {},
        KinkyDungeonUpdateStruggleGroups() {},
        KinkyDungeonHasStamina(...args) {
            staminaChecks.push(args);
            return typeof hasStamina === "function" ? hasStamina(...args) : hasStamina;
        },
        KDGroupBlocked: options.groupBlocked || (() => false),
        KDUpdateLinkCaches() {},
        queueMicrotask(callback) {
            callback();
        },
        ...options.globals,
    };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    for (const file of [
        "SpiderlingsCore.js",
        "SpiderlingsEncounters.js",
        "SpiderlingsWebCaster.js",
        "Spiderlings.js",
        "SpiderlingsWebbingModels.js",
        "SpiderlingsCombat.js",
        "SpiderlingsWebbingData.js",
        "SpiderlingsWebbingRules.js",
        "SpiderlingsWebbing.js",
    ]) {
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });
    }

    function seedItem(name, group, extra = {}) {
        const restraint = context.KinkyDungeonGetRestraintByName(name);
        const item = {
            name,
            group,
            restraint,
            data: {},
            dynamicLink: equipment.get(group),
            ...extra,
        };
        equipment.set(group, item);
        return item;
    }

    function seedPhysical(stages = [1, 2, 3]) {
        for (const stage of stages)
            for (const family of stage === 3 ? lv3Families : stage === 2 ? lv2Families : families)
                seedItem(id(stage, family), groups[family]);
    }

    function event(trigger, data = {}) {
        for (const handler of Object.values(context.KDEventMapGeneric[trigger] || {})) handler(trigger, data);
    }

    function inventoryEvent(trigger, item, data = {}) {
        const restraint = item.restraint || context.KinkyDungeonGetRestraintByName(item.name) || {};
        const eventData = { ...data, item };
        for (const definition of restraint.events || []) {
            const handler =
                context.KDEventMapInventory[trigger] && context.KDEventMapInventory[trigger][definition.type];
            if (definition.trigger === trigger && handler) handler(definition, item, eventData);
        }
        return eventData;
    }

    function nativeEscapeCocoon(method) {
        const item = equipment.get("ItemDevices");
        if (!item || item.name !== cocoonId) return false;
        const data = inventoryEvent("beforeStruggleCalc", item, {
            restraint: item,
            query: false,
            struggleType: method,
            cost: kd55EscapeCosts[method],
            minSpeed: 0.4,
            escapeChance: item.restraint.escapeChance[method],
            escapePenalty: 0,
            limitChance: 0,
        });
        const effectiveChance = Math.max(0, Number(data.escapeChance || 0) - Number(data.escapePenalty || 0));
        const cutProgress = Number(item.cutProgress || 0);
        const nativeCompletes = effectiveChance > 0 && cutProgress >= 1 - effectiveChance / 4;
        if (!nativeCompletes && data.escapeSpeed === 0) {
            inventoryEvent("struggle", item, { restraint: item, struggleType: method, result: "Fail" });
            return false;
        }
        if (!nativeCompletes) return false;
        const removal = inventoryEvent("beforeSuccessRemove", item, {
            restraint: item,
            struggleType: method,
            destroyChance: method === "Cut" ? 1 : 0,
        });
        context.KinkyDungeonRemoveRestraintSpecific(
            item,
            removal.destroyChance < 1,
            false,
            false,
            false,
            false,
            context.KinkyDungeonPlayerEntity,
            false,
        );
        return true;
    }

    function manualEquipCocoon() {
        const restraint = context.KinkyDungeonGetRestraintByName(cocoonId);
        if (!context.KDCanAddRestraint(restraint, false, "", false)) return false;
        const added = context.KinkyDungeonAddRestraint(restraint, 0, true, "");
        if (!(Number(added) > 0)) return false;
        const item = equipment.get("ItemDevices");
        inventoryEvent("postApply", item);
        return true;
    }

    return {
        context,
        equipment,
        loose,
        addCalls,
        staminaChecks,
        buffs,
        models,
        text,
        seedItem,
        seedPhysical,
        event,
        inventoryEvent,
        manualEquipCocoon,
        nativeEscapeCocoon,
        setAddResult(value) {
            addResult = value;
        },
        setCanAdd(value) {
            canAdd = value;
        },
        setHasStamina(value) {
            hasStamina = value;
        },
    };
}

test("a passive Cocoon player is quiet at both turn boundaries, independently of the dispersal delay", () => {
    const r = loadRuntime(),
        c = r.context;
    const quiet = () => c.Spiderlings.Webbing.isCocoonPassive();
    assert.equal(quiet(), false);
    r.manualEquipCocoon();
    assert.equal(quiet(), true, "the first explicit Wait can start garrison peace");
    r.event("tick", { delta: 1 });
    c.KinkyDungeonLastAction = "";
    assert.equal(quiet(), true, "native tickAfter has cleared LastAction");
    for (const action of ["Attack", "Struggle", "Move", "Spell"]) {
        c.KinkyDungeonLastAction = action;
        assert.equal(quiet(), false, action);
        r.event("tick", { delta: 1 });
        c.KinkyDungeonLastAction = "";
        assert.equal(quiet(), false, action + " remains active at turn end");
        c.KinkyDungeonLastAction = "Wait";
        r.event("tick", { delta: 1 });
    }
    r.event("beforeMove", { x: 1, y: 0 });
    assert.equal(quiet(), false, "even blocked anchored movement is resistance");
    r.event("tick", { delta: 1 });
    r.event("tick", { delta: 1 });
    const cocoon = r.equipment.get("ItemDevices");
    cocoon.data.SpiderlingsCocoonOuterWebs = { reinforcementPending: true, anchored: false };
    assert.equal(quiet(), false, "pending reinforcement remains active");
    cocoon.data.SpiderlingsCocoonOuterWebs.anchored = true;
    assert.equal(quiet(), true);
    r.equipment.delete("ItemDevices");
    assert.equal(quiet(), false, "removing the Cocoon restores the player threat");
});

test("Cocoon vigil keeps hostile spiders attentive until exactly 25 idle turns and survives reload", () => {
    const runtime = loadRuntime();
    runtime.seedPhysical();
    runtime.manualEquipCocoon();
    const player = runtime.context.KinkyDungeonPlayerEntity;
    for (const name of ["Spinner", "Jumper", "WebCaster", "Tunneler"]) {
        assert.equal(runtime.context.KDOverrideIgnore({ Enemy: { name }, hp: 1 }, player), true, name);
    }
    for (let n = 0; n < 24; n++) runtime.event("tick", { delta: 1 });
    const spider = { Enemy: { name: "Spinner" }, hp: 1, x: 1, y: 0 };
    assert.equal(runtime.context.KDOverrideIgnore(spider, player), true);
    runtime.event("tick", { delta: 0 });
    assert.equal(runtime.context.KDMapData.SpiderlingsCocoonVigil.idleTurns, 24);
    const loaded = loadRuntime();
    loaded.manualEquipCocoon();
    loaded.context.KDMapData = plain(runtime.context.KDMapData);
    loaded.event("tick", { delta: 1 });
    assert.equal(loaded.context.Spiderlings.Webbing.isCocoonDispersing(spider, player), true);
    assert.equal(loaded.context.KDOverrideIgnore(spider, player), false);
    assert.equal(loaded.context.KDOverrideIgnore({ ...spider, nativeOverride: true }, player), true);
});

test("struggle, attack, spell and anchored movement attempts restart the full vigil interval", () => {
    for (const action of ["Struggle", "Attack", "Spell", "Move", "blocked-move"]) {
        const runtime = loadRuntime();
        runtime.manualEquipCocoon();
        runtime.equipment.get("ItemDevices").data.SpiderlingsCocoonOuterWebs = { anchored: true };
        runtime.event("tick", { delta: 25 });
        if (action === "blocked-move") {
            runtime.event("beforeMove", { x: 1, y: 0 });
            assert.equal(runtime.context.KinkyDungeonNoMoveFlag, true);
        } else runtime.context.KinkyDungeonLastAction = action;
        runtime.event("tick", { delta: 1 });
        assert.equal(runtime.context.KDMapData.SpiderlingsCocoonVigil.idleTurns, 0, action);
        runtime.context.KinkyDungeonLastAction = "";
        runtime.event("tick", { delta: 3 });
        assert.equal(runtime.context.KDMapData.SpiderlingsCocoonVigil.idleTurns, 3, "delayed turns count once");
    }
});

test("vigil stays scoped to hostile spiders and clears on removal, re-equipment and transitions", () => {
    const runtime = loadRuntime();
    const player = runtime.context.KinkyDungeonPlayerEntity;
    const spider = { Enemy: { name: "Spinner" }, hp: 1 };
    assert.equal(runtime.context.KDOverrideIgnore(spider, player), false);
    runtime.manualEquipCocoon();
    for (const enemy of [
        { ...spider, allied: true },
        { ...spider, ceasefire: true },
        { ...spider, hp: 0 },
        { ...spider, Enemy: { name: "Bandit" } },
    ]) {
        assert.equal(runtime.context.KDOverrideIgnore(enemy, player), false);
    }
    assert.equal(runtime.context.KDOverrideIgnore(spider, {}), false);
    runtime.event("tick", { delta: 25 });
    runtime.equipment.delete("ItemDevices");
    assert.equal(runtime.context.Spiderlings.Webbing.isCocoonDispersing(spider, player), false);
    assert.equal(runtime.context.KDMapData.SpiderlingsCocoonVigil, undefined);
    runtime.manualEquipCocoon();
    runtime.event("tick", { delta: 25 });
    runtime.manualEquipCocoon();
    assert.equal(runtime.context.KDOverrideIgnore(spider, player), true);
    for (const trigger of ["postMapgen", "defeat", "passout", "postPrisonIntro"]) {
        runtime.event("tick", { delta: 25 });
        runtime.event(trigger);
        assert.equal(runtime.context.KDMapData.SpiderlingsCocoonVigil, undefined);
    }
});

test("dispersal cancels attacks and sets an outward native goal without moving the entity", () => {
    const runtime = loadRuntime();
    runtime.manualEquipCocoon();
    const player = runtime.context.KinkyDungeonPlayerEntity;
    Object.assign(player, { x: 0, y: 0 });
    const spider = { Enemy: { name: "Spinner" }, hp: 1, x: 1, y: 0, attackPoints: 2, warningTiles: [{}] };
    runtime.event("tick", { delta: 25 });
    const data = { ignore: false, wantsToAttack: true, holdStillWhenNear: true };
    assert.equal(runtime.context.KDAIType.hunt.beforemove(spider, player, data), false);
    assert.equal(data.ignore, true);
    assert.equal(data.wantsToAttack, false);
    assert.equal(spider.attackPoints, 0);
    assert.equal(spider.warningTiles.length, 0);
    assert.equal(spider.x, 1);
    assert.ok(Math.hypot(spider.gx, spider.gy) > 1);
    runtime.context.KinkyDungeonEnemyCanMove = () => false;
    assert.equal(runtime.context.KDAIType.hunt.beforemove(spider, player, data), true);
});

test("counted escape feedback is selected only for an effective unfinished action", () => {
    for (const name of [id(2, "Arm"), id(3, "Arm"), cocoonId]) {
        for (const method of ["Cut", "Remove", "Struggle"]) {
            for (const condition of ["effective", "query", "no-stamina", "no-tool", "group-blocked"]) {
                const runtime = loadRuntime({
                    hasStamina: condition !== "no-stamina",
                    groupBlocked: () => condition === "group-blocked",
                });
                const group = name === cocoonId ? "ItemDevices" : "ItemArms";
                const item = runtime.seedItem(name, group);
                const data = runtime.inventoryEvent("beforeStruggleCalc", item, {
                    restraint: item,
                    struggleGroup: group,
                    struggleType: method,
                    cost: kd55EscapeCosts[method],
                    query: condition === "query",
                    canCut: condition !== "no-tool",
                    failSuffix: "Native",
                });
                const counts =
                    condition === "effective" ||
                    (condition === "no-tool" && method !== "Cut") ||
                    (condition === "group-blocked" && name === cocoonId);
                const suffix = name === cocoonId ? "SpiderlingsCocoon" : "SpiderlingsWebbing";
                assert.equal(data.failSuffix, counts ? suffix : "Native", `${name} ${method} ${condition}`);
                assert.equal(item.data.SpiderlingsEscapeActions, undefined, "message selection cannot spend an action");
                if (counts)
                    for (const aroused of ["", "Aroused"]) {
                        const text = runtime.text["KinkyDungeonStruggle" + method + "Fail" + suffix + aroused];
                        assert.equal((text.match(/TargetRestraint/g) || []).length, 1);
                    }
            }
        }
    }
});

test("native assistance text redirects only inside the armed real Webbing attempt and clears on exceptions", () => {
    let runtime;
    let shouldThrow = false;
    runtime = loadRuntime({
        globals: {
            KinkyDungeonStruggle(group, method, index, query) {
                const item = runtime.equipment.get(group);
                runtime.inventoryEvent("beforeStruggleCalc", item, {
                    restraint: item,
                    struggleGroup: group,
                    struggleType: method,
                    query,
                    cost: -3,
                });
                if (shouldThrow) throw new Error("native error");
                return ["2", "3"].map((suffix) =>
                    runtime.context.TextGet("KinkyDungeonStruggle" + method + "Fail" + suffix),
                );
            },
        },
    });
    const item = runtime.seedItem(id(2, "Arm"), "ItemArms");
    const nativeKey = "KinkyDungeonStruggleStruggleFail2";
    assert.equal(runtime.context.TextGet(nativeKey), nativeKey);
    const result = runtime.context.KinkyDungeonStruggle("ItemArms", "Struggle");
    const processText = runtime.text.KinkyDungeonStruggleStruggleFailSpiderlingsWebbing;
    assert.ok(processText);
    assert.deepEqual(result, [processText, processText]);
    assert.equal(runtime.context.TextGet(nativeKey), nativeKey, "no lookup override leaks past the call");
    assert.equal(runtime.context.KinkyDungeonStruggle("ItemArms", "Struggle", 0, true)[0], nativeKey);
    runtime.setHasStamina(false);
    assert.equal(runtime.context.KinkyDungeonStruggle("ItemArms", "Struggle")[0], nativeKey);
    runtime.setHasStamina(true);
    shouldThrow = true;
    assert.throws(() => runtime.context.KinkyDungeonStruggle("ItemArms", "Struggle"), /native error/);
    assert.equal(runtime.context.TextGet(nativeKey), nativeKey);
    shouldThrow = false;
    item.name = "ThirdPartyArm";
    assert.equal(runtime.context.KinkyDungeonStruggle("ItemArms", "Struggle")[0], nativeKey);
});

test("all 24 Webbing restraints select native success prose for every removal method", () => {
    const runtime = loadRuntime();
    const definitions = runtime.context.KinkyDungeonRestraints.filter((r) => r.name.startsWith("SpiderlingsWebbing"));
    assert.equal(definitions.length, 24);
    for (const definition of definitions) {
        const suffix = definition.name === cocoonId ? "SpiderlingsCocoon" : "SpiderlingsWebbing";
        assert.equal(definition.customEscapeSucc, suffix);
        for (const method of ["Cut", "Remove", "Struggle"]) {
            const text = runtime.text["KinkyDungeonStruggle" + method + "Success" + definition.customEscapeSucc];
            assert.equal((text.match(/TargetRestraint/g) || []).length, 1);
        }
    }
});

function resolve(runtime, items, stacks, action) {
    return runtime.context.Spiderlings.Webbing.resolveWebbingAction({
        snapshot: snapshot(items, stacks),
        action,
    });
}

const outerStateKey = "SpiderlingsCocoonOuterWebs";
const outerPose = "SpiderlingsCocoonAnchored";
function directHit(runtime, name = "WebCaster") {
    return runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        runtime.context.KinkyDungeonPlayerEntity,
        "tickle",
        { profile: name },
        undefined,
        "Enemy",
        undefined,
        { Enemy: { name }, id: 71 },
    );
}

test("escape and attack intents share a window and only WebCaster direct hits anchor", () => {
    const runtime = loadRuntime();
    runtime.manualEquipCocoon();
    const item = runtime.equipment.get("ItemDevices");
    runtime.nativeEscapeCocoon("Remove");
    runtime.event("tickAfter", { delta: 4 });
    runtime.context.KinkyDungeonLastAction = "Attack";
    runtime.event("tick", { delta: 0 });
    assert.equal(item.data[outerStateKey].attemptAges.length, 1);
    runtime.event("tick", { delta: 1 });
    runtime.event("tickAfter", { delta: 1 });
    runtime.event("tick", { delta: 1 });
    assert.equal(item.data[outerStateKey].reinforcementPending, true);
    directHit(runtime, "Spinner");
    directHit(runtime, "Jumper");
    assert.equal(item.data[outerStateKey].anchored, false);
    assert.equal(runtime.context.Spiderlings.Webbing.needsCocoonReinforcement(), true);
    runtime.context.KinkyDungeonLastAction = "Wait";
    runtime.event("tick", { delta: 25 });
    const caster = { Enemy: { name: "WebCaster" }, hp: 1 };
    assert.equal(
        runtime.context.Spiderlings.Webbing.isCocoonDispersing(caster, runtime.context.KinkyDungeonPlayerEntity),
        false,
    );
    assert.equal(runtime.context.KDOverrideIgnore(caster, runtime.context.KinkyDungeonPlayerEntity), true);
    directHit(runtime);
    assert.equal(item.data[outerStateKey].anchored, true);
    assert.equal(runtime.context.Spiderlings.Webbing.needsCocoonReinforcement(), false);
});

test("offensive spell intents count once per action, while buffs, healing and waiting do not", () => {
    const runtime = loadRuntime();
    runtime.manualEquipCocoon();
    const item = runtime.equipment.get("ItemDevices");
    for (const spell of [{ type: "buff", damage: "electric" }, { damage: "heal" }, { damage: "inert" }]) {
        runtime.event("afterPlayerCast", { spell });
        runtime.event("tick", { delta: 1 });
    }
    assert.equal(item.data[outerStateKey], undefined);
    for (let n = 0; n < 3; n++) {
        runtime.event("afterPlayerCast", { spell: { damage: "electric", type: "bolt" } });
        runtime.event("afterPlayerCast", { spell: { damage: "electric", type: "bolt" } });
        runtime.event("tick", { delta: 1 });
        runtime.event("tickAfter", { delta: 1 });
        assert.equal(item.data[outerStateKey].attemptAges.length, n + 1);
    }
    assert.equal(item.data[outerStateKey].reinforcementPending, true);
});

test("three recent effective struggles require a later direct hit to show outer webs and block movement", () => {
    const runtime = loadRuntime();
    runtime.manualEquipCocoon();
    const item = runtime.equipment.get("ItemDevices");
    for (let n = 0; n < 2; n++) {
        runtime.nativeEscapeCocoon("Struggle");
        runtime.event("tickAfter", { delta: 1 });
    }
    directHit(runtime);
    assert.equal(item.data[outerStateKey].anchored, false);
    runtime.nativeEscapeCocoon("Struggle");
    runtime.event("beforeMove");
    assert.equal(runtime.context.KinkyDungeonNoMoveFlag, false, "frequency alone never creates webs");
    directHit(runtime);
    assert.equal(item.data[outerStateKey].anchored, true);
    runtime.event("beforeMove");
    assert.equal(runtime.context.KinkyDungeonNoMoveFlag, true);
    const poses = runtime.context.KDCurrentModels.get(runtime.context.KinkyDungeonPlayer).Poses;
    assert.equal(poses[outerPose], true);
    delete poses[outerPose];
    runtime.event("afterDress", { Character: runtime.context.KinkyDungeonPlayer });
    assert.equal(poses[outerPose], true, "redress restores the pose from persistent item data");
    const saved = plain(item.data);
    const loaded = loadRuntime();
    loaded.seedItem(cocoonId, "ItemDevices", { data: saved });
    loaded.event("afterDress", { Character: loaded.context.KinkyDungeonPlayer });
    loaded.event("beforeMove");
    assert.equal(loaded.context.KinkyDungeonNoMoveFlag, true, "save reload retains anchoring");
    const otherCharacter = {};
    loaded.context.KDCurrentModels.set(otherCharacter, { Poses: {} });
    loaded.event("afterDress", { Character: otherCharacter });
    assert.deepEqual(loaded.context.KDCurrentModels.get(otherCharacter).Poses, {});
    item.cutProgress = 1;
    assert.equal(runtime.nativeEscapeCocoon("Cut"), true);
    runtime.event("postRemoval", { item });
    runtime.context.KinkyDungeonNoMoveFlag = false;
    runtime.event("beforeMove");
    assert.equal(runtime.context.KinkyDungeonNoMoveFlag, false);
    assert.equal(poses[outerPose], undefined);
    runtime.manualEquipCocoon();
    assert.equal(runtime.equipment.get("ItemDevices").data[outerStateKey], undefined);
});

test("three normally paced four-turn struggles remain recent when a spider's next attack lands", () => {
    const runtime = loadRuntime();
    runtime.manualEquipCocoon();
    const item = runtime.equipment.get("ItemDevices");
    for (let action = 0; action < 2; action++) {
        runtime.nativeEscapeCocoon("Struggle");
        runtime.event("tickAfter", { delta: 4 });
    }
    runtime.nativeEscapeCocoon("Struggle");
    runtime.event("tickAfter", { delta: 2 });
    directHit(runtime);
    assert.equal(
        item.data[outerStateKey].anchored,
        true,
        "KD spends four turns per normal struggle; the third action must still be able to provoke anchoring",
    );
});

for (const methods of [
    ["Cut", "Cut", "Cut"],
    ["Remove", "Remove", "Remove"],
    ["Cut", "Remove", "Struggle"],
    ["Cut", "Struggle", "Remove"],
    ["Remove", "Cut", "Struggle"],
    ["Remove", "Struggle", "Cut"],
    ["Struggle", "Cut", "Remove"],
    ["Struggle", "Remove", "Cut"],
])
    test(`Cocoon reinforcement shares one effective-action count across ${methods.join(" / ")}`, () => {
        const runtime = loadRuntime();
        runtime.manualEquipCocoon();
        const item = runtime.equipment.get("ItemDevices");
        for (let action = 0; action < methods.length; action++) {
            runtime.nativeEscapeCocoon(methods[action]);
            // A duplicate result notification cannot add another effective action.
            runtime.inventoryEvent("struggle", item, {
                restraint: item,
                struggleType: methods[action],
                result: "Fail",
            });
            assert.equal(item.data[outerStateKey]?.attemptAges.length, action + 1);
            assert.equal(!!item.data[outerStateKey].reinforcementPending, action === 2);
            runtime.event("tickAfter", { delta: 4 });
        }
        assert.equal(item.data[outerStateKey].anchored, false);
        directHit(runtime);
        assert.equal(item.data[outerStateKey].anchored, true);
    });

test("frequency expires in game time; queries, blocked costs and missing cutting tools cannot arm outer webs", () => {
    const runtime = loadRuntime();
    runtime.manualEquipCocoon();
    const item = runtime.equipment.get("ItemDevices");
    for (const method of ["Cut", "Remove", "Struggle"]) {
        runtime.inventoryEvent("beforeStruggleCalc", item, { restraint: item, struggleType: method, query: true });
        runtime.inventoryEvent("struggle", item, { restraint: item, struggleType: method, result: "Fail" });
        runtime.setHasStamina(false);
        runtime.nativeEscapeCocoon(method);
    }
    runtime.setHasStamina(true);
    runtime.inventoryEvent("beforeStruggleCalc", item, { restraint: item, struggleType: "Cut", canCut: false });
    runtime.inventoryEvent("struggle", item, { restraint: item, struggleType: "Cut", result: "Fail" });
    assert.equal(item.data[outerStateKey], undefined);
    runtime.setHasStamina(true);
    for (let n = 0; n < 2; n++) runtime.nativeEscapeCocoon("Struggle");
    runtime.event("tickAfter", { delta: 0 });
    assert.deepEqual(plain(item.data[outerStateKey].attemptAges), [0, 0]);
    runtime.event("tickAfter", { delta: 12 });
    runtime.nativeEscapeCocoon("Struggle");
    directHit(runtime);
    assert.equal(item.data[outerStateKey].anchored, false);
    for (let n = 0; n < 3; n++) runtime.nativeEscapeCocoon("Struggle");
    runtime.event("tickAfter", { delta: 11 });
    directHit(runtime, "WebCaster");
    assert.equal(item.data[outerStateKey].anchored, true);
});

test("once frequent struggles arm reinforcement it survives the wait for an actual enemy hit", () => {
    const runtime = loadRuntime();
    runtime.manualEquipCocoon();
    const item = runtime.equipment.get("ItemDevices");
    for (let action = 0; action < 3; action++) {
        runtime.nativeEscapeCocoon("Struggle");
        runtime.event("tickAfter", { delta: 4 });
    }
    assert.equal(item.data[outerStateKey].reinforcementPending, true);
    runtime.event("tickAfter", { delta: 20 });
    assert.equal(item.data[outerStateKey].anchored, false, "waiting alone cannot create outer webs");
    const loaded = loadRuntime();
    const restored = loaded.seedItem(cocoonId, "ItemDevices", { data: plain(item.data) });
    directHit(loaded);
    assert.equal(restored.data[outerStateKey].anchored, true);
    assert.equal(restored.data[outerStateKey].reinforcementPending, undefined);
});

test("trail and unrelated spider profiles never anchor; direct WebSpray anchors even an intact cocoon", () => {
    const runtime = loadRuntime();
    runtime.manualEquipCocoon();
    const item = runtime.equipment.get("ItemDevices");
    for (let n = 0; n < 3; n++) runtime.nativeEscapeCocoon("Struggle");
    item.cutProgress = 0;
    item.struggleProgress = 0;
    directHit(runtime, "Tunneler");
    directHit(runtime, "NestEntrance");
    const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const spray = (effect) =>
        runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit(
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            effect,
            spell,
            "Enemy",
            {},
            { Enemy: { name: "WebCaster" } },
        );
    spray(spell.trailPlayerEffect);
    assert.equal(item.data[outerStateKey].anchored, false);
    assert.equal(spray(spell.playerEffect).effect, true);
    assert.equal(item.data[outerStateKey].anchored, true);
});

test("Cocoon uses the delivered standing art and retains its escape mechanics", () => {
    const runtime = loadRuntime();
    assert.equal(fs.existsSync(path.join(modRoot, runtimeAsset)), true);
    const restraint = runtime.context.KinkyDungeonGetRestraintByName(cocoonId);
    const model = runtime.models.find((entry) => entry.Name === cocoonModelId);
    const armModel = runtime.models.find((entry) => entry.Name === "SpiderlingsWebbingLv1ArmModel");
    assert.ok(restraint);
    assert.ok(model);
    assert.ok(armModel);
    assert.equal(restraint.Group, "ItemDevices");
    assert.equal(restraint.Model, cocoonModelId);
    assert.notEqual(restraint.immobile, true);
    assert.equal(restraint.hobble, 3);
    assert.deepEqual(plain(restraint.addTag), ["FeetLinked", "BlockKneel", "BlockHogtie"]);
    assert.deepEqual(plain(restraint.escapeChance), { Cut: 0.025, Struggle: 0.02, Remove: 0.02 });
    assert.equal("struggleMinSpeed" in restraint, false);
    assert.deepEqual(plain(restraint.alwaysEscapable), ["Cut", "Struggle", "Remove"]);
    assert.equal(restraint.weight, 0);
    assert.deepEqual(plain(restraint.enemyTags), {});
    for (const field of ["removePrison", "forceRemovePrison", "removeOnDefeat", "removeOnCapture"]) {
        assert.equal(field in restraint, false);
    }
    const layer = Object.values(model.Layers)[0];
    assert.equal(model.Folder, "SpiderlingsWebbingCocoon");
    assert.equal(layer.Sprite, "Cocoon");
    assert.deepEqual(plain(model.RemovePoses), ["Spread", "Kneel", "KneelClosed", "Hogtie"]);
    assert.deepEqual(Object.keys(layer.Poses), ["Closed"]);
    assert.equal(layer.Invariant, true);
    assert.equal(layer.NoColorize, true);
    assert.deepEqual(plain(armModel.AddPose.filter((pose) => ["Boxties", "Wristties"].includes(pose))), ["Wristties"]);
    assert.deepEqual(plain(model.AddPose.filter((pose) => ["Boxties", "Wristties"].includes(pose))), ["Wristties"]);
    assert.deepEqual(
        plain(
            restraint.events
                .filter((event) => event.type === "SpiderlingsRefreshModels")
                .map((event) => event.trigger)
                .sort(),
        ),
        ["afterDress", "postApply", "postRemoval"],
    );
    assert.equal(runtime.models.filter((entry) => /^SpiderlingsWebbingLv2/.test(entry.Name)).length, 5);
    assert.equal(
        runtime.context.KinkyDungeonRestraints.filter((entry) => /^SpiderlingsWebbingLv2/.test(entry.name)).length,
        5,
    );
    const manifest = JSON.parse(fs.readFileSync(path.join(modRoot, "mod.json"), "utf8"));
    assert.ok(manifest.fileorder.includes(runtimeAsset));
    assert.ok(manifest.fileorder.indexOf(runtimeAsset) < manifest.fileorder.indexOf("SpiderlingsCore.js"));
});

test("Cocoon eligibility requires all eight physical Lv3 items, pre-hit five slow, and a later direct allowlisted bind", () => {
    const runtime = loadRuntime();
    const lv1 = families.map((family) => owned(1, family));
    const lv2 = lv2Families.map((family) => owned(2, family));
    const lv3 = lv3Families.map((family) => owned(3, family));
    const all = [...lv1, ...lv2, ...lv3];
    const direct = (name, extra = {}) => ({
        type: "enemyBind",
        profile: name,
        source: { kind: "enemy", name },
        random: () => 0,
        ...extra,
    });

    assert.notEqual(resolve(runtime, all, 4, direct("Jumper")).outcome.selectedId, cocoonId);
    assert.notEqual(resolve(runtime, lv1, 5, direct("Jumper")).outcome.selectedId, cocoonId);
    assert.equal(resolve(runtime, all, 5, direct("Jumper")).outcome.selectedId, cocoonId);
    assert.equal(resolve(runtime, all, 5, direct("Jumper")).outcome.selectedId, cocoonId);
    assert.equal(resolve(runtime, all, 5, direct("WebCaster")).outcome.selectedId, cocoonId);
    assert.notEqual(resolve(runtime, all, 5, direct("Tunneler")).outcome.selectedId, cocoonId);
    assert.notEqual(resolve(runtime, all, 5, direct("NestEntrance")).outcome.selectedId, cocoonId);

    assert.notEqual(
        resolve(runtime, lv1, 5, direct("Spinner", { testOnlyLv2Complete: false })).outcome.selectedId,
        cocoonId,
    );
    assert.notEqual(
        resolve(runtime, lv1, 5, direct("Spinner", { testOnlyLv2Complete: true })).outcome.selectedId,
        cocoonId,
    );
    assert.notEqual(
        resolve(runtime, lv1.slice(1), 5, direct("Spinner", { testOnlyLv2Complete: true })).outcome.selectedId,
        cocoonId,
    );
    assert.notEqual(
        resolve(runtime, lv1, 4, direct("Spinner", { testOnlyLv2Complete: true })).outcome.selectedId,
        cocoonId,
    );
    for (const missing of lv3) {
        assert.notEqual(
            resolve(
                runtime,
                all.filter((item) => item !== missing),
                5,
                direct("Jumper"),
            ).outcome.selectedId,
            cocoonId,
            `${missing.name} must physically exist before Cocoon`,
        );
    }
    for (const source of ["Jumper", "WebCaster"]) {
        assert.equal(resolve(runtime, lv3, 5, direct(source)).outcome.selectedId, cocoonId);
        assert.notEqual(resolve(runtime, lv3, 4, direct(source)).outcome.selectedId, cocoonId);
    }
    for (const missing of [...lv1, ...lv2]) {
        assert.equal(
            resolve(
                runtime,
                all.filter((item) => item !== missing),
                5,
                direct("Jumper"),
            ).outcome.selectedId,
            cocoonId,
        );
    }
});

test("runtime direct spray can cocoon Lv3-only equipment without adding missing lower layers", () => {
    const runtime = loadRuntime();
    runtime.seedPhysical([3]);
    const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const caster = { Enemy: { name: "WebCaster" }, id: 60 };
    const hit = () =>
        runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit(
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            spell.playerEffect,
            spell,
            "Enemy",
            { x: 1, y: 1 },
            caster,
        );
    for (let i = 0; i < 5; i++) {
        hit();
        runtime.event("tickAfter", { delta: 1 });
    }
    assert.equal(runtime.equipment.get("ItemDevices"), undefined);
    runtime.equipment.clear();
    runtime.seedPhysical([3]);
    hit();
    assert.equal(runtime.equipment.get("ItemDevices").name, cocoonId);
    const names = runtime.context.KinkyDungeonAllRestraintDynamic().map((entry) => entry.item.name);
    assert.equal(names.length, 9);
    assert.ok(names.every((name) => name === cocoonId || name.startsWith("SpiderlingsWebbingLv3")));
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow, undefined);
});

test("the fourth-to-fifth WebSpray hit only establishes the gate and trail never applies Cocoon", () => {
    const runtime = loadRuntime();
    const all = [
        ...families.map((family) => owned(1, family)),
        ...lv2Families.map((family) => owned(2, family)),
        ...lv3Families.map((family) => owned(3, family)),
    ];
    const action = (triggerSource, turn) => ({
        type: "webSprayTrigger",
        provenance: "WebCaster.WebSpray",
        triggerSource,
        profile: "WebCaster",
        turn,
        random: () => 0,
    });
    const fifth = resolve(runtime, all, 4, action("direct", 4));
    assert.equal(fifth.nextSnapshot.webSpray.stacks, 5);
    assert.notEqual(fifth.outcome.selectedId, cocoonId);
    const later = runtime.context.Spiderlings.Webbing.resolveWebbingAction({
        snapshot: { ...snapshot(all, 5), webSpray: fifth.nextSnapshot.webSpray },
        action: action("direct", 5),
    });
    assert.equal(later.outcome.selectedId, cocoonId);
    assert.notEqual(resolve(runtime, all, 5, action("trail", 5)).outcome.selectedId, cocoonId);
});

test("runtime enemy Cocoon application is the twenty-fourth layer and clears slow without consuming inner items", () => {
    const runtime = loadRuntime();
    runtime.seedPhysical();
    const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const hit = runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit;
    const caster = { Enemy: { name: "WebCaster" }, id: 60 };
    for (let turn = 0; turn < 5; turn += 1) {
        assert.equal(
            hit(
                runtime.context.KinkyDungeonPlayerEntity,
                "inert",
                spell.playerEffect,
                spell,
                "Enemy",
                { x: 1, y: 1 },
                caster,
            ).effect,
            true,
        );
        runtime.event("tickAfter", { delta: 1 });
    }
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 5);
    const innerBefore = runtime.context
        .KinkyDungeonAllRestraintDynamic()
        .map((entry) => entry.item)
        .filter((entry) => entry.name !== cocoonId);
    assert.equal(innerBefore.length, 23);

    assert.equal(
        hit(
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            spell.playerEffect,
            spell,
            "Enemy",
            { x: 1, y: 1 },
            caster,
        ).effect,
        true,
    );
    const cocoon = runtime.equipment.get("ItemDevices");
    assert.equal(cocoon.name, cocoonId);
    assert.equal(cocoon.tightness, 0);
    assert.equal(cocoon.lock, "");
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow, undefined);
    assert.equal(runtime.context.KinkyDungeonAllRestraintDynamic().length, 24);
    for (const entry of innerBefore)
        assert.ok(runtime.context.KinkyDungeonAllRestraintDynamic().some((current) => current.item === entry));
});

test("direct and trail WebSpray each add all eight Lv3 items before a later direct hit applies Cocoon", () => {
    for (const triggerSource of ["direct", "trail"]) {
        const runtime = loadRuntime();
        runtime.seedPhysical([1, 2]);
        const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
        const spray = runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit;
        const caster = { Enemy: { name: "WebCaster" }, id: 68 };
        const effect = triggerSource === "direct" ? spell.playerEffect : spell.trailPlayerEffect;
        const equipped = () => runtime.context.KinkyDungeonAllRestraintDynamic().map(({ item }) => item);
        const original = equipped();
        for (let turn = 0; turn < 8; turn += 1) {
            const before = equipped();
            assert.equal(
                spray(runtime.context.KinkyDungeonPlayerEntity, "inert", effect, spell, "Enemy", { x: 1, y: 1 }, caster)
                    .effect,
                true,
            );
            const after = equipped();
            assert.equal(after.length, before.length + 1);
            assert.equal(runtime.equipment.has("ItemDevices"), false, "even the eighth hit only adds Lv3");
            const added = after.find((item) => !before.includes(item));
            assert.ok(added.name.startsWith("SpiderlingsWebbingLv3"));
            if (added.name === id(3, "Hood")) {
                assert.ok(before.some((item) => item.name === id(3, "Blindfold")));
                assert.ok(before.some((item) => item.name === id(3, "Gag")));
            }
            if (triggerSource === "trail") {
                assert.equal(
                    spray(
                        runtime.context.KinkyDungeonPlayerEntity,
                        "inert",
                        effect,
                        spell,
                        "Enemy",
                        { x: 1, y: 1 },
                        caster,
                    ).effect,
                    false,
                );
                assert.equal(equipped().length, after.length, "trail remains limited to once per turn");
            }
            runtime.event("tickAfter", { delta: 1 });
        }
        assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 5);
        assert.equal(
            spray(
                runtime.context.KinkyDungeonPlayerEntity,
                "inert",
                spell.trailPlayerEffect,
                spell,
                "Enemy",
                { x: 1, y: 1 },
                caster,
            ).effect,
            true,
        );
        assert.equal(runtime.equipment.has("ItemDevices"), false, "full sets never allow trail to apply Cocoon");
        assert.equal(
            spray(
                runtime.context.KinkyDungeonPlayerEntity,
                "inert",
                spell.playerEffect,
                spell,
                "Enemy",
                { x: 1, y: 1 },
                caster,
            ).effect,
            true,
        );
        assert.equal(runtime.equipment.get("ItemDevices").name, cocoonId);
        assert.equal(equipped().length, 24);
        for (const item of original) assert.ok(equipped().includes(item));
    }
});

test("a later Jumper hit consumes the same physical and pre-hit slow gates", () => {
    const runtime = loadRuntime();
    runtime.seedPhysical();
    const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const spray = runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit;
    const caster = { Enemy: { name: "WebCaster" }, id: 65 };
    for (let turn = 0; turn < 5; turn += 1) {
        spray(
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            spell.playerEffect,
            spell,
            "Enemy",
            { x: 1, y: 1 },
            caster,
        );
        runtime.event("tickAfter", { delta: 1 });
    }
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 5);

    const spinner = { Enemy: { name: "Jumper", fullBoundBonus: 1 }, id: 66 };
    const result = runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        runtime.context.KinkyDungeonPlayerEntity,
        "tickle",
        { profile: "Jumper" },
        undefined,
        "Enemy",
        undefined,
        spinner,
    );
    assert.equal(result.effect, true);
    assert.equal(runtime.equipment.get("ItemDevices").name, cocoonId);
    assert.equal(runtime.context.KinkyDungeonAllRestraintDynamic().length, 24);
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow, undefined);
});

test("direct reinforcement repairs ten total percentage points proportionally and WebSpray never hides slow under Cocoon", () => {
    const runtime = loadRuntime();
    const cocoon = runtime.seedItem(cocoonId, "ItemDevices", { cutProgress: 0.3, struggleProgress: 0.2 });
    const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const hit = runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit;
    const caster = { Enemy: { name: "WebCaster" }, id: 61 };

    assert.equal(
        hit(
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            spell.playerEffect,
            spell,
            "Enemy",
            { x: 2, y: 2 },
            caster,
        ).effect,
        true,
    );
    assert.ok(Math.abs(cocoon.cutProgress - 0.24) < 1e-9);
    assert.ok(Math.abs(cocoon.struggleProgress - 0.16) < 1e-9);
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow, undefined);

    const afterDirect = { cut: cocoon.cutProgress, struggle: cocoon.struggleProgress };
    assert.equal(
        hit(
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            spell.trailPlayerEffect,
            spell,
            "Enemy",
            { x: 2, y: 2 },
            undefined,
        ).effect,
        false,
    );
    assert.deepEqual({ cut: cocoon.cutProgress, struggle: cocoon.struggleProgress }, afterDirect);
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow, undefined);

    cocoon.cutProgress = 0.3;
    cocoon.struggleProgress = 0.2;
    const spinner = { Enemy: { name: "Spinner", fullBoundBonus: 1 }, id: 63 };
    const spinnerResult = runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
        runtime.context.KinkyDungeonPlayerEntity,
        "tickle",
        { profile: "Spinner" },
        undefined,
        "Enemy",
        undefined,
        spinner,
    );
    assert.equal(spinnerResult.effect, true);
    assert.ok(Math.abs(cocoon.cutProgress - 0.24) < 1e-9);
    assert.ok(Math.abs(cocoon.struggleProgress - 0.16) < 1e-9);

    cocoon.cutProgress = 0;
    cocoon.struggleProgress = 0;
    assert.equal(
        hit(
            runtime.context.KinkyDungeonPlayerEntity,
            "inert",
            spell.playerEffect,
            spell,
            "Enemy",
            { x: 2, y: 2 },
            caster,
        ).effect,
        false,
    );
    const jumper = { Enemy: { name: "Jumper", fullBoundBonus: 2 }, id: 64 };
    assert.equal(
        runtime.context.KDPlayerEffects.SpiderlingsWebbingEnemyBind(
            runtime.context.KinkyDungeonPlayerEntity,
            "tickle",
            { profile: "Jumper" },
            undefined,
            "Enemy",
            undefined,
            jumper,
        ).effect,
        false,
    );
    assert.equal(cocoon.cutProgress, 0);
    assert.equal(cocoon.struggleProgress, 0);
});

test("manual Cocoon equipment bypasses progression but clears slow only after native success", () => {
    const runtime = loadRuntime({ canAdd: (restraint) => restraint.name === cocoonId });
    const spell = runtime.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    const hit = runtime.context.KDPlayerEffects.SpiderlingsWebSprayHit;
    const caster = { Enemy: { name: "WebCaster" }, id: 62 };
    hit(runtime.context.KinkyDungeonPlayerEntity, "inert", spell.playerEffect, spell, "Enemy", { x: 1, y: 1 }, caster);
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow.power, 1);
    assert.equal(runtime.manualEquipCocoon(), true);
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow, undefined);
    assert.equal(runtime.context.KinkyDungeonAllRestraintDynamic().length, 1);

    const rejected = loadRuntime({ canAdd: () => false });
    const rejectedSpell = rejected.context.KinkyDungeonSpellListEnemies.find((entry) => entry.name === "WebSpray");
    rejected.context.KDPlayerEffects.SpiderlingsWebSprayHit(
        rejected.context.KinkyDungeonPlayerEntity,
        "inert",
        rejectedSpell.playerEffect,
        rejectedSpell,
        "Enemy",
        { x: 1, y: 1 },
        caster,
    );
    assert.equal(rejected.buffs.SpiderlingsWebSpraySlow.power, 1);
    assert.equal(rejected.manualEquipCocoon(), false);
    assert.equal(rejected.buffs.SpiderlingsWebSpraySlow.power, 1);
});

test("all three effective escape baselines finish, with final-method inventory fate and fresh re-equipment", () => {
    for (const [method, target] of [
        ["Cut", 40],
        ["Struggle", 50],
        ["Remove", 50],
    ]) {
        const runtime = loadRuntime();
        const restraint = runtime.context.KinkyDungeonGetRestraintByName(cocoonId);
        assert.equal(runtime.context.Spiderlings.Webbing.equipForDebug(cocoonId).applied, true);
        const worn = runtime.equipment.get("ItemDevices");
        assert.ok(
            worn.restraint.events.some(
                (event) => event.trigger === "beforeStruggleCalc" && event.type === cocoonEscapeEvent,
            ),
        );
        for (let action = 1; action <= target; action += 1) {
            assert.equal(runtime.nativeEscapeCocoon(method), action === target, `${method} action ${action}`);
        }
        assert.equal(runtime.equipment.has("ItemDevices"), false);
        assert.equal(runtime.loose.has(cocoonId), method !== "Cut");
        if (method !== "Cut") {
            runtime.setAddResult(1);
            assert.equal(runtime.context.KinkyDungeonAddRestraint(restraint, 0, true, ""), 1);
            const fresh = runtime.equipment.get("ItemDevices");
            assert.deepEqual(fresh.data, {});
            assert.equal(fresh.cutProgress, undefined);
            assert.equal(fresh.struggleProgress, undefined);
        }
        assert.equal("removePrison" in restraint, false);
    }
});

test("queries and stamina-blocked attempts do not advance the native Cocoon escape gate", () => {
    const runtime = loadRuntime({ hasStamina: false });
    assert.equal(runtime.context.Spiderlings.Webbing.equipForDebug(cocoonId).applied, true);
    const worn = runtime.equipment.get("ItemDevices");
    runtime.inventoryEvent("beforeStruggleCalc", worn, {
        restraint: worn,
        query: true,
        struggleType: "Cut",
        cost: 1,
        minSpeed: 0.4,
        escapeChance: 0.025,
        escapePenalty: 0,
        limitChance: 0,
    });
    assert.equal(worn.cutProgress, undefined);
    assert.equal(runtime.nativeEscapeCocoon("Cut"), false);
    assert.equal(worn.cutProgress, undefined);
    runtime.setHasStamina(true);
    assert.equal(runtime.nativeEscapeCocoon("Cut"), false);
    assert.ok(Math.abs(worn.cutProgress - 0.025) < 1e-9);
});

test("Cocoon counts only the post-cost Fail event and preserves KD 5.5 negative stamina costs", () => {
    const runtime = loadRuntime({ hasStamina: () => true });
    assert.equal(runtime.context.Spiderlings.Webbing.equipForDebug(cocoonId).applied, true);
    const worn = runtime.equipment.get("ItemDevices");
    const before = runtime.inventoryEvent("beforeStruggleCalc", worn, {
        restraint: worn,
        query: false,
        struggleType: "Cut",
        struggleGroup: "ItemDevices",
        cost: -0.2,
        minSpeed: 0.4,
        escapeSpeed: 1,
        escapeChance: 0.025,
        escapePenalty: 0,
        limitChance: 0,
    });
    assert.deepEqual(runtime.staminaChecks.at(-1), [0.2, true]);
    assert.equal(worn.cutProgress, undefined, "beforeStruggleCalc must not grant a free action");
    assert.equal(before.escapeSpeed, 0, "native delayed progress must be suppressed");
    assert.ok(before.minSpeed > 0, "the native attempt must remain positive so KD consumes its turn and cost");
    runtime.inventoryEvent("struggle", worn, {
        restraint: worn,
        struggleType: "Cut",
        result: "Fail",
    });
    assert.ok(Math.abs(worn.cutProgress - 0.025) < 1e-9);
});

test("Cocoon ignores post-Fail events for unarmed and group-blocked attempts", () => {
    const unarmed = loadRuntime();
    assert.equal(unarmed.context.Spiderlings.Webbing.equipForDebug(cocoonId).applied, true);
    const unarmedItem = unarmed.equipment.get("ItemDevices");
    unarmed.inventoryEvent("beforeStruggleCalc", unarmedItem, {
        restraint: unarmedItem,
        query: false,
        struggleType: "Cut",
        struggleGroup: "ItemDevices",
        canCut: false,
        cost: -0.2,
        minSpeed: 0.4,
        escapeSpeed: 1,
        escapeChance: 0.025,
        escapePenalty: 0,
        limitChance: 0,
    });
    unarmed.inventoryEvent("struggle", unarmedItem, {
        restraint: unarmedItem,
        struggleType: "Cut",
        result: "Fail",
    });
    assert.equal(unarmedItem.cutProgress, undefined);
    assert.equal(unarmedItem.struggleProgress, undefined);

    const blocked = loadRuntime({ groupBlocked: () => true });
    assert.equal(blocked.context.Spiderlings.Webbing.equipForDebug(cocoonId).applied, true);
    const blockedItem = blocked.equipment.get("ItemDevices");
    blockedItem.restraint.alwaysStruggleable = false;
    blocked.inventoryEvent("beforeStruggleCalc", blockedItem, {
        restraint: blockedItem,
        query: false,
        struggleType: "Struggle",
        struggleGroup: "ItemDevices",
        cost: -3,
        minSpeed: 0.4,
        escapeSpeed: 1,
        escapeChance: 0.02,
        escapePenalty: 0,
        limitChance: 0,
    });
    blocked.inventoryEvent("struggle", blockedItem, {
        restraint: blockedItem,
        struggleType: "Struggle",
        result: "Fail",
    });
    assert.equal(blockedItem.cutProgress, undefined);
    assert.equal(blockedItem.struggleProgress, undefined);
});

test("defeat, capture, prison, and Cocoon removal preserve the real inner equipment", () => {
    const runtime = loadRuntime();
    runtime.seedPhysical();
    const inner = runtime.context.KinkyDungeonAllRestraintDynamic().map((entry) => entry.item);
    const cocoon = runtime.seedItem(cocoonId, "ItemDevices", { cutProgress: 0.4, struggleProgress: 0.2 });
    for (const trigger of ["defeat", "capture", "prison"]) {
        runtime.inventoryEvent(trigger, cocoon, { player: runtime.context.KinkyDungeonPlayerEntity });
        assert.equal(runtime.equipment.get("ItemDevices"), cocoon);
        for (const entry of inner)
            assert.ok(runtime.context.KinkyDungeonAllRestraintDynamic().some((current) => current.item === entry));
    }
    assert.equal(
        runtime.context.KinkyDungeonRemoveRestraintSpecific(
            cocoon,
            false,
            false,
            false,
            false,
            false,
            runtime.context.KinkyDungeonPlayerEntity,
            false,
        ).length,
        1,
    );
    assert.equal(runtime.equipment.has("ItemDevices"), false);
    assert.equal(runtime.context.KinkyDungeonAllRestraintDynamic().length, 23);
    assert.equal(runtime.buffs.SpiderlingsWebSpraySlow, undefined);
});
