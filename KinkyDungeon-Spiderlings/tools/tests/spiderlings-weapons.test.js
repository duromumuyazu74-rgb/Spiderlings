"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../../SpiderlingsWeapons.js"), "utf8");
const TOME = "SpiderlingTome",
    STAFF = "SpiderlingStaff";
const CONVERGENCE = "SpiderlingsCocoonConvergence",
    SNARE = "SpiderlingsSilkenSnare";

function fixture() {
    const events = {},
        hits = [],
        inventory = new Map();
    let random = 0,
        mana = 20,
        stamina = 10,
        manaGain = 0,
        nativeFail = false,
        wall = false,
        visible = true;
    const c = {
        Map,
        Weapon: "weapon",
        Spiderlings: {
            registerNamed: (array, entry) => array.push(entry),
            MageSpells: {
                collapseDistance: (x, y, target) => {
                    const dx = Math.abs(x - target.x),
                        dy = Math.abs(y - target.y);
                    return dx > 2 || dy > 2 || (dx === 2 && dy === 2) ? -1 : Math.max(dx, dy);
                },
            },
        },
        KDGameData: {},
        KDMapData: { Entities: [], GroundItems: [] },
        KDWorldMap: {},
        KDPersistentNPCs: {},
        KinkyDungeonTargetX: 0,
        KinkyDungeonTargetY: 0,
        KinkyDungeonActivateWeaponSpell: (instant) =>
            instant
                ? c.KinkyDungeonCastSpell(
                      c.KinkyDungeonTargetX,
                      c.KinkyDungeonTargetY,
                      c.KinkyDungeonSpellListEnemies.find((spell) => spell.name === CONVERGENCE),
                      undefined,
                      c.KinkyDungeonPlayerEntity,
                  )
                : true,
        KinkyDungeonDrawActionBar: () => "native-actionbar",
        MouseIn: () => false,
        KinkyDungeonWeapons: {},
        KinkyDungeonWeaponVariants: {},
        KinkyDungeonWeaponChoices: [],
        KinkyDungeonLostItems: [],
        KinkyDungeonPlayerBuffs: {},
        KinkyDungeonPlayerWeapon: "Knife",
        KinkyDungeonInventory: new Map([["weapon", inventory]]),
        KinkyDungeonInventoryAddWeapon: (name, container) => {
            const item = { name, type: "weapon", id: 42, events: c.KinkyDungeonWeapons[name]?.events };
            if (container) container.items[name] ||= item;
            else if (!inventory.has(name)) inventory.set(name, item);
        },
        KDSetWeapon: (name, forced) => {
            c.KinkyDungeonPlayerWeapon = name;
            if (!forced) c.KDGameData.PlayerWeaponLastEquipped = name;
        },
        KinkyDungeonCanUseWeapon: () => true,
        KinkyDungeonGetPlayerWeaponDamage: () => {
            c.KinkyDungeonPlayerDamage =
                c.KinkyDungeonWeapons[
                    c.KinkyDungeonWeaponVariants[c.KinkyDungeonPlayerWeapon]?.template || c.KinkyDungeonPlayerWeapon
                ];
        },
        KDPrereqs: {},
        KinkyDungeonSpellSpecials: {},
        KinkyDungeonSpellListEnemies: [],
        KinkyDungeonPlayerEntity: { player: true, x: 5, y: 5 },
        KDEventMapGeneric: {},
        KDAddEvent: (_map, name, _key, handler) => {
            events[name] = handler;
        },
        KDHostile: (target) => target.hostile,
        KDAllied: (target) => target.allied,
        KinkyDungeonHasMana: (cost) => mana >= cost,
        KinkyDungeonGetManaCost: (spell) => spell.manacost,
        KDChangeMana: (src, type, trig, amount) => {
            const data = { src, type, trig, Amount: amount, mult: amount > 0 ? 1 + manaGain : 1 };
            events.changeMana?.(null, data);
            mana = Math.min(20, Math.max(0, mana + data.Amount * data.mult));
        },
        KDChangeStamina: (_src, _type, _trig, amount) => {
            stamina = Math.min(10, Math.max(0, stamina + amount));
        },
        KinkyDungeonTransparentObjects: "0",
        KinkyDungeonMapGet: () => "0",
        KinkyDungeonCheckPath: () => !wall,
        KinkyDungeonVisionGet: () => Number(visible),
        KinkyDungeonUpdateSingleBulletVisual() {},
        KinkyDungeonCastSpell: (x, y, spell) => {
            if (nativeFail) return { result: "Fail" };
            c.KinkyDungeonSpellSpecials[spell.special]?.(spell, {}, x, y, x, y);
            c.KDChangeMana(spell.name, "spell", "cast", -c.KinkyDungeonGetManaCost(spell));
            return { result: "Cast", data: { bulletfired: { bullet: { spell } } } };
        },
        KDBulletCanHitEntity: () => true,
        KDBulletAoECanHitEntity: () => true,
        KinkyDungeonDamageEnemy: (target, damage, _ranged, _nomsg, spell, _bullet, attacker) =>
            hits.push({ target, damage, spell, attacker }),
        KinkyDungeonGetImmunity: (tags, _profile, type, kind) => tags[type + kind],
        KinkyDungeonSendEvent() {},
        addTextKey() {},
        KDRandom: () => random,
        KinkyDungeonInventoryGetWeapon: (name, container) => (container ? container.items[name] : inventory.get(name)),
        KinkyDungeonInventoryGet: (name, container) => (container ? container.items[name] : inventory.get(name)),
        KinkyDungeonInventoryGetSafe: (name, container) => (container ? container.items[name] : inventory.get(name)),
        KinkyDungeonFindWeapon: (name) => Object.values(c.KinkyDungeonWeapons).find((weapon) => weapon.name === name),
        KDDropItems: (enemy) => {
            if (!enemy.noDrop && (enemy.playerdmg || !enemy.summoned) && !enemy.droppedItems) enemy.droppedItems = true;
        },
    };
    Object.defineProperties(c, {
        KinkyDungeonStatMana: { get: () => mana },
        KinkyDungeonStatStamina: { get: () => stamina },
    });
    vm.createContext(c);
    vm.runInContext(source, c);
    const enemy = (x = 7, y = 7, extra = {}) => ({
        x,
        y,
        hp: 100,
        hostile: true,
        Enemy: { name: "Maidforce", tags: {} },
        ...extra,
    });
    const cast = (name = CONVERGENCE, x = 7, y = 7) => {
        c.KDSetWeapon(name === CONVERGENCE ? TOME : STAFF);
        return c.KinkyDungeonCastSpell(
            x,
            y,
            c.KinkyDungeonSpellListEnemies.find((s) => s.name === name),
            undefined,
            c.KinkyDungeonPlayerEntity,
        );
    };
    return {
        c,
        events,
        hits,
        inventory,
        enemy,
        cast,
        tick: () => events.tickAfter(null, { delta: 1 }),
        mana: () => mana,
        stamina: () => stamina,
        setStamina: (value) => (stamina = value),
        manaGain: (value) => (manaGain = value),
        nativeFail: (value) => (nativeFail = value),
        setMana: (value) => (mana = value),
        random: (value) => (random = value),
        wall: (value) => (wall = value),
        visible: (value) => (visible = value),
    };
}

