"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { stripTypeScriptTypes } = require("node:module");

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

function plain(value) {
    return JSON.parse(JSON.stringify(value));
}

function permutations(values) {
    if (values.length < 2) return [values.slice()];
    return values.flatMap((value, index) =>
        permutations([...values.slice(0, index), ...values.slice(index + 1)]).map((tail) => [value, ...tail]),
    );
}

function syntheticCatalog() {
    return [
        ...families.map((family) => ({
            id: `SpiderlingsWebbingLv1${family}`,
            family,
            group: groups[family],
            stage: "Lv1",
            requiredActions: 1,
        })),
        ...lv2Families.map((family) => ({
            id: `SpiderlingsWebbingLv2${family}`,
            family,
            group: groups[family],
            stage: "Lv2",
            requiredActions: 2,
        })),
        {
            id: "SpiderlingsWebbingCocoon",
            family: "Cocoon",
            group: "ItemDevices",
            stage: "Cocoon",
        },
    ];
}

const { loadLifecycleRuntime, item } = require("./helpers/lifecycle-runtime.js");

test("the action resolver canonicalizes mouth, split-mitten, and ordinary Lv1/Lv2 order without rebuilding items", () => {
    const runtime = loadLifecycleRuntime();
    const resolve = runtime.context.Spiderlings.Webbing.resolveWebbingAction;
    assert.equal(typeof resolve, "function");
    const catalog = syntheticCatalog();
    const mouth = [
        item("SpiderlingsWebbingLv1Stuffing", { group: "ItemMouth", tightness: 1, data: { slot: 1 } }),
        item("SpiderlingsWebbingLv1Gag", { group: "ItemMouth", tightness: 2, data: { slot: 2 } }),
    ];

    for (const clickedOrder of permutations(mouth)) {
        const result = resolve({
            catalog,
            snapshot: { groups: { ItemMouth: clickedOrder } },
            action: { type: "manualEquipResult", accepted: true, group: "ItemMouth" },
        });
        const ordered = Array.from(result.nextSnapshot.groups.ItemMouth);
        assert.deepEqual(ordered, mouth);
        for (let index = 0; index < mouth.length; index++) {
            assert.equal(ordered[index], mouth[index]);
            assert.equal(ordered[index].tightness, index + 1);
            assert.deepEqual(ordered[index].data, { slot: index + 1 });
        }
    }

    const mittens = [
        item("SpiderlingsWebbingLv1MittenLeft", { group: "ItemHands", tightness: 1, data: { slot: 1 } }),
        item("SpiderlingsWebbingLv1MittenRight", { group: "ItemHands", tightness: 2, data: { slot: 2 } }),
    ];
    for (const clickedOrder of permutations(mittens)) {
        const result = resolve({
            catalog,
            snapshot: { groups: { ItemHands: clickedOrder } },
            action: { type: "manualEquipResult", accepted: true, group: "ItemHands" },
        });
        assert.deepEqual(Array.from(result.nextSnapshot.groups.ItemHands), mittens);
    }

    const lv1 = item("SpiderlingsWebbingLv1Arm", { group: "ItemArms", data: { identity: "inner" } });
    const lv2 = item("SpiderlingsWebbingLv2Arm", { group: "ItemArms", data: { identity: "outer" } });
    const ordinary = resolve({
        catalog,
        snapshot: { groups: { ItemArms: [lv2, lv1] } },
        action: { type: "manualEquipResult", accepted: true, group: "ItemArms" },
    });
    assert.deepEqual(Array.from(ordinary.nextSnapshot.groups.ItemArms), [lv1, lv2]);
    assert.equal(ordinary.nextSnapshot.groups.ItemArms[0], lv1);
    assert.equal(ordinary.nextSnapshot.groups.ItemArms[1], lv2);
});

test("accepted chains containing an external item remain field-for-field and reference-for-reference untouched", () => {
    const runtime = loadLifecycleRuntime();
    const owned = item("SpiderlingsWebbingLv1Arm", { group: "ItemArms", tightness: 7, data: { progress: 1 } });
    const external = item("ThirdPartyArmbinder", { group: "ItemArms", tightness: 11, data: { owner: "other-mod" } });
    const snapshot = { groups: { ItemArms: [owned, external] } };
    const result = runtime.context.Spiderlings.Webbing.resolveWebbingAction({
        catalog: syntheticCatalog(),
        snapshot,
        action: { type: "manualEquipResult", accepted: true, group: "ItemArms" },
    });

    assert.equal(result.nextSnapshot, snapshot);
    assert.equal(result.outcome.reason, "external-item");
    assert.equal(snapshot.groups.ItemArms[0], owned);
    assert.equal(snapshot.groups.ItemArms[1], external);
    assert.deepEqual(owned.data, { progress: 1 });
    assert.deepEqual(external.data, { owner: "other-mod" });
});

