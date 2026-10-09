"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsWeaponWebbing.js"), "utf8");
const KEY = "SpiderlingsWeaponWebbing";

function fixture() {
    const events = {},
        restraints = {},
        changes = [],
        rewards = [];
    let serial = 100,
        blocked;
    const enemy = { id: 1, hp: 20, boundLevel: 0, specialBoundLevel: {}, Enemy: { maxhp: 20 } };
    const c = {
        Spiderlings: {
            Weapons: {
                rewardHit: (data, effective, cocoon) => {
                    rewards.push({ effective, cocoon, id: data.enemy.id });
                    return true;
                },
                resolveName: (name) =>
                    ({ SpiderlingsSilkenBindingTome: "SpiderlingTome", SpiderlingsSilkweaverStaff: "SpiderlingStaff" })[
                        name
                    ] || name,
            },
        },
        KDAddEntity: (enemy) => enemy,
        KDMapData: { Entities: [enemy] },
        KDEventMapGeneric: {},
        KDAddEvent: (_map, event, _key, handler) => {
            events[event] = handler;
        },
        KDGetNPCRestraints: () => restraints,
        KDSetNPCRestraint: (_id, slot, item) => {
            changes.push({ slot, item });
            if (item) restraints[slot] = item;
            else delete restraints[slot];
        },
        KDCanBind: () => true,
        KDHelpless: (e) => e.boundLevel > 30,
        KDGetBindEffectMult: () => 1,
        KDNPCStruggleThreshMult: () => 1.5,
        KinkyDungeonGetRestraintByName: (name) => ({ name }),
        KDCanEquipItemOnNPC: () => "",
        KDGetBlockersToAddRestraint: (r) => (r.name.endsWith(blocked || "!") ? [{ name: "Existing" }] : []),
        KDGetNPCBindingSlotForItem: (r) => ({ row: {}, sgroup: { id: r.name, encasedBy: [] } }),
        KDNPCRestraintSize: () => 1,
        KDNPCRestraintValidLayers: (_r, slot) => [slot],
        KDGetRestraintBondageStats: () => ({ type: "Slime", amount: 4 }),
        KDGetExpectedBondageAmount: () => ({ Slime: Object.values(restraints).filter((r) => r.conjured).length * 4 }),
        KinkyDungeonGetItemID: () => ++serial,
        KDEntityRestraintMetadata: new Map(),
        KDUpdateRestraintMetadata: () => ({}),
        KDUpdatePersistentNPC: () => {},
        KDAllied: (e) => e.allied,
        KDHostile: () => true,
    };
    vm.runInNewContext(source, c);
    function hit(kind, amount, extra = {}) {
        const data = {
            enemy,
            attacker: { player: true },
            weapon: {
                name: kind === "tome" ? "SpiderlingTome" : kind === "staff" ? "SpiderlingStaff" : "StaffGlue",
            },
            ...extra,
        };
        events.beforeDamageEnemy(null, data);
        enemy.specialBoundLevel.Slime = (enemy.specialBoundLevel.Slime || 0) + amount;
        enemy.boundLevel += amount;
        events.afterDamageEnemy(null, data);
    }
    return {
        c,
        enemy,
        events,
        restraints,
        changes,
        rewards,
        hit,
        block: (family) => {
            blocked = family;
        },
    };
}

test("only actual player weapon silk is attributed; staff never creates a tome set", () => {
    const f = fixture();
    f.hit("other", 100);
    f.hit("tome", 0);
    assert.equal(f.enemy[KEY], undefined);
    f.hit("staff", 20);
    assert.equal(f.enemy[KEY].staff, 20);
    assert.equal(f.changes.length, 0);
    f.hit("tome", 3);
    assert.equal(f.enemy[KEY].tome, 3);
    assert.equal(f.changes.length, 0, "unrelated slime must not pay for a full set");
});

test("complete tome silk is a cocoon without equipment or pose mutations", () => {
    const f = fixture();
    const original = { name: "OtherArmbinder", id: 42, lock: "Red" };
    f.restraints.arms = original;
    f.hit("tome", 40);
    assert.equal(f.c.Spiderlings.WeaponWebbing.status(f.enemy).cocoon, true);
    assert.equal(f.enemy[KEY].items.length, 0);
    assert.equal(f.changes.length, 0);
    assert.equal(f.restraints.arms, original);
    assert.equal(f.events.afterDress, undefined);
    assert.equal(f.enemy.boundLevel, 40);
});

test("legacy cleanup requires matching ledger identity, conjured flag and known silk name", () => {
    const f = fixture();
    f.enemy.specialBoundLevel.Slime = f.enemy.boundLevel = 40;
    f.enemy[KEY] = {
        version: 1,
        tome: 40,
        staff: 0,
        lastSlime: 40,
        items: [
            { id: 10, amount: 4 },
            { id: 11, amount: 4 },
            { id: 12, amount: 4 },
        ],
    };
    f.restraints.remove = { id: 10, name: "SpiderlingsWebbingLv1Arm", conjured: true };
    f.restraints.manual = { id: 11, name: "SpiderlingsWebbingLv1Legs", conjured: false };
    f.restraints.other = { id: 12, name: "OtherArmbinder", conjured: true };
    f.restraints.unregistered = { id: 13, name: "SpiderlingsWebbingLv1Belly", conjured: true };
    f.events.afterLoadGame();
    assert.equal(f.restraints.remove, undefined);
    assert.equal(Object.keys(f.restraints).length, 3);
    assert.equal(f.enemy[KEY].items.length, 0);
    assert.equal(f.enemy.specialBoundLevel.Slime, 40);
    assert.equal(f.enemy.boundLevel, 40);
    const count = f.changes.length;
    f.events.afterLoadGame();
    assert.equal(f.changes.length, count);
});