test("Convergence pays 4 mana once, waits two subsequent actions and survives a state round trip", () => {
    const r = fixture();
    r.c.KDMapData.Entities.push(r.enemy());
    assert.equal(r.cast().result, "Cast");
    assert.equal(r.mana(), 16);
    r.tick(); // casting action
    r.c.KDGameData = JSON.parse(JSON.stringify(r.c.KDGameData));
    r.c.KDMapData = JSON.parse(JSON.stringify(r.c.KDMapData));
    r.c.KinkyDungeonPlayerEntity.x = 12;
    r.c.KinkyDungeonPlayerWeapon = STAFF;
    r.tick();
    assert.equal(r.hits.length, 0);
    r.tick();
    assert.equal(r.hits.length, 1);
    assert.equal(r.hits[0].damage.bind, 24);
    assert.equal(r.hits[0].attacker, r.c.KinkyDungeonPlayerEntity);
    r.tick();
    assert.equal(r.hits.length, 1);
    assert.equal(r.c.Spiderlings.Weapons.remaining(CONVERGENCE), 4);
});

test("Convergence resolves precisely 21 tiles, with 12/8/1 ring strengths, excluding allies and player", () => {
    const r = fixture();
    for (let y = 4; y <= 10; y++) for (let x = 4; x <= 10; x++) r.c.KDMapData.Entities.push(r.enemy(x, y));
    r.c.KDMapData.Entities.push(
        r.enemy(7, 7, { allied: true }),
        r.enemy(7, 7, { hostile: false }),
        r.c.KinkyDungeonPlayerEntity,
    );
    r.cast();
    r.tick();
    r.tick();
    r.tick();
    assert.equal(r.hits.length, 21);
    for (const [damage, bind, count] of [
        [2, 8, 12],
        [4, 16, 8],
        [6, 24, 1],
    ])
        assert.equal(r.hits.filter((h) => h.damage.damage === damage && h.damage.bind === bind).length, count);
});