function loadArmourUnlinkRuntime() {
    const calls = [];
    const notifications = [];
    let runtime;
    runtime = loadLifecycleRuntime(
        {
            Restraint: "Restraint",
            KinkyDungeonPlayer: {},
            KDRestraintDebugLog: [],
            KDBaseLightGreen: "green",
            KDRestraint: (item) => item.restraint,
            KinkyDungeonSendTextMessage(...args) {
                notifications.push(args);
            },
            KinkyDungeonSendEvent(...args) {
                notifications.push(args);
            },
            KinkyDungeonAddRestraint(...args) {
                calls.push(args);
                const [
                    restraint,
                    tightness,
                    ,
                    lock,
                    ,
                    ,
                    ,
                    events,
                    faction,
                    unlink,
                    dynamicLink,
                    curse,
                    ,
                    ,
                    inventoryVariant,
                    data,
                ] = args;
                assert.equal(unlink, true);
                // Native Add constructs a new item from these arguments. The pinned unlink
                // call does not pass the retained item's ID or escape-progress fields.
                runtime.equipment.set(restraint.Group, {
                    name: restraint.name,
                    restraint,
                    type: "Restraint",
                    id: 999,
                    tightness,
                    lock,
                    events,
                    faction,
                    dynamicLink,
                    curse,
                    inventoryVariant,
                    data,
                });
                return 1;
            },
        },
        (context) => {
            const source = fs.readFileSync(
                path.join(modRoot, "../KinkiestDungeon-5.5/Game/src/restraint/KinkyDungeonRestraints.ts"),
                "utf8",
            );
            const unlink = source.slice(
                source.indexOf("function KinkyDungeonUnLinkItem("),
                source.indexOf("function KDCreateDebris "),
            );
            vm.runInContext(stripTypeScriptTypes(unlink), context, { filename: "KD5.5-unlink.ts" });
        },
    );
    function seed(outerName = "SpiderlingsWebbingLv1Belly", armour = true) {
        const definition = { name: armour ? "ChainTunic" : "ExternalRestraint", Group: "ItemTorso", armor: armour };
        runtime.context.KinkyDungeonRestraints.push(definition);
        const inner = {
            name: definition.name,
            restraint: definition,
            type: "Restraint",
            id: 42,
            tightness: 2,
            lock: "",
            cutProgress: 0.13,
            struggleProgress: 0.27,
            data: { marker: "retained" },
        };
        const outer = {
            name: outerName,
            type: "Restraint",
            restraint: { name: outerName, Group: "ItemTorso" },
            dynamicLink: inner,
        };
        runtime.equipment.set("ItemTorso", outer);
        return { inner, outer };
    }
    return { ...runtime, calls, notifications, seed };
}

test("KD native Webbing unlink retains exposed external item identity and progress after native removal", () => {
    for (const keep of [false, true])
        for (const armour of [true, false]) {
            const runtime = loadArmourUnlinkRuntime();
            const { inner, outer } = runtime.seed("SpiderlingsWebbingLv1Belly", armour);
            const original = plain(inner);
            const result = runtime.context.KinkyDungeonUnLinkItem(outer, keep, undefined, !keep);
            assert.equal(result[0], outer);
            assert.equal(runtime.equipment.get("ItemTorso"), inner);
            assert.deepEqual(plain(inner), original);
            assert.equal(runtime.calls.length, 1, "native unlink still performs its removal path exactly once");
            assert.equal(runtime.calls[0][4], keep);
            assert.equal(runtime.calls[0][18], !keep);
            assert.equal(runtime.notifications.length, 2, "native postRemoval and feedback are retained");
            assert.ok(runtime.refreshCalls.some(([kind, root]) => kind === "links" && root === inner));
        }
});

test("unrelated native unlink and rejected Webbing unlink are not rewritten by armour preservation", () => {
    for (const [outerName, armour] of [
        ["TrapHarness", true],
        ["TrapHarness", false],
    ]) {
        const runtime = loadArmourUnlinkRuntime();
        const { inner, outer } = runtime.seed(outerName, armour);
        runtime.context.KinkyDungeonUnLinkItem(outer, true);
        assert.notEqual(runtime.equipment.get("ItemTorso"), inner, "unrelated native reconstruction is untouched");
        assert.equal(runtime.equipment.get("ItemTorso").id, 999);
        assert.equal(runtime.refreshCalls.length, 0);
    }
    const runtime = loadArmourUnlinkRuntime();
    const { outer } = runtime.seed();
    runtime.context.KinkyDungeonRestraints.length = 0;
    assert.equal(runtime.context.KinkyDungeonUnLinkItem(outer, true).length, 0);
    assert.equal(runtime.equipment.get("ItemTorso"), outer);
    assert.equal(runtime.calls.length, 0);
});

test("native inventory equipment normalizes only after a real successful add and never consumes a rejected loose item", () => {
    const runtime = loadLifecycleRuntime();
    const stuffing = runtime.context.KinkyDungeonGetRestraintByName("SpiderlingsWebbingLv1Stuffing");
    const gag = runtime.context.KinkyDungeonGetRestraintByName("SpiderlingsWebbingLv1Gag");
    runtime.loose.set(stuffing.name, { name: stuffing.name, type: "LooseRestraint", quantity: 1 });
    runtime.loose.set(gag.name, { name: gag.name, type: "LooseRestraint", quantity: 1 });

    assert.equal(runtime.nativeInventoryEquip(gag), true);
    runtime.flushScheduled();
    assert.equal(runtime.nativeInventoryEquip(stuffing), true);
    runtime.flushScheduled();
    const root = runtime.equipment.get("ItemMouth");
    assert.equal(root.name, gag.name);
    assert.equal(root.dynamicLink.name, stuffing.name);
    assert.ok(runtime.refreshCalls.some(([kind]) => kind === "links"));

    const blockedRuntime = loadLifecycleRuntime({ KinkyDungeonAddRestraintIfWeaker: () => 0 });
    const arm = blockedRuntime.context.KinkyDungeonGetRestraintByName("SpiderlingsWebbingLv1Arm");
    const external = item("ThirdPartyArmbinder", { group: "ItemArms", tightness: 13, data: { sentinel: true } });
    const looseArm = { name: arm.name, type: "LooseRestraint", quantity: 1 };
    blockedRuntime.equipment.set("ItemArms", external);
    blockedRuntime.loose.set(arm.name, looseArm);

    assert.equal(blockedRuntime.nativeInventoryEquip(arm), false);
    blockedRuntime.flushScheduled();
    assert.equal(blockedRuntime.equipment.get("ItemArms"), external);
    assert.equal(blockedRuntime.loose.get(arm.name), looseArm);
    assert.equal(looseArm.quantity, 1);
    assert.deepEqual(external.data, { sentinel: true });
});

