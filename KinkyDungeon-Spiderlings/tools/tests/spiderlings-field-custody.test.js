"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture() {
    const bag = { name: "SpiderlingsSpinnerLegbinder", id: 77 };
    const gear = [bag];
    const player = { id: -1, player: true, x: 9, y: 10 };
    const actors = [1, 2, 3, 4].map((id) => ({
        id,
        x: 7 + id,
        y: 11,
        hp: 2,
        Enemy: { name: "Spinner", tags: { spiderlings: true } },
    }));
    const intruder = { id: 201, x: 9, y: 9, hp: 6, Enemy: { name: "ElementalIce" } };
    const encounter = {
        ai: {
            groups: { crew: { id: "crew", memberIds: [1, 2, 3, 4], planId: "plan" } },
            plans: { plan: { compositeId: "field" } },
        },
        command: { members: Object.fromEntries(actors.map((a) => [a.id, { commander: "crew" }])) },
    };
    const c = vm.createContext({
        KDGameData: {},
        KDMapData: { Entities: [...actors, intruder] },
        KinkyDungeonPlayerEntity: player,
        KinkyDungeonCurrentTick: 10,
        KinkyDungeonAllRestraintDynamic: () => gear.map((item) => ({ item })),
        KDHostile: (actor) => !actor.allied,
        KDAllied: (actor) => !!actor.allied,
        KDIsInParty: () => false,
        KDIsImprisoned: () => false,
        KDHelpless: (actor) => !!actor.helpless,
        KinkyDungeonIsDisabled: (actor) => !!actor.disabled,
        KDCanDetect: (_a, b) => !b.hidden,
        KDEnemyVisionRadius: () => 8,
        KinkyDungeonCheckLOS: (_a, b) => !b.hidden,
        Spiderlings: {
            SpinnerNativeField: {
                state: () => encounter,
                compositeById: (id) => (id === "field" ? { id, groupId: "crew" } : undefined),
                commonCore: () => ({ x: 10, y: 10 }),
            },
            FieldCommand: { sourceRole: (actor) => (actor.busy ? "capture" : undefined), adoptCustodyCrew() {} },
            SpinnerCapture: { state: () => undefined },
            SpinnerAI: { attackApproach: (actor) => ({ ready: true, path: actor.blocked ? [] : [actor] }) },
            SpinnerRecovery: {
                requested: () => true,
                state: () => undefined,
                departure: () => c.KDGameData.SpiderlingsSpinnerRecoveryDeparture,
            },
        },
    });
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsFieldCustody.js"), "utf8"), c);
    return { c, api: c.Spiderlings.FieldCustody, bag, gear, player, actors, intruder, encounter };
}

test("custody requires capture evidence and survives temporary-controller completion and reload", () => {
    const r = fixture();
    r.api.prepare();
    assert.equal(r.api.state(), undefined, "a manually equipped bag is not proof of capture");
    r.c.KDGameData.SpiderlingsSpinnerRecoveryDeparture = { legBagId: 77, compositeId: "field", groupId: "crew" };
    r.api.prepare();
    assert.equal(r.api.state().compositeId, "field");
    delete r.c.KDGameData.SpiderlingsSpinnerRecoveryDeparture;
    r.encounter.custody = JSON.parse(JSON.stringify(r.encounter.custody));
    r.api.prepare();
    assert.equal(r.api.state().bagId, 77);
    r.gear.length = 0;
    r.api.prepare();
    assert.equal(r.api.state(), undefined);
});

test("the field assigns a bounded attack team to a competing escort without stealing busy sources", () => {
    const r = fixture();
    r.api.capture("field", 77);
    r.actors[0].busy = true;
    r.player.leash = { entity: 201, reason: "Default" };
    r.api.prepare();
    const attackers = r.actors.filter((actor) => r.api.targetFor(actor) === r.intruder);
    assert.equal(attackers.length, 2);
    assert.ok(!attackers.includes(r.actors[0]));
    assert.equal(r.api.interceptionPair(attackers[0], r.intruder), true);
    assert.equal(r.api.interceptionPair(r.intruder, attackers[0]), true);
    assert.equal(r.api.permitsRecovery(r.actors[3]), false, "contested prey is defended, not pulled in two directions");
    delete r.player.leash;
    assert.equal(r.api.targetFor(attackers[0]), undefined, "ended competition immediately invalidates the attack");
    r.api.prepare();
    assert.ok(r.actors.filter((a) => r.api.permitsRecovery(a)).length <= 2);
});