test("Invalid casts cost nothing; walls block propagation and map changes clear pending casts only", () => {
    const r = fixture();
    assert.equal(r.cast(CONVERGENCE, 12, 5).result, "Fail");
    r.visible(false);
    assert.equal(r.cast().result, "Fail");
    r.visible(true);
    r.wall(true);
    assert.equal(r.cast().result, "Fail");
    r.wall(false);
    r.setMana(3);
    assert.equal(r.cast().result, "Fail");
    r.setMana(20);
    r.c.KDMapData.Entities.push(r.enemy());
    r.cast();
    assert.equal(r.cast().result, "Fail");
    assert.equal(r.mana(), 16);
    r.wall(true);
    r.tick();
    r.tick();
    r.tick();
    assert.equal(r.hits.length, 0);
    r.events.postMapgen();
    assert.equal(r.c.Spiderlings.Weapons.remaining(CONVERGENCE), 5);
    assert.equal(r.c.Spiderlings.Weapons.visualState().collapses.length, 0);
    for (let i = 0; i < 5; i++) r.tick();
    assert.equal(r.c.Spiderlings.Weapons.remaining(CONVERGENCE), 0);
});

test("Snare pays 2 mana, reuses Mage art and excludes nonhostile collision targets", () => {
    const r = fixture();
    const result = r.cast(SNARE);
    assert.equal(r.mana(), 18);
    assert.equal(result.data.bulletfired.bullet.name, "SpiderlingsMageBolt");
    assert.equal(r.cast(SNARE).result, "Fail");
    for (const predicate of [r.c.KDBulletCanHitEntity, r.c.KDBulletAoECanHitEntity]) {
        assert.equal(predicate(result.data.bulletfired, r.enemy()), true);
        for (const target of [
            r.enemy(7, 7, { allied: true }),
            r.enemy(7, 7, { hostile: false }),
            r.c.KinkyDungeonPlayerEntity,
        ])
            assert.equal(predicate(result.data.bulletfired, target), false);
    }
    r.tick();
    r.tick();
    r.tick();
    assert.equal(r.cast(SNARE).result, "Cast");
});