test("a failed runtime root replacement leaves the pre-normalization chain intact", () => {
    const runtime = loadLifecycleRuntime({ KinkyDungeonReplaceRestraintRoot: () => false });
    const gag = item("SpiderlingsWebbingLv1Gag", { group: "ItemMouth", data: { marker: "gag" } });
    const stuffing = item("SpiderlingsWebbingLv1Stuffing", {
        group: "ItemMouth",
        data: { marker: "stuffing" },
        dynamicLink: gag,
    });
    runtime.equipment.set("ItemMouth", stuffing);
    runtime.context.KinkyDungeonFlags.set("SelfBondage", 1);

    runtime.inventoryEvents["postApply:SpiderlingsNormalizeManualChain"]({ trigger: "postApply" }, stuffing, {
        item: stuffing,
    });
    runtime.flushScheduled();

    assert.equal(runtime.equipment.get("ItemMouth"), stuffing);
    assert.equal(stuffing.dynamicLink, gag);
    assert.equal(gag.dynamicLink, undefined);
    assert.deepEqual(stuffing.data, { marker: "stuffing" });
    assert.deepEqual(gag.data, { marker: "gag" });
});

test("reverse mouth equipment waits for native LinkItem to finish before changing the root", () => {
    const runtime = loadLifecycleRuntime();
    const gagRestraint = runtime.context.KinkyDungeonGetRestraintByName("SpiderlingsWebbingLv1Gag");
    const stuffingRestraint = runtime.context.KinkyDungeonGetRestraintByName("SpiderlingsWebbingLv1Stuffing");
    const gag = item(gagRestraint.name, { group: "ItemMouth", restraint: gagRestraint, data: { marker: "old-root" } });
    runtime.equipment.set("ItemMouth", gag);
    runtime.context.KinkyDungeonFlags.set("SelfBondage", 1);

    // Faithfully model KinkyDungeonLinkItem: AddRestraint emits once before its
    // caller finishes linking, then LinkItem emits a second postApply afterward.
    const stuffing = item(stuffingRestraint.name, {
        group: "ItemMouth",
        restraint: stuffingRestraint,
        data: { marker: "new-root" },
        dynamicLink: gag,
    });
    runtime.equipment.set("ItemMouth", stuffing);
    const handler = runtime.inventoryEvents["postApply:SpiderlingsNormalizeManualChain"];
    handler({ trigger: "postApply" }, stuffing, { item: stuffing, Link: true });
    const nativeRoot = runtime.equipment.get("ItemMouth");
    assert.equal(nativeRoot, stuffing, "normalization must not run inside AddRestraint's postApply stack");
    nativeRoot.dynamicLink = gag;
    handler({ trigger: "postApply" }, nativeRoot, { item: nativeRoot, Link: true });

    assert.equal(runtime.equipment.get("ItemMouth"), stuffing);
    assert.equal(stuffing.dynamicLink, gag);
    runtime.flushScheduled();
    assert.equal(runtime.equipment.get("ItemMouth"), gag);
    assert.equal(gag.dynamicLink, stuffing);
    assert.equal(stuffing.dynamicLink, undefined);
    assert.notEqual(gag.dynamicLink, gag);
});

test("physical inspection counts only exact injected catalog IDs at 10, 15, and 16", () => {
    const runtime = loadLifecycleRuntime();
    const resolve = runtime.context.Spiderlings.Webbing.resolveWebbingAction;
    const catalog = syntheticCatalog();
    const lv1 = families.map((family) => item(`SpiderlingsWebbingLv1${family}`));
    const lv2 = lv2Families.map((family) => item(`SpiderlingsWebbingLv2${family}`));
    const cocoon = item("SpiderlingsWebbingCocoon");
    const inspect = (items) =>
        plain(resolve({ catalog, snapshot: { items }, action: { type: "inspectPhysical" } }).outcome);

    assert.deepEqual(inspect(lv1), {
        lv1Count: 10,
        lv2Count: 0,
        lv3Count: 0,
        physicalInnerCount: 10,
        cocoonPresent: false,
        lv1Complete: true,
        lv2Complete: false,
        lv3Complete: false,
        terminalLayerCount: 10,
    });
    assert.deepEqual(inspect([...lv1, ...lv2]), {
        lv1Count: 10,
        lv2Count: 5,
        lv3Count: 0,
        physicalInnerCount: 15,
        cocoonPresent: false,
        lv1Complete: true,
        lv2Complete: true,
        lv3Complete: false,
        terminalLayerCount: 15,
    });
    assert.equal(inspect([...lv1, ...lv2, cocoon]).terminalLayerCount, 16);
    assert.equal(inspect([cocoon]).lv1Complete, false);
    assert.equal(inspect([cocoon]).lv2Complete, false);
    assert.equal(
        inspect([...lv2, ...lv2, item("SpiderlingsWebbingLv1ArmLookalike"), item("ThirdPartyWebbing")]).lv1Count,
        0,
    );
    assert.equal(inspect([...lv1, ...lv1]).lv1Count, 10);
});

test("Lv1 needs one effective action and synthetic Lv2 shares two actions across methods", () => {
    const runtime = loadLifecycleRuntime();
    const resolve = runtime.context.Spiderlings.Webbing.resolveWebbingAction;
    const catalog = syntheticCatalog();
    const lv1 = item("SpiderlingsWebbingLv1Arm");
    const lv2 = item("SpiderlingsWebbingLv2Arm");
    const act = (target, method, effective, progress = 0) =>
        plain(
            resolve({
                catalog,
                snapshot: { items: [target] },
                action: { type: "escapeAttempt", item: target, method, effective, progress },
            }).outcome,
        );

    assert.deepEqual(act(lv1, "Struggle", true), {
        completed: true,
        progressed: true,
        effectiveActions: 1,
        requiredActions: 1,
        method: "Struggle",
        keep: true,
    });
    const blocked = act(lv2, "Cut", false);
    assert.equal(blocked.progressed, false);
    assert.equal(blocked.completed, false);
    const first = act(lv2, "Cut", true);
    assert.equal(first.completed, false);
    assert.equal(first.effectiveActions, 1);
    const second = act(lv2, "Remove", true, first.effectiveActions);
    assert.equal(second.completed, true);
    assert.equal(second.effectiveActions, 2);
    assert.equal(second.keep, true);
});