test("invisible escorts and disabled or allied spiders do not receive attack admission", () => {
    const r = fixture();
    r.api.capture("field", 77);
    r.player.leash = { entity: 201, reason: "Default" };
    r.intruder.hidden = true;
    r.api.prepare();
    assert.equal(
        r.actors.some((a) => r.api.targetFor(a)),
        false,
    );
    r.intruder.hidden = false;
    r.actors[0].disabled = true;
    r.actors[1].allied = true;
    r.api.prepare();
    assert.equal(r.api.targetFor(r.actors[0]), undefined);
    assert.equal(r.api.targetFor(r.actors[1]), undefined);
});

test("interception preserves an already committed Jumper dash", () => {
    const r = fixture();
    r.actors[0].Enemy.name = "Jumper";
    r.c.Spiderlings.JumperDash = { runtimeController: { snapshot: () => [{ sourceId: r.actors[0].id }] } };
    r.api.capture("field", 77);
    r.player.leash = { entity: 201, reason: "Default" };
    r.api.prepare();
    assert.equal(r.api.targetFor(r.actors[0]), undefined);
    assert.equal(r.actors.filter((a) => r.api.targetFor(a)).length, 2);
});

test("active recovery sources fill the contact team instead of recruiting another pair each turn", () => {
    const r = fixture();
    r.api.capture("field", 77);
    r.c.Spiderlings.SpinnerRecovery.state = () => ({ sources: { 1: { id: 1 }, 2: { id: 2 } } });
    r.c.Spiderlings.FieldCommand.sourceRole = (a) => ([1, 2].includes(a.id) ? "recovery" : undefined);
    r.api.prepare();
    assert.equal(r.api.state().contacts.length, 0);
    assert.equal(r.api.state().status, "recovering");
    assert.equal(r.api.permitsRecovery(r.actors[0]), true);
    assert.equal(r.api.permitsRecovery(r.actors[2]), false);
});

test("custody only recruits contacts after recovery receives an actual departure", () => {
    const r = fixture();
    r.api.capture("field", 77);
    r.c.Spiderlings.SpinnerRecovery.requested = () => false;
    r.api.prepare();
    assert.equal(r.api.state().contacts.length, 0);
    assert.equal(r.api.permitsRecovery(r.actors[0]), false);
    r.player.leash = { entity: 201, reason: "Default" };
    r.api.prepare();
    assert.equal(r.api.state().defenders.length, 2, "Interception remains independent of departure");
});

test("blocked or unseen uncommitted contacts give their slots to reachable visible members", () => {
    const r = fixture();
    r.api.capture("field", 77);
    r.api.prepare();
    const prior = [...r.api.state().contacts];
    for (const actor of r.actors) if (prior.includes(actor.id)) actor.blocked = true;
    r.api.prepare();
    assert.ok(r.api.state().contacts.every((id) => !prior.includes(id)));
    for (const actor of r.actors) actor.blocked = false;
    const replacement = [...r.api.state().contacts];
    r.c.KDCanDetect = (actor) => !replacement.includes(actor.id);
    r.api.prepare();
    assert.ok(r.api.state().contacts.every((id) => !replacement.includes(id)));
});

test("an approved committed interception retains hostility and reserves its team slot", () => {
    const r = fixture();
    r.actors[0].Enemy.name = "Jumper";
    r.api.capture("field", 77);
    r.player.leash = { entity: r.intruder.id, reason: "Default" };
    r.api.prepare();
    const source = r.actors[0];
    let pending = [{ sourceId: source.id, targetId: r.intruder.id, interceptionCompositeId: "field" }];
    r.c.Spiderlings.JumperDash = { runtimeController: { snapshot: () => pending } };
    assert.equal(r.api.targetFor(source), undefined, "Wind-up cannot accept a new field order");
    assert.equal(r.api.interceptionPair(source, r.intruder), true);
    assert.equal(r.api.interceptionPair(r.intruder, source), true);
    r.api.prepare();
    assert.equal(r.api.state().defenders.length, 2);
    assert.ok(r.api.state().defenders.includes(source.id));
    assert.equal(r.api.assigned(source), true);
    pending = [{ sourceId: source.id, targetId: r.intruder.id }];
    assert.equal(r.api.interceptionPair(source, r.intruder), false, "An unrelated dash cannot acquire field hostility");
    pending = [{ sourceId: source.id, targetId: r.intruder.id, interceptionCompositeId: "field" }];
    source.allied = true;
    assert.equal(r.api.interceptionPair(source, r.intruder), false);
    source.allied = false;
    delete r.player.leash;
    assert.equal(r.api.interceptionPair(source, r.intruder), false);
});