test("Snare applies post-damage slow with native shield and resistance rules", () => {
    const r = fixture();
    for (const [tags, extra, expected] of [
        [{}, {}, 3],
        [{ slowresist: true }, {}, 1],
        [{ glueresist: true }, {}, 1],
        [{ glueimmune: true }, {}, 0],
        [{ unslowable: true }, {}, 0],
        [{}, { shield: 5 }, 0],
    ]) {
        const target = r.enemy(7, 7, { Enemy: { tags }, ...extra });
        r.events.afterDamageEnemy(null, { spell: { name: SNARE }, type: "glue", enemy: target });
        assert.equal(target.slow || 0, expected);
    }
    const target = r.enemy();
    r.events.afterDamageEnemy(null, { spell: { name: SNARE }, type: "glue", enemy: target, blocked: true });
    assert.equal(target.slow, undefined);
});

test("Mage loot has a strict 15% gate and uses the native once-only eligibility", () => {
    for (const roll of [0, 0.149999, 0.15, 0.999]) {
        const r = fixture();
        r.random(roll);
        const mage = r.enemy(7, 7, { Enemy: { name: "MageSpiderlings" } });
        r.c.KDDropItems(mage, r.c.KDMapData);
        r.c.KDDropItems(mage, r.c.KDMapData);
        assert.equal(r.c.KDMapData.GroundItems.length, roll < 0.15 ? 1 : 0);
    }
    for (const props of [{ noDrop: true }, { summoned: true }, { Enemy: { name: "Maidforce" } }]) {
        const r = fixture();
        r.c.KDDropItems(r.enemy(7, 7, { Enemy: { name: "MageSpiderlings" }, ...props }), r.c.KDMapData);
        assert.equal(r.c.KDMapData.GroundItems.length, 0);
    }
});

test("Mage loot selects the missing weapon, and stops when both are owned", () => {
    for (const owned of [[], [TOME], [STAFF], [TOME, STAFF]]) {
        const r = fixture();
        owned.forEach((name) => r.c.KinkyDungeonInventoryAddWeapon(name));
        r.c.KDDropItems(r.enemy(7, 7, { Enemy: { name: "MageSpiderlings" } }), r.c.KDMapData);
        const drop = r.c.KDMapData.GroundItems[0];
        if (owned.length === 2) assert.equal(drop, undefined);
        else assert.equal(drop.name, owned.includes(TOME) ? STAFF : TOME);
    }
});

test("short weapon IDs resolve legacy calls without creating additional listed weapons", () => {
    const r = fixture();
    const old = "SpiderlingsSilkenBindingTome";
    r.c.KinkyDungeonInventoryAddWeapon(old);
    r.c.KDSetWeapon(old);
    assert.deepEqual(Object.keys(r.c.KinkyDungeonWeapons), [TOME, STAFF]);
    assert.equal(r.c.KinkyDungeonWeapons[old], r.c.KinkyDungeonWeapons[TOME]);
    assert.equal(r.c.KinkyDungeonInventoryGetWeapon(old), r.inventory.get(TOME));
    assert.equal(r.c.KinkyDungeonInventoryGet(old), r.inventory.get(TOME));
    assert.equal(r.c.KinkyDungeonInventoryGetSafe(old), r.inventory.get(TOME));
    assert.equal(r.c.KinkyDungeonFindWeapon(old), r.c.KinkyDungeonWeapons[TOME]);
    assert.equal(r.c.KinkyDungeonPlayerWeapon, TOME);
    assert.equal(r.inventory.size, 1);
    assert.equal(r.c.KinkyDungeonWeapons[TOME].damage, 1.5);
    assert.equal(r.c.KinkyDungeonWeapons[TOME].staminacost, 1.5);
    assert.equal(r.c.KinkyDungeonWeapons[TOME].bind, 4);
    assert.equal(r.c.KinkyDungeonWeapons[STAFF].bind, 7);
    assert.equal(r.c.KinkyDungeonWeapons[STAFF].chance, 1.1);
    assert.equal(r.c.KinkyDungeonSpellListEnemies.find((spell) => spell.name === SNARE).bind, 10);
});