test("the player escape input blocks only an exactly paired Lv1 while its Lv2 remains equipped", () => {
    for (const family of lv2Families) {
        for (const method of ["Cut", "Struggle", "Remove"]) {
            const runtime = loadLifecycleRuntime();
            const group = groups[family];
            const lv1 = item(`SpiderlingsWebbingLv1${family}`, { group, data: { untouched: true } });
            const thirdParty = item(`ThirdParty${family}`, { group, dynamicLink: lv1 });
            const lv2 = item(`SpiderlingsWebbingLv2${family}`, { group, dynamicLink: thirdParty });
            runtime.equipment.set(group, lv2);

            const result = runtime.context.KDInputTypes.struggle({ group, type: method, index: 2 });

            assert.equal(result, "Blocked");
            assert.equal(runtime.nativeStruggleInputs.length, 0);
            assert.equal(runtime.actionMessages.length, 1);
            assert.equal(runtime.actionMessages[0][0], 10);
            assert.equal(runtime.actionMessages[0][2], "orange");
            assert.match(runtime.actionMessages[0][1], /^To reach .+, first remove .+\.$/);
            assert.doesNotMatch(runtime.actionMessages[0][1], /TargetLv[12]/);
            assert.deepEqual(runtime.errorSounds, ["Game/Audio/ClickError.ogg"]);
            assert.deepEqual(lv1.data, { untouched: true });
            assert.equal(runtime.equipment.get(group), lv2);

            assert.equal(runtime.context.KDInputTypes.struggle({ group, type: method, index: 1 }), "NativeStruggle");
            assert.equal(runtime.nativeStruggleInputs.length, 1, "the intervening third-party item remains operable");
        }
    }
});

test("the paired gate registers English text for KD 5.5 missing-key behavior and accepts a Chinese override", () => {
    const texts = {
        RestraintSpiderlingsWebbingLv1Arm: "Silken Arm Bonds",
        RestraintSpiderlingsWebbingLv2Arm: "Woven Silken Arm Bonds",
    };
    const runtime = loadLifecycleRuntime({
        addTextKey(key, value) {
            texts[key] = value;
        },
        TextGet(key) {
            return texts[key] || `[NotFound] ${key}`;
        },
    });
    const inner = item("SpiderlingsWebbingLv1Arm", { group: "ItemArms" });
    runtime.equipment.set("ItemArms", item("SpiderlingsWebbingLv2Arm", { group: "ItemArms", dynamicLink: inner }));
    assert.equal(runtime.context.KDInputTypes.struggle({ group: "ItemArms", type: "Remove", index: 1 }), "Blocked");
    assert.equal(runtime.actionMessages.at(-1)[1], "To reach Silken Arm Bonds, first remove Woven Silken Arm Bonds.");
    texts.KinkyDungeonSpiderlingsWebbingLv1Covered = "TargetLv1覆在TargetLv2下面。先移除外层，才能处理里面的蛛丝。";
    texts.RestraintSpiderlingsWebbingLv1Arm = "蛛丝缚臂";
    texts.RestraintSpiderlingsWebbingLv2Arm = "缠织蛛丝缚臂";
    runtime.context.KDInputTypes.struggle({ group: "ItemArms", type: "Remove", index: 1 });
    assert.equal(runtime.actionMessages.at(-1)[1], "蛛丝缚臂覆在缠织蛛丝缚臂下面。先移除外层，才能处理里面的蛛丝。");
});

test("the paired gate ignores unpaired Lv1 and system-level removal, then permits Lv1 after Lv2 is gone", () => {
    const runtime = loadLifecycleRuntime();
    const mitten = item("SpiderlingsWebbingLv1MittenLeft", { group: "ItemHands" });
    runtime.equipment.set("ItemHands", mitten);
    assert.equal(
        runtime.context.KDInputTypes.struggle({ group: "ItemHands", type: "Remove", index: 0 }),
        "NativeStruggle",
    );

    const bellyLv1 = item("SpiderlingsWebbingLv1Belly", { group: "ItemTorso" });
    const bellyLv2 = item("SpiderlingsWebbingLv2Belly", { group: "ItemTorso", dynamicLink: bellyLv1 });
    runtime.equipment.set("ItemTorso", bellyLv2);
    assert.equal(
        runtime.context.KinkyDungeonRemoveRestraintSpecific(
            bellyLv1,
            true,
            false,
            false,
            false,
            false,
            runtime.context.KinkyDungeonPlayerEntity,
            true,
        ).length,
        1,
        "system code may directly remove the covered Lv1",
    );
    assert.equal(runtime.equipment.get("ItemTorso"), bellyLv2);
    assert.equal(bellyLv2.dynamicLink, undefined);

    const lv1 = item("SpiderlingsWebbingLv1Arm", { group: "ItemArms" });
    const lv2 = item("SpiderlingsWebbingLv2Arm", { group: "ItemArms", dynamicLink: lv1 });
    runtime.equipment.set("ItemArms", lv2);
    assert.equal(
        runtime.context.KinkyDungeonRemoveRestraintSpecific(
            lv2,
            true,
            false,
            false,
            false,
            false,
            runtime.context.KinkyDungeonPlayerEntity,
            true,
        ).length,
        1,
        "system-level removal bypasses the player gate",
    );
    assert.equal(runtime.equipment.get("ItemArms"), lv1);
    assert.equal(runtime.context.KDInputTypes.struggle({ group: "ItemArms", type: "Cut", index: 0 }), "NativeStruggle");
    assert.equal(runtime.actionMessages.length, 0);
    assert.equal(runtime.errorSounds.length, 0);
});