test("allied, non-player, resisted and lethal hits cannot create weapon silk", () => {
    const f = fixture();
    f.hit("tome", 10, { attacker: {} });
    f.enemy.allied = true;
    f.hit("tome", 10);
    f.enemy.allied = false;
    f.hit("tome", 0);
    f.enemy.hp = 0;
    f.hit("tome", 100);
    assert.equal(f.enemy[KEY], undefined);
    assert.equal(f.changes.length, 0);
});

test("death clears owned material without generating or removing unrelated equipment", () => {
    const f = fixture();
    f.hit("tome", 40);
    f.restraints.manual = { id: 17, name: "SpiderlingsWebbingLv1Arm" };
    f.enemy.hp = 0;
    f.events.tickAfter(null, { delta: 1 });
    assert.equal(f.enemy[KEY], undefined);
    assert.equal(Object.keys(f.restraints).length, 1);
});

test("both weapons form a cocoon only when their surviving silk alone meets native helpless thresholds", () => {
    for (const kind of ["tome", "staff"]) {
        const f = fixture();
        f.hit(kind, 20);
        assert.equal(
            f.c.Spiderlings.WeaponWebbing.status(f.enemy).cocoon,
            false,
            "Fully bound but still struggling is not helpless",
        );
        f.hit(kind, 11);
        assert.equal(f.c.Spiderlings.WeaponWebbing.status(f.enemy).cocoon, true);
        f.enemy.specialBoundLevel.Slime -= 2;
        f.enemy.boundLevel -= 2;
        const before = JSON.stringify({ enemy: f.enemy, restraints: f.restraints });
        assert.equal(f.c.Spiderlings.WeaponWebbing.status(f.enemy).cocoon, false);
        assert.equal(
            JSON.stringify({ enemy: f.enemy, restraints: f.restraints }),
            before,
            "A draw query changed saved gameplay",
        );
        f.events.tickAfter(null, { delta: 0 });
        assert.equal(
            JSON.stringify({ enemy: f.enemy, restraints: f.restraints }),
            before,
            "Zero-time refresh changed silk",
        );
    }
    const mixed = fixture();
    mixed.hit("other", 100);
    mixed.hit("staff", 2);
    assert.equal(
        mixed.c.Spiderlings.WeaponWebbing.status(mixed.enemy).cocoon,
        false,
        "Other Slime cannot pay for the cocoon",
    );
    mixed.hit("tome", 29);
    assert.equal(
        mixed.c.Spiderlings.WeaponWebbing.status(mixed.enemy).cocoon,
        true,
        "Owned tome and staff silk may combine",
    );
    assert.equal(mixed.enemy[KEY].items.length, 0, "Staff silk cannot pay for tome-only physical pieces");
});

test("later unrelated Slime cannot hide native recovery of weapon silk before the next tick", () => {
    const f = fixture();
    f.hit("staff", 31);
    assert.equal(f.c.Spiderlings.WeaponWebbing.status(f.enemy).cocoon, true);
    f.hit("other", 100);
    f.enemy.specialBoundLevel.Slime -= 40;
    f.enemy.boundLevel -= 40;
    assert.equal(f.c.KDHelpless(f.enemy), true, "The NPC is still helpless from unrelated Slime");
    assert.equal(
        f.c.Spiderlings.WeaponWebbing.status(f.enemy),
        undefined,
        "Other Slime concealed recovery of owned silk",
    );
});

test("HP-only and lethal effective native hits qualify; shield damage alone does not", () => {
    const f = fixture();
    f.hit("tome", 0, { dmgDealt: 1 });
    assert.equal(f.rewards.length, 1);
    f.hit("staff", 0, { dmgDealt: 0, dmgShieldDealt: 20 });
    assert.equal(f.rewards.length, 1);
    const data = { enemy: f.enemy, attacker: { player: true }, weapon: { name: "SpiderlingStaff" }, dmgDealt: 20 };
    f.events.beforeDamageEnemy(null, data);
    f.enemy.hp = 0;
    f.events.afterDamageEnemy(null, data);
    assert.equal(f.rewards.length, 2);
    assert.equal(f.enemy[KEY], undefined);
});

test("first owned cocoon marker survives native recovery, save and weapon switching", () => {
    const f = fixture();
    f.hit("tome", 40);
    assert.equal(f.rewards.filter((r) => r.cocoon).length, 1);
    f.enemy.specialBoundLevel.Slime = f.enemy.boundLevel = 0;
    f.events.tickAfter(null, { delta: 1 });
    f.enemy.SpiderlingsWeaponCocoonRewarded = JSON.parse(JSON.stringify(f.enemy.SpiderlingsWeaponCocoonRewarded));
    f.hit("staff", 40);
    assert.equal(f.rewards.filter((r) => r.cocoon).length, 1);
});

test("released player-created summons retain reward exclusion", () => {
    const f = fixture();
    f.enemy.summoned = true;
    f.enemy.faction = "Player";
    f.c.KDAddEntity(f.enemy);
    f.enemy.faction = "Enemy";
    f.hit("tome", 40, { dmgDealt: 1 });
    assert.equal(f.rewards.length, 0);
    assert.equal(f.c.Spiderlings.WeaponWebbing.status(f.enemy).cocoon, true);
});