test("legacy inventory reload preserves IDs, variants, equipment references and containers", () => {
    const r = fixture();
    const oldTome = "SpiderlingsSilkenBindingTome",
        oldStaff = "SpiderlingsSilkweaverStaff";
    const tome = {
        name: oldTome,
        type: "weapon",
        id: 100,
        events: [{ trigger: "tick", type: "Buff", kind: oldTome, buffType: "BindAmp", power: 0.15 }],
    };
    const variant = {
        name: "SavedVariant",
        type: "weapon",
        id: 101,
        inventoryVariant: "SavedVariant",
        enchantment: "keep",
    };
    r.inventory.set(oldTome, tome);
    r.inventory.set(variant.name, variant);
    r.c.KinkyDungeonWeaponVariants.SavedVariant = { template: oldStaff, events: [{ type: "custom", power: 7 }] };
    r.c.KinkyDungeonPlayerWeapon = oldTome;
    Object.assign(r.c.KDGameData, {
        PlayerWeaponLastEquipped: oldTome,
        Offhand: oldStaff,
        OffhandOld: oldStaff,
        OffhandReturn: oldTome,
        PreviousWeapon: [oldTome, oldStaff, "Knife"],
        Containers: { Chest: { items: { [oldStaff]: { name: oldStaff, type: "weapon", id: 102 } } } },
    });
    r.c.KinkyDungeonWeaponChoices = [oldTome, "SavedVariant"];
    r.c.KinkyDungeonLostItems = [{ name: oldStaff, type: "weapon", id: 103 }];
    r.c.KDMapData.GroundItems = [{ name: oldTome, x: 1, y: 2 }];
    r.c.KDWorldMap = {
        "0,5": { data: { CachedRoom: { GroundItems: [{ name: oldStaff, inventoryAs: oldStaff, x: 1, y: 2 }] } } },
    };
    r.c.KinkyDungeonPlayerBuffs[oldTome + "BindAmp"] = { id: oldTome + "BindAmp", power: 0.15, duration: 1 };
    r.c.KDSetWeapon(oldTome);
    assert.equal(
        r.c.KinkyDungeonInventoryGet(r.c.KinkyDungeonPlayerWeapon),
        tome,
        "Native zero-time inventory check would disarm the loaded legacy weapon",
    );
    r.events.afterLoadGame();
    assert.equal(r.inventory.size, 2);
    assert.equal(r.inventory.get(TOME), tome);
    assert.equal(tome.id, 100);
    assert.equal(tome.events[0].kind, TOME);
    assert.equal(tome.events[0].power, 0.2);
    assert.equal(r.inventory.get("SavedVariant"), variant);
    assert.equal(variant.enchantment, "keep");
    assert.equal(r.c.KinkyDungeonWeaponVariants.SavedVariant.template, STAFF);
    assert.equal(r.c.KinkyDungeonWeaponVariants.SavedVariant.events[0].power, 7);
    assert.equal(r.c.KinkyDungeonPlayerWeapon, TOME);
    assert.equal(r.c.KinkyDungeonPlayerDamage.bind, 4);
    assert.equal(r.c.KDGameData.Offhand, STAFF);
    assert.equal(r.c.KDGameData.OffhandOld, STAFF);
    assert.equal(r.c.KDGameData.OffhandReturn, TOME);
    assert.deepEqual(Array.from(r.c.KDGameData.PreviousWeapon), [TOME, STAFF, "Knife"]);
    assert.deepEqual(Array.from(r.c.KinkyDungeonWeaponChoices), [TOME, "SavedVariant"]);
    assert.equal(r.c.KDGameData.Containers.Chest.items[STAFF].id, 102);
    assert.equal(r.c.KinkyDungeonLostItems[0].id, 103);
    assert.equal(r.c.KinkyDungeonLostItems[0].name, STAFF);
    assert.equal(r.c.KDMapData.GroundItems[0].name, TOME);
    assert.equal(r.c.KDWorldMap["0,5"].data.CachedRoom.GroundItems[0].name, STAFF);
    assert.equal(r.c.KDWorldMap["0,5"].data.CachedRoom.GroundItems[0].inventoryAs, STAFF);
    assert.equal(r.c.KinkyDungeonPlayerBuffs[TOME + "BindAmp"].power, 0.2);
    assert.equal(r.c.KinkyDungeonPlayerBuffs[oldTome + "BindAmp"], undefined);
    r.c.KDDropItems(r.enemy(7, 7, { Enemy: { name: "MageSpiderlings" } }), r.c.KDMapData);
    assert.equal(r.c.KDMapData.GroundItems.length, 1, "A migrated variant must not cause a duplicate Mage weapon drop");
    const snapshot = JSON.stringify(r.c.KDGameData);
    r.events.afterLoadGame();
    assert.equal(JSON.stringify(r.c.KDGameData), snapshot);
});