test("the final effective method alone chooses destruction or a fresh retained loose item", () => {
    const retained = loadLifecycleRuntime();
    const retainedId = "SpiderlingsWebbingLv2Arm";
    const retainedItem = item(retainedId, {
        group: "ItemArms",
        tightness: 9,
        lock: "Red",
        data: { SpiderlingsEscapeActions: 0, damage: 0.6, repair: 0.2 },
    });
    retained.equipment.set("ItemArms", retainedItem);
    const catalog = syntheticCatalog();

    const first = retained.context.Spiderlings.Webbing.completeEffectiveEscape(retainedId, "Cut", {
        legal: true,
        catalog,
    });
    assert.equal(first.completed, false);
    assert.equal(retainedItem.data.SpiderlingsEscapeActions, 1);
    const second = retained.context.Spiderlings.Webbing.completeEffectiveEscape(retainedId, "Remove", {
        legal: true,
        catalog,
    });
    assert.equal(second.completed, true);
    assert.equal(retained.equipment.has("ItemArms"), false);
    assert.deepEqual(retained.loose.get(retainedId), { name: retainedId, type: "LooseRestraint", quantity: 1 });

    assert.equal(retained.nativeInventoryEquip({ name: retainedId, Group: "ItemArms" }), true);
    retained.flushScheduled();
    const fresh = retained.equipment.get("ItemArms");
    assert.notEqual(fresh, retainedItem);
    assert.deepEqual(fresh.data, {});
    assert.equal(fresh.tightness, 0);
    assert.equal(fresh.lock, "");
    assert.equal(retained.loose.has(retainedId), false);

    const destroyed = loadLifecycleRuntime();
    const destroyedItem = item(retainedId, { group: "ItemArms", data: { SpiderlingsEscapeActions: 0 } });
    destroyed.equipment.set("ItemArms", destroyedItem);
    assert.equal(
        destroyed.context.Spiderlings.Webbing.completeEffectiveEscape(retainedId, "Remove", { legal: true, catalog })
            .completed,
        false,
    );
    assert.equal(
        destroyed.context.Spiderlings.Webbing.completeEffectiveEscape(retainedId, "Cut", { legal: true, catalog })
            .completed,
        true,
    );
    assert.equal(destroyed.loose.has(retainedId), false);
});

test("a retained synthetic Cocoon uses native loose inventory and re-equips without old damage or repair state", () => {
    const runtime = loadLifecycleRuntime();
    const id = "SpiderlingsWebbingCocoon";
    const worn = item(id, {
        group: "ItemDevices",
        tightness: 12,
        data: { SpiderlingsEscapeActions: 0, damage: 0.7, repairProgress: 0.2 },
    });
    runtime.equipment.set("ItemDevices", worn);

    assert.equal(
        runtime.context.KinkyDungeonRemoveRestraintSpecific(
            worn,
            true,
            false,
            false,
            false,
            false,
            runtime.context.KinkyDungeonPlayerEntity,
            false,
        ).length,
        1,
    );
    assert.deepEqual(runtime.loose.get(id), { name: id, type: "LooseRestraint", quantity: 1 });

    assert.equal(runtime.nativeInventoryEquip({ name: id, Group: "ItemDevices" }), true);
    runtime.flushScheduled();
    const fresh = runtime.equipment.get("ItemDevices");
    assert.notEqual(fresh, worn);
    assert.deepEqual(fresh.data, {});
    assert.equal(fresh.tightness, 0);
    assert.equal(runtime.loose.has(id), false);
});

test("beforeSuccessRemove makes native item fate deterministic from the final method", () => {
    const runtime = loadLifecycleRuntime();
    const handler = runtime.inventoryEvents["beforeSuccessRemove:SpiderlingsFinalEscapeOutcome"];
    assert.equal(typeof handler, "function");
    const owned = item("SpiderlingsWebbingLv1Arm");
    for (const [method, expected] of [
        ["Cut", 1],
        ["Struggle", 0],
        ["Remove", 0],
    ]) {
        const data = { restraint: owned, struggleType: method, destroyChance: 0.37 };
        handler({ trigger: "beforeSuccessRemove" }, owned, data);
        assert.equal(data.destroyChance, expected);
    }
    const externalData = { restraint: item("ThirdPartyArmbinder"), struggleType: "Cut", destroyChance: 0.37 };
    handler({ trigger: "beforeSuccessRemove" }, owned, externalData);
    assert.equal(externalData.destroyChance, 0.37);
});

test("real Remove and Struggle actions on Spiderlings restraints randomly play all four web sounds", () => {
    const sounds = [];
    const rolls = [0, 0.25, 0.5, 0.999];
    const runtime = loadLifecycleRuntime({
        Math: Object.assign(Object.create(Math), { random: () => rolls.shift() }),
        KinkyDungeonRootDirectory: "Game/",
        KinkyDungeonPlaySound: (sound) => sounds.push(sound),
    });
    const ids = [
        "SpiderlingsWebbingLv1Arm",
        "SpiderlingsWebbingLv2Arm",
        "SpiderlingsWebbingCocoon",
        "SpiderlingsWebbingLv1Gag",
    ];
    const methods = ["Remove", "Struggle", "Remove", "Struggle"];

    for (let index = 0; index < ids.length; index += 1) {
        const restraint = runtime.context.KinkyDungeonGetRestraintByName(ids[index]);
        const worn = item(restraint.name, { group: restraint.Group, restraint });
        runtime.equipment.clear();
        runtime.equipment.set(restraint.Group, worn);
        runtime.dispatchInventoryFlow(index === 0 ? "beforeSuccessRemove" : "struggle", {
            restraint: worn,
            struggleType: methods[index],
            result: index === 0 ? "Success" : "Fail",
        });
    }

    assert.deepEqual(sounds, [
        "Game/Sounds/webs-sweep-away-by-hand-001_01.ogg",
        "Game/Sounds/webs-sweep-away-by-hand-002_01.ogg",
        "Game/Sounds/webs-sweep-away-by-hand-003_01.ogg",
        "Game/Sounds/webs-sweep-away-by-hand-004_01.ogg",
    ]);

    const arm = runtime.context.KinkyDungeonGetRestraintByName("SpiderlingsWebbingLv1Arm");
    const worn = item(arm.name, { group: arm.Group, restraint: arm });
    runtime.equipment.clear();
    runtime.equipment.set(arm.Group, worn);
    runtime.dispatchInventoryFlow("struggle", { restraint: worn, struggleType: "Cut", result: "Fail" });
    runtime.dispatchInventoryFlow("beforeSuccessRemove", { restraint: worn, struggleType: "Cut", result: "Success" });
    assert.equal(sounds.length, 4, "Cut keeps its existing behavior and does not play a hand-removal sound");
});

