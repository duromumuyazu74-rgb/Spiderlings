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
        changes = [];
    let serial = 100,
        blocked;
    const enemy = { id: 1, hp: 20, boundLevel: 0, specialBoundLevel: {}, Enemy: { maxhp: 20 } };
    const c = {
        Spiderlings: {
            Weapons: {
                resolveName: (name) =>
                    ({ SpiderlingsSilkenBindingTome: "SpiderlingTome", SpiderlingsSilkweaverStaff: "SpiderlingStaff" })[
                        name
                    ] || name,
            },
        },
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

test("tome silk becomes four conjured native pieces without adding binding or replacing equipment", () => {
    const f = fixture();
    const original = { name: "Existing", id: 42, lock: "Red" };
    f.restraints.other = original;
    f.hit("tome", 40);
    assert.equal(f.enemy.boundLevel, 40);
    assert.equal(f.enemy.specialBoundLevel.Slime, 40);
    assert.equal(f.enemy[KEY].items.length, 4);
    assert.equal(f.restraints.other, original);
    assert.ok(f.changes.every((change) => change.item.conjured && change.item.lock === ""));
    const ids = f.enemy[KEY].items.map((item) => item.id);
    f.hit("tome", 4);
    assert.deepEqual(
        f.enemy[KEY].items.map((item) => item.id),
        ids,
    );
});

test("blocked and occupied native slots retain their exact item", () => {
    const f = fixture();
    const original = { name: "OtherArmbinder", id: 42, lock: "Red" };
    f.restraints.SpiderlingsWebbingLv1Arm = original;
    f.block("Belly");
    f.hit("tome", 40);
    assert.equal(f.enemy[KEY].items.length, 2);
    assert.equal(f.restraints.SpiderlingsWebbingLv1Arm, original);
});

test("a restraint in another native slot of the same body group keeps its pose and identity", () => {
    const f = fixture();
    const original = { name: "OtherArmbinder", id: 42, lock: "Red" };
    f.restraints.differentSlot = original;
    f.c.KinkyDungeonGetRestraintByName = (name) => ({
        name,
        Group: name === "OtherArmbinder" || name.endsWith("Arm") ? "ItemArms" : name,
    });
    f.hit("tome", 40);
    assert.equal(f.enemy[KEY].items.length, 3);
    assert.equal(f.restraints.differentSlot, original);
    assert.ok(!f.changes.some((change) => change.item?.name.endsWith("Arm")));
});

test("native dressing applies silk poses only while the owned physical pieces remain", () => {
    const f = fixture();
    const character = {},
        mc = { Poses: { Boxtie: true, Spread: true } };
    f.c.KDNPCChar_ID = new Map([[character, 1]]);
    f.c.KDGetGlobalEntity = () => f.enemy;
    f.c.KDCurrentModels = new Map([[character, mc]]);
    f.hit("tome", 40);
    f.events.afterDress(null, { Character: character });
    assert.deepEqual(mc.Poses, { Wristtie: true, Closed: true, FeetLinked: true });
    for (const slot of Object.keys(f.restraints)) delete f.restraints[slot];
    mc.Poses = { Boxtie: true, Spread: true };
    f.events.afterDress(null, { Character: character });
    assert.deepEqual(mc.Poses, { Boxtie: true, Spread: true });
});

test("struggle removes only unsupported owned pieces and saved state restores without issuing a set", () => {
    const f = fixture();
    f.hit("other", 100);
    f.hit("tome", 40);
    f.enemy[KEY] = JSON.parse(JSON.stringify(f.enemy[KEY]));
    const ids = f.enemy[KEY].items.map((item) => item.id);
    f.events.afterLoadGame();
    assert.deepEqual(
        f.enemy[KEY].items.map((item) => item.id),
        ids,
    );
    f.enemy.specialBoundLevel.Slime = 110;
    f.enemy.boundLevel = 110;
    f.events.tickAfter(null, { delta: 1 });
    assert.equal(f.enemy[KEY].tome, 10);
    assert.equal(f.enemy[KEY].items.length, 2);
    assert.equal(f.enemy.boundLevel, 110, "already-paid native struggle must not be debited again");
    f.enemy.specialBoundLevel.Slime = 100;
    f.events.tickAfter(null, { delta: 1 });
    assert.equal(f.enemy[KEY], undefined);
    assert.equal(Object.keys(f.restraints).length, 0);
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

test("native removal is respected and death clears remaining conjured silk", () => {
    const f = fixture();
    f.hit("tome", 40);
    delete f.restraints.SpiderlingsWebbingLv1Arm;
    f.events.tickAfter(null, { delta: 1 });
    assert.equal(f.enemy[KEY].items.length, 3);
    assert.equal(f.restraints.SpiderlingsWebbingLv1Arm, undefined);
    f.enemy.hp = 0;
    f.events.tickAfter(null, { delta: 1 });
    assert.equal(f.enemy[KEY], undefined);
    assert.equal(Object.keys(f.restraints).length, 0);
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