test("coexisting old and new weapons survive reload without replacing the equipped old copy", () => {
    const r = fixture();
    const old = "SpiderlingsSilkenBindingTome";
    const oldItem = { name: old, type: "weapon", id: 100, events: [] };
    const current = { name: TOME, type: "weapon", id: 101, events: [] };
    r.inventory.set(old, oldItem);
    r.inventory.set(TOME, current);
    r.c.KDSetWeapon(old);
    r.events.afterLoadGame();
    assert.equal(r.inventory.size, 2);
    assert.equal(r.inventory.get(TOME), current);
    assert.equal(r.inventory.get(r.c.KinkyDungeonPlayerWeapon), oldItem);
    assert.equal(oldItem.id, 100);
    assert.equal(r.c.KDGameData.PlayerWeaponLastEquipped, r.c.KinkyDungeonPlayerWeapon);
    assert.equal(r.c.KinkyDungeonWeaponVariants[oldItem.name].template, TOME);
    r.events.afterLoadGame();
    assert.equal(r.inventory.size, 2);
});

test("stolen weapons migrate on current, cached and persistent NPCs while temporary items stay temporary", () => {
    const r = fixture();
    const oldTome = "SpiderlingsSilkenBindingTome",
        oldStaff = "SpiderlingsSilkweaverStaff";
    const carried = () => ({ items: [oldTome, oldStaff, "Knife", "SavedVariant"], tempitems: [oldStaff, "Knife"] });
    const current = carried(),
        cached = carried(),
        persistent = carried(),
        trueEntity = carried(),
        party = carried();
    r.c.KDMapData.Entities = [current];
    r.c.KDWorldMap = { "0,5": { data: { CachedRoom: { Entities: [cached] } } } };
    r.c.KDPersistentNPCs = { 10: { entity: persistent, trueEntity, storedParty: [party] } };
    r.events.afterLoadGame();
    for (const enemy of [current, cached, persistent, trueEntity, party]) {
        assert.deepEqual(Array.from(enemy.items), [TOME, STAFF, "Knife", "SavedVariant"]);
        assert.deepEqual(Array.from(enemy.tempitems), [STAFF, "Knife"]);
        assert.equal(
            r.c.KinkyDungeonFindWeapon(enemy.items[0]).rarity,
            4,
            "Native weapon pickup cannot inspect rarity",
        );
    }
});