test("manual Lv3 equipment canonicalizes all body, eye/hood, and mouth permutations without losing item state", () => {
    const chains = [
        ...lv2Families.map((family) => [1, 2, 3].map((stage) => `SpiderlingsWebbingLv${stage}${family}`)),
        ["SpiderlingsWebbingLv1Blindfold", "SpiderlingsWebbingLv3Blindfold", "SpiderlingsWebbingLv3Hood"],
        ["SpiderlingsWebbingLv1Stuffing", "SpiderlingsWebbingLv1Gag", "SpiderlingsWebbingLv3Gag"],
    ];
    for (const chain of chains) {
        for (const clickedOrder of permutations(chain)) {
            const runtime = loadLifecycleRuntime();
            const definitions = chain.map((id) => runtime.context.KinkyDungeonGetRestraintByName(id));
            const group = definitions[0].Group;
            for (const id of clickedOrder) {
                runtime.loose.set(id, { name: id, quantity: 1 });
                assert.equal(runtime.nativeInventoryEquip(runtime.context.KinkyDungeonGetRestraintByName(id)), true);
                runtime.flushScheduled();
            }
            let current = runtime.equipment.get(group);
            const equippedNames = [];
            while (current) {
                equippedNames.push(current.name);
                current = current.dynamicLink;
            }
            assert.deepEqual(equippedNames, [...chain].reverse());
            assert.equal(runtime.loose.size, 0);
            for (let index = 0; index < definitions.length - 1; index += 1) {
                assert.ok(definitions[index].LinkableBy.some((tag) => definitions[index + 1].shrine.includes(tag)));
                assert.ok(definitions[index + 1].LinkableBy.some((tag) => definitions[index].shrine.includes(tag)));
            }
        }
    }
});

test("Lv3 blocks player removal of covered same-group layers until the outer layer is removed", () => {
    const chains = [
        ...lv2Families.map((family) => [1, 2, 3].map((stage) => `SpiderlingsWebbingLv${stage}${family}`)),
        ["SpiderlingsWebbingLv1Blindfold", "SpiderlingsWebbingLv3Blindfold", "SpiderlingsWebbingLv3Hood"],
        ["SpiderlingsWebbingLv1Stuffing", "SpiderlingsWebbingLv1Gag", "SpiderlingsWebbingLv3Gag"],
    ];
    for (const chain of chains) {
        for (const method of ["Cut", "Struggle", "Remove"]) {
            const runtime = loadLifecycleRuntime();
            const group = runtime.context.KinkyDungeonGetRestraintByName(chain[0]).Group;
            for (const id of chain) assert.equal(runtime.context.Spiderlings.Webbing.equipForDebug(id).applied, true);
            const root = runtime.equipment.get(group);
            for (const index of [1, 2]) {
                assert.equal(runtime.context.KDInputTypes.struggle({ group, type: method, index }), "Blocked");
            }
            assert.equal(runtime.nativeStruggleInputs.length, 0);
            assert.equal(runtime.context.KDInputTypes.struggle({ group, type: method, index: 0 }), "NativeStruggle");
            assert.equal(runtime.context.KinkyDungeonRemoveRestraintSpecific(root, true).length, 1);
            assert.equal(runtime.context.KDInputTypes.struggle({ group, type: method, index: 0 }), "NativeStruggle");
            assert.equal(runtime.equipment.get(group).name, chain[1]);
        }
    }
});

test("native HUD and context-menu lists hide covered actions and restore them as each outer layer is removed", () => {
    const nativeSource = fs.readFileSync(
        path.join(modRoot, "..", "KinkiestDungeon-5.5/Game/src/restraint/KDStruggleGroups.ts"),
        "utf8",
    );
    const selectors = ["KDGetStruggleButtons", "KDGetStruggleContextMenu"]
        .map((name) => nativeSource.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0])
        .join("\n");
    const chains = [
        ...lv2Families.map((family) => [1, 2, 3].map((stage) => `SpiderlingsWebbingLv${stage}${family}`)),
        ["SpiderlingsWebbingLv1Blindfold", "SpiderlingsWebbingLv3Blindfold", "SpiderlingsWebbingLv3Hood"],
        ["SpiderlingsWebbingLv1Stuffing", "SpiderlingsWebbingLv1Gag", "SpiderlingsWebbingLv3Gag"],
    ];
    for (const chain of chains) {
        const runtime = loadLifecycleRuntime({ KDToggles: { StruggleContext: false } }, (context) => {
            vm.runInContext(stripTypeScriptTypes(selectors), context);
        });
        const context = runtime.context;
        const group = context.KinkyDungeonGetRestraintByName(chain[0]).Group;
        for (const id of chain) assert.equal(context.Spiderlings.Webbing.equipForDebug(id).applied, true);
        const inner = context.KDDynamicLinkListSurface(runtime.equipment.get(group));
        for (const item of inner.slice(1)) {
            for (const compact of [false, true]) {
                context.KDToggles.StruggleContext = compact;
                assert.deepEqual(plain(context.KDGetStruggleButtons({ item, sg: { group } })), []);
            }
            assert.deepEqual(
                plain(context.KDGetStruggleContextMenu(item, { group }, { player: true }, { player: true })),
                [],
            );
            assert.ok(context.KDGetStruggleContextMenu(item, { group }, { player: false }, {}).includes("Remove"));
        }
        for (const item of inner) {
            context.KDToggles.StruggleContext = false;
            assert.ok(context.KDGetStruggleButtons({ item, sg: { group } }).includes("Remove"));
            assert.ok(context.KDGetStruggleContextMenu(item, { group }, { player: true }, {}).includes("Cut"));
            context.KinkyDungeonRemoveRestraintSpecific(item, true);
        }
        const unrelated = { name: "ThirdPartyArmWrap" };
        assert.ok(context.KDGetStruggleButtons({ item: unrelated }).includes("Struggle"));
        assert.equal(runtime.nativeStruggleInputs.length, 0, "menu queries spend no actions");
    }
});