test("same Convergence action charges 1/1.5/4.5, each successful upgrade pays 2 and extends exactly once", () => {
    const r = fixture();
    r.c.KDMapData.Entities.push(r.enemy());
    r.cast();
    r.tick();
    r.setMana(2);
    const spell = r.c.KinkyDungeonSpellListEnemies.find((s) => s.name === CONVERGENCE);
    assert.equal(r.c.KinkyDungeonGetManaCost(spell), 2);
    assert.equal(r.c.KDPrereqs[CONVERGENCE](), true);
    assert.equal(r.cast(CONVERGENCE, 10, 9).result, "Cast");
    assert.equal(r.mana(), 0);
    assert.equal(r.c.Spiderlings.Weapons.visualState().collapses[0].x, 7);
    assert.equal(r.cast().result, "Fail", "A zero-time repeated call cannot upgrade twice");
    r.tick();
    r.setMana(2);
    assert.equal(r.cast().result, "Cast");
    r.tick();
    const cast = r.c.Spiderlings.Weapons.visualState().collapses[0];
    assert.equal(cast.stage, 3);
    assert.equal(cast.explodeAt, 5);
    assert.equal(r.c.Spiderlings.Weapons.remaining(CONVERGENCE), 9);
    r.tick();
    assert.equal(r.hits.length, 0);
    r.tick();
    assert.equal(r.hits[0].damage.bind, 108);
    assert.equal(r.hits[0].damage.damage, 6);
});

test("failed, out-of-range and wrong-hand upgrades preserve the circle; a late charge has only one action left", () => {
    const r = fixture();
    r.cast();
    r.tick();
    r.tick();
    const cast = r.c.Spiderlings.Weapons.visualState().collapses[0],
        before = JSON.stringify(cast);
    r.setMana(1);
    assert.equal(r.cast().result, "Fail");
    r.setMana(20);
    r.nativeFail(true);
    assert.equal(r.cast().result, "Fail");
    r.nativeFail(false);
    r.c.KinkyDungeonPlayerEntity.x = 20;
    assert.equal(r.cast().result, "Fail");
    r.c.KinkyDungeonPlayerEntity.x = 5;
    r.c.KDSetWeapon(STAFF);
    assert.equal(r.c.KDPrereqs[CONVERGENCE](), false);
    assert.equal(JSON.stringify(cast), before);
    r.cast();
    assert.equal(cast.stage, 2);
    assert.equal(cast.explodeAt, 4);
    r.tick();
    assert.equal(cast.explodeAt - r.c.Spiderlings.Weapons.visualState().clock, 1);
    r.c.KDMapData = JSON.parse(JSON.stringify(r.c.KDMapData));
    r.c.KDGameData = JSON.parse(JSON.stringify(r.c.KDGameData));
    r.tick();
    assert.equal(r.c.Spiderlings.Weapons.visualState().collapses.length, 0);
    r.events.postMapgen();
    assert.equal(r.c.Spiderlings.Weapons.visualState().collapses.length, 0);
    assert.equal(r.c.Spiderlings.Weapons.remaining(CONVERGENCE), 5);
});

test("melee refunds follow actual native payment, survive a weapon switch and need positive world time", () => {
    for (const [weapon, cost, refund] of [
        [TOME, 1.5, 0.3],
        [STAFF, 3, 0.6],
    ]) {
        const r = fixture();
        r.c.KDSetWeapon(weapon);
        r.c.KinkyDungeonGetPlayerWeaponDamage();
        r.events.beforePlayerLaunchAttack();
        r.c.Spiderlings.Weapons.rewardHit({ enemy: { id: 1 } }, true, false);
        assert.equal(r.stamina(), 10);
        r.c.KDChangeStamina("attack", "weapon", "attack", -cost);
        assert.equal(r.stamina(), 10 - cost);
        r.c.KDSetWeapon("Knife");
        r.events.tickAfter(null, { delta: 0 });
        assert.equal(r.stamina(), 10 - cost);
        r.tick();
        assert.ok(Math.abs(r.stamina() - (10 - cost + refund)) < 1e-9);
        r.tick();
        assert.ok(Math.abs(r.stamina() - (10 - cost + refund)) < 1e-9);
    }
});

test("spell multi-hit stamina is once per cast; mana credit after StatGain stays within the paid budget", () => {
    const r = fixture();
    r.setStamina(5);
    r.manaGain(0.5);
    const result = r.cast(SNARE),
        spell = result.data.bulletfired.bullet.spell;
    for (let i = 0; i < 6; i++) r.c.Spiderlings.Weapons.rewardHit({ spell, enemy: { id: i } }, true, true);
    r.c.KDMapData = JSON.parse(JSON.stringify(r.c.KDMapData));
    r.tick();
    assert.equal(r.stamina(), 5.6);
    assert.equal(r.mana(), 19, "2 paid mana permits only 1 actual mana credit after +50% gain");
    r.tick();
    assert.equal(r.mana(), 19);
    const budget = Object.values(r.c.KDMapData.SpiderlingsWeapons.casts)[0];
    assert.equal(budget.manaReturned, 1);
});

test("a legal free Snare still returns stamina while its zero mana budget returns no magic", () => {
    const r = fixture(),
        cost = r.c.KinkyDungeonGetManaCost;
    r.c.KinkyDungeonGetManaCost = (spell) => (spell.name === SNARE ? 0 : cost(spell));
    r.setStamina(5);
    const result = r.cast(SNARE),
        spell = result.data.bulletfired.bullet.spell;
    r.c.Spiderlings.Weapons.rewardHit({ spell, enemy: { id: 1 } }, true, true);
    r.events.tickAfter(null, { delta: 0 });
    assert.equal(r.stamina(), 5);
    r.tick();
    assert.equal(r.stamina(), 5.6);
    assert.equal(r.mana(), 20);
    assert.equal(Object.values(r.c.KDMapData.SpiderlingsWeapons.casts)[0].manaReturned, 0);
});

test("skill hover uses a readable native panel and leaves clock, resources and input result intact", () => {
    const r = fixture();
    r.cast();
    r.tick();
    const draw = [],
        boxes = [];
    Object.assign(r.c, {
        MouseIn: () => true,
        MouseX: 605,
        MouseY: 850,
        TextGet: (key) => key,
        KinkyDungeonWordWrap: (text) => text,
        FillRectKD: (_board, _sprites, _id, box) => boxes.push(box),
        kdcanvas: {},
        kdpixisprites: new Map(),
        DrawTextFitKD: (...args) => draw.push(args),
    });
    const before = JSON.stringify({ map: r.c.KDMapData, game: r.c.KDGameData, mana: r.mana(), stamina: r.stamina() });
    assert.equal(r.c.KinkyDungeonDrawActionBar(), "native-actionbar");
    assert.equal(boxes.length, 1);
    assert.equal(boxes[0].alpha, 0.85);
    assert.ok(boxes[0].Left >= 520 && boxes[0].Top >= 30 && boxes[0].Top + boxes[0].Height <= 970);
    assert.ok(draw.some((args) => args[6] === 26));
    assert.ok(draw.some((args) => args[6] === 22));
    assert.ok(draw.filter((args) => args[6] === 20).length > 0);
    assert.equal(
        JSON.stringify({ map: r.c.KDMapData, game: r.c.KDGameData, mana: r.mana(), stamina: r.stamina() }),
        before,
    );
});

test("repeat native weapon button upgrades the original circle without a second target", () => {
    const r = fixture();
    r.cast();
    r.tick();
    r.setMana(2);
    r.c.KinkyDungeonGetPlayerWeaponDamage();
    r.c.KinkyDungeonTargetX = 100;
    r.c.KinkyDungeonTargetY = 100;
    r.c.KinkyDungeonTargetingSpell = { name: CONVERGENCE };
    assert.equal(r.c.KinkyDungeonActivateWeaponSpell().result, "Cast");
    assert.equal(r.c.Spiderlings.Weapons.visualState().collapses[0].stage, 2);
    assert.equal(r.c.KinkyDungeonTargetingSpell, null);
    assert.equal(r.c.KinkyDungeonTargetX, 100);
    assert.equal(r.c.KinkyDungeonTargetY, 100);
    assert.equal(r.mana(), 0);
});