test("Cocoon blocks all twenty-three inner restraints before native costs, even when linked beneath another device", () => {
    for (const linked of [false, true]) {
        const runtime = loadLifecycleRuntime();
        const context = runtime.context;
        const api = context.Spiderlings.Webbing;
        const ids = [
            ...families.map((family) => `SpiderlingsWebbingLv1${family}`),
            ...lv2Families.map((family) => `SpiderlingsWebbingLv2${family}`),
            ...lv3Families.map((family) => `SpiderlingsWebbingLv3${family}`),
        ];
        for (const id of ids) assert.equal(api.equipForDebug(id).applied, true);
        assert.equal(api.equipForDebug(api.COCOON_ID).applied, true);
        const cocoon = runtime.equipment.get("ItemDevices");
        if (linked)
            runtime.equipment.set(
                "ItemDevices",
                item("ThirdPartyDevice", { group: "ItemDevices", dynamicLink: cocoon }),
            );
        const before = JSON.stringify([...runtime.equipment]);
        for (const id of ids) {
            const group = context.KinkyDungeonGetRestraintByName(id).Group;
            const chain = context.KDDynamicLinkListSurface(runtime.equipment.get(group));
            const index = chain.findIndex((entry) => entry.name === id);
            assert.equal(
                api.pairedOuterLayerFor(chain[index]),
                cocoon,
                `${id}: Cocoon takes precedence over same-group coverings`,
            );
            for (const type of ["Cut", "Struggle", "Remove"]) {
                assert.equal(context.KDInputTypes.struggle({ group, index, type }), "Blocked", `${id}: ${type}`);
                assert.match(runtime.actionMessages.at(-1)[1], /SpiderlingsWebbingCocoon/);
            }
        }
        assert.equal(
            runtime.nativeStruggleInputs.length,
            0,
            "blocked inputs never enter native turn/resource spending",
        );
        assert.equal(
            JSON.stringify([...runtime.equipment]),
            before,
            "blocked inputs do not alter links or escape/reinforcement progress",
        );
        assert.equal(runtime.actionMessages.length, 69);
        assert.equal(runtime.errorSounds.length, 69);
        for (const type of ["Cut", "Struggle", "Remove"]) {
            assert.equal(
                context.KDInputTypes.struggle({ group: "ItemDevices", index: linked ? 1 : 0, type }),
                "NativeStruggle",
            );
        }
        const unrelated = item("ThirdPartyArmWrap", {
            group: "ItemArms",
            dynamicLink: runtime.equipment.get("ItemArms"),
        });
        runtime.equipment.set("ItemArms", unrelated);
        assert.equal(context.KDInputTypes.struggle({ group: "ItemArms", type: "Remove" }), "NativeStruggle");
        const inner = unrelated.dynamicLink;
        assert.equal(
            context.KinkyDungeonRemoveRestraintSpecific(inner, true).length,
            1,
            "system removal remains available",
        );
        assert.equal(context.KinkyDungeonRemoveRestraintSpecific(cocoon, true).length, 1);
        for (const root of runtime.equipment.values()) {
            assert.equal(
                context.KDInputTypes.struggle({ group: root.group, type: "Remove" }),
                "NativeStruggle",
                root.name,
            );
        }
    }
});

test("Cocoon hides every inner HUD/context action and removing it restores the original per-layer menus", () => {
    const nativeSource = fs.readFileSync(
        path.join(modRoot, "..", "KinkiestDungeon-5.5/Game/src/restraint/KDStruggleGroups.ts"),
        "utf8",
    );
    const selectors = ["KDGetStruggleButtons", "KDGetStruggleContextMenu"]
        .map((name) => nativeSource.match(new RegExp(`function ${name}\\([^]*?\\n\\}`))[0])
        .join("\n");
    const runtime = loadLifecycleRuntime({ KDToggles: { StruggleContext: false } }, (context) => {
        vm.runInContext(stripTypeScriptTypes(selectors), context);
    });
    const context = runtime.context;
    const api = context.Spiderlings.Webbing;
    for (const [stage, list] of [
        [1, families],
        [2, lv2Families],
        [3, lv3Families],
    ]) {
        for (const family of list)
            assert.equal(api.equipForDebug(`SpiderlingsWebbingLv${stage}${family}`).applied, true);
    }
    const inner = context.KinkyDungeonAllRestraintDynamic().map((entry) => entry.item);
    assert.equal(inner.length, 23);
    const menus = (item) => {
        const result = [];
        for (const compact of [false, true]) {
            context.KDToggles.StruggleContext = compact;
            result.push(plain(context.KDGetStruggleButtons({ item, sg: { group: item.group } })));
        }
        result.push(plain(context.KDGetStruggleContextMenu(item, { group: item.group }, { player: true }, {})));
        return result;
    };
    const baseline = inner.map(menus);
    assert.equal(api.equipForDebug(api.COCOON_ID).applied, true);
    const cocoon = runtime.equipment.get("ItemDevices");
    for (const item of inner) {
        assert.deepEqual(menus(item), [[], [], []], item.name);
        assert.ok(
            context.KDGetStruggleContextMenu(item, { group: item.group }, { player: false }, {}).includes("Remove"),
        );
    }
    assert.ok(menus(cocoon)[0].includes("Remove"), "Cocoon itself remains operable");
    assert.equal(context.KinkyDungeonRemoveRestraintSpecific(cocoon, true).length, 1);
    assert.deepEqual(
        inner.map(menus),
        baseline,
        "removing Cocoon restores same-group gates, including independently operable mittens and the outer Hood",
    );
    assert.equal(runtime.nativeStruggleInputs.length, 0, "menu queries spend no actions");
});

test("Lv3 native escape shares two actions across methods and ignores queries, failed prerequisites, and duplicate Fail events", () => {
    const runtime = loadLifecycleRuntime({ KinkyDungeonHasStamina: () => true });
    const api = runtime.context.Spiderlings.Webbing;
    assert.equal(api.equipForDebug("SpiderlingsWebbingLv3Arm").applied, true);
    const target = runtime.equipment.get("ItemArms");
    const before = runtime.inventoryEvents[`beforeStruggleCalc:${api.LV3_ESCAPE_EVENT}`];
    const after = runtime.inventoryEvents[`struggle:${api.LV3_ESCAPE_EVENT}`];
    const attempt = (method, extra = {}) => ({
        restraint: target,
        struggleType: method,
        struggleGroup: "ItemArms",
        cost: -0.2,
        escapeChance: 100,
        escapePenalty: 0,
        ...extra,
    });
    for (const extra of [{ query: true }, { canCut: false }]) {
        before({}, target, attempt("Cut", extra));
        after({}, target, { ...attempt("Cut"), result: "Fail" });
        assert.equal(target.data.SpiderlingsEscapeActions, undefined);
    }
    runtime.context.KinkyDungeonHasStamina = () => false;
    before({}, target, attempt("Struggle"));
    after({}, target, { ...attempt("Struggle"), result: "Fail" });
    assert.equal(target.data.SpiderlingsEscapeActions, undefined);
    runtime.context.KinkyDungeonHasStamina = () => true;
    runtime.context.KDGroupBlocked = () => true;
    before({}, target, attempt("Struggle"));
    after({}, target, { ...attempt("Struggle"), result: "Fail" });
    assert.equal(target.data.SpiderlingsEscapeActions, undefined);
    runtime.context.KDGroupBlocked = () => false;
    for (const [index, method] of ["Struggle"].entries()) {
        const data = attempt(method);
        before({}, target, data);
        assert.equal(data.escapeChance, 0);
        after({}, target, { ...data, result: "Fail" });
        after({}, target, { ...data, result: "Fail" });
        assert.equal(target.data.SpiderlingsEscapeActions, index + 1);
    }
    const final = attempt("Remove");
    before({}, target, final);
    assert.equal(target.cutProgress, 1);
    assert.equal(final.escapeChance, 1);
    assert.ok(final.escapePenalty < 0);
    const finalHandler = runtime.inventoryEvents[`beforeSuccessRemove:${api.FINAL_ESCAPE_EVENT}`];
    finalHandler({}, target, final);
    assert.equal(final.destroyChance, 0);
    const cut = { ...final, struggleType: "Cut" };
    finalHandler({}, target, cut);
    assert.equal(cut.destroyChance, 1);
});

test("physical inspection includes all eight Lv3 items required by enemy Cocoon progression", () => {
    const runtime = loadLifecycleRuntime();
    const api = runtime.context.Spiderlings.Webbing;
    const items = runtime.context.KinkyDungeonRestraints.map((definition) => ({ name: definition.name }));
    const inspected = api.resolveWebbingAction({ snapshot: { items }, action: { type: "inspectPhysical" } }).outcome;
    assert.equal(inspected.lv3Count, 8);
    assert.equal(inspected.lv3Complete, true);
    assert.equal(inspected.physicalInnerCount, 23);
    assert.equal(inspected.terminalLayerCount, 24);
    const priorStages = items.filter((entry) => /^SpiderlingsWebbingLv[12]/.test(entry.name));
    const resolve = (stacks, equipped = priorStages) =>
        api.resolveWebbingAction({
            snapshot: { items: equipped, webSpray: { stacks } },
            action: { type: "enemyBind", profile: "WebCaster", random: () => 0 },
        }).outcome;
    assert.equal(resolve(0).selectedId, "SpiderlingsWebbingLv3Arm");
    assert.equal(resolve(5).selectedId, "SpiderlingsWebbingLv3Arm");
    assert.equal(
        resolve(
            5,
            items.filter((entry) => entry.name !== api.COCOON_ID),
        ).selectedId,
        api.COCOON_ID,
    );
});

test("physical Spiderlings items expose no defeat, capture, or prison cleanup path", () => {
    const runtime = loadLifecycleRuntime();
    const restraints = runtime.context.KinkyDungeonRestraints.filter((entry) =>
        /^SpiderlingsWebbingLv[123]/.test(entry.name),
    );
    const registeredCocoon = runtime.context.KinkyDungeonGetRestraintByName("SpiderlingsWebbingCocoon");
    assert.equal(restraints.length, 23);
    assert.ok(registeredCocoon);
    assert.equal(runtime.context.KinkyDungeonRestraints.filter((entry) => /WebbingLv2/.test(entry.name)).length, 5);
    const lv1 = item("SpiderlingsWebbingLv1Arm", { group: "ItemArms", data: { persistent: "lv1" } });
    const lv2 = item("SpiderlingsWebbingLv2Arm", { group: "ItemArms", data: { persistent: "lv2" }, dynamicLink: lv1 });
    const cocoon = item("SpiderlingsWebbingCocoon", { group: "ItemDevices", data: { persistent: "cocoon" } });
    runtime.equipment.set("ItemArms", lv2);
    runtime.equipment.set("ItemDevices", cocoon);

    for (const restraint of [...restraints, registeredCocoon]) {
        for (const field of [
            "removePrison",
            "forceRemovePrison",
            "removeOnLeash",
            "removeOnDefeat",
            "removeOnCapture",
        ]) {
            assert.equal(field in restraint, false, `${restraint.name} must not declare ${field}`);
        }
        const triggers = (restraint.events || []).map((event) => event.trigger);
        for (const trigger of ["defeat", "capture", "prison", "jail"]) assert.equal(triggers.includes(trigger), false);
    }
    for (const flow of ["defeat", "capture", "prison"])
        runtime.dispatchInventoryFlow(flow, { player: runtime.context.KinkyDungeonPlayerEntity });
    assert.equal(runtime.equipment.get("ItemArms"), lv2);
    assert.equal(lv2.dynamicLink, lv1);
    assert.equal(runtime.equipment.get("ItemDevices"), cocoon);
    assert.deepEqual(lv1.data, { persistent: "lv1" });
    assert.deepEqual(lv2.data, { persistent: "lv2" });
    assert.deepEqual(cocoon.data, { persistent: "cocoon" });
});
