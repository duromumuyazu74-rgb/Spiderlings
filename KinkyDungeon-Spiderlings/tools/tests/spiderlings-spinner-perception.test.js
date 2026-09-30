"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function fixture(reverse = false) {
    const scout = {
            id: 1,
            x: 7,
            y: 10,
            hp: 2,
            aware: false,
            vp: 0.7,
            buffs: {},
            Enemy: { name: "Spinner", visionRadius: 8, sneakThreshold: 1 },
            SpiderlingsSpinnerRuntimeDelta: 1,
        },
        helper = { ...scout, id: 2, x: 2, vp: 0 },
        player = { id: 0, player: true, x: 14, y: 10 },
        group = { id: "team", memberIds: [1, 2], source: { type: "ordinary" }, assignments: {}, planId: "plan" },
        encounter = {
            ai: { groups: { team: group }, plans: { plan: { kind: "enclosure", compositeId: "field" } } },
            topology: { composites: { field: { core: { x: 10, y: 10 }, layerIds: [] } } },
        },
        calls = [],
        context = {
            Spiderlings: {
                SpinnerNativeField: {
                    state: () => encounter,
                    snapshot: (cell) => ({ inBounds: true, floor: cell.x === scout.x && cell.y === scout.y }),
                },
                SpinnerTopology: { isInsideCommonCore: () => false },
            },
            KDMapData: { Entities: reverse ? [helper, scout] : [scout, helper] },
            KinkyDungeonPlayerEntity: player,
            KinkyDungeonCurrentTick: 1,
            KinkyDungeonStatsChoice: new Map(),
            KDHostile: () => true,
            KDAllied: () => false,
            KDIsInParty: () => false,
            KDIsImprisoned: () => false,
            KDHelpless: (entity) => !!entity.helpless,
            KinkyDungeonIsDisabled: (entity) => !!entity.disabled,
            KDEnemyVisionRadius: (entity) => entity.Enemy.visionRadius,
            KinkyDungeonGetBuffedStat: () => 0,
            KinkyDungeonNearestPlayer(observer) {
                calls.push({ kind: "acquire", id: observer.id });
                observer.aware = true;
                return player;
            },
            KinkyDungeonTrackSneak(observer, delta) {
                calls.push({ kind: "sneak", id: observer.id, delta });
                observer.vp ||= 0;
                return observer.vp / observer.Enemy.sneakThreshold;
            },
            KinkyDungeonCheckLOS(observer, _target, distance, radius) {
                calls.push({ kind: "los", id: observer.id, radius });
                return !observer.noLOS && distance <= radius;
            },
            KDCanHearEnemy: (observer) => !!observer.heard,
        };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../SpiderlingsSpinnerAI.js"), "utf8"), context, {
        filename: "SpiderlingsSpinnerAI.js",
    });
    return { context, api: context.Spiderlings.SpinnerAI, scout, helper, player, group, encounter, calls };
}

test("a recognized local scout shares its current observation before helper order matters", () => {
    for (const reverse of [false, true]) {
        const r = fixture(reverse);
        r.api.refreshObservations(r.encounter, 1);
        assert.deepEqual(JSON.parse(JSON.stringify(r.api.groupObservation(r.group))), {
            x: 14,
            y: 10,
            dx: 0,
            dy: 0,
            age: 0,
            source: "native",
            target: { kind: "player", id: 0 },
        });
        assert.equal(r.scout.aware, false, "a shared planning report cannot grant native awareness");
        assert.equal(r.scout.vp, 0.7, "sampling never accumulates a second detection turn");
        assert.equal(r.helper.vp, 0);
        assert.ok(r.calls.filter((call) => call.kind === "sneak").every((call) => call.delta === 0));
        assert.ok(r.calls.some((call) => call.kind === "los" && call.radius === 8));
    }
});

test("unrecognized stealth and a wall without sound provide no exact player position", () => {
    const r = fixture();
    r.scout.vp = 0.1;
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.groupObservation(r.group), undefined);
    assert.equal(r.scout.vp, 0.1);
    r.scout.vp = 1;
    r.scout.noLOS = true;
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.groupObservation(r.group), undefined);
    r.scout.noLOS = false;
    r.player.x = 28;
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.groupObservation(r.group), undefined, "chase range is not initial acquisition range");
});

test("local sampling retains summoned vision, Vision buffs, KillSquad and blind limits", () => {
    const summoned = fixture();
    summoned.player.x = 17;
    summoned.scout.lifetime = 10;
    summoned.scout.Enemy.visionSummoned = 2;
    summoned.api.refreshObservations(summoned.encounter);
    assert.equal(summoned.api.groupObservation(summoned.group).x, 17);

    const buffed = fixture();
    buffed.player.x = 18;
    buffed.context.KinkyDungeonGetBuffedStat = (_buffs, stat) => (stat === "Vision" ? 3 : 0);
    buffed.api.refreshObservations(buffed.encounter);
    assert.equal(buffed.api.groupObservation(buffed.group).x, 18);

    const squad = fixture();
    squad.context.KinkyDungeonStatsChoice.set("KillSquad", true);
    squad.player.x = 16;
    squad.api.refreshObservations(squad.encounter);
    assert.equal(squad.api.groupObservation(squad.group).x, 16);
    squad.scout.Enemy.blindSight = 10;
    squad.player.x = 20;
    squad.api.refreshObservations(squad.encounter);
    assert.equal(squad.api.groupObservation(squad.group).x, 20, "native blind sight raises the KillSquad radius");

    const blinded = fixture();
    blinded.scout.blind = 1;
    blinded.api.refreshObservations(blinded.encounter);
    assert.equal(blinded.api.groupObservation(blinded.group), undefined);
    blinded.player.x = 8;
    blinded.api.refreshObservations(blinded.encounter);
    assert.equal(blinded.api.groupObservation(blinded.group).x, 8);
});

test("only actual native hearing can supply a recognized nonvisual report", () => {
    const r = fixture();
    r.scout.noLOS = true;
    r.scout.heard = true;
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.groupObservation(r.group).x, 14);
    r.api.completePositiveTurn(1);
    assert.equal(r.group.engagement.noSightTurns, 1, "hearing does not become visual contact");
});

test("hidden player movement preserves only finite historical coordinates and direction", () => {
    const r = fixture();
    r.api.refreshObservations(r.encounter);
    r.player.x = 13;
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.groupObservation(r.group).dx, -1);
    r.scout.noLOS = true;
    r.player.x = 28;
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.groupObservation(r.group).x, 13);
    const copy = r.api.groupObservation(r.group);
    copy.x = 99;
    assert.equal(r.api.groupObservation(r.group).x, 13, "consumer cannot edit shared authority");
    for (let tick = 0; tick < 4; tick++) r.api.completePositiveTurn(1);
    assert.equal(r.api.groupObservation(r.group), undefined);
});

test("zero-time load and unavailable observers add no report or age", () => {
    const r = fixture();
    r.api.refreshObservations(r.encounter, 0);
    assert.equal(r.calls.length, 0);
    r.scout.stun = 1;
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.groupObservation(r.group), undefined);
    r.scout.stun = 0;
    r.api.refreshObservations(r.encounter);
    const before = JSON.stringify(r.group.engagement);
    r.api.refreshObservations(r.encounter, 0);
    r.api.completePositiveTurn(0);
    assert.equal(JSON.stringify(r.group.engagement), before);
});

test("the native beforemove observer publishes new partial recognition without granting awareness", () => {
    const r = fixture();
    r.scout.vp = 0.1;
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.groupObservation(r.group), undefined);
    // The real native loop has now advanced its own recognition accumulator.
    r.scout.vp = 0.7;
    r.api.handleBeforeMove(r.scout, r.player, { canSensePlayer: true, canSeePlayer: true, hostile: true });
    assert.equal(r.api.groupObservation(r.group).x, 14);
    assert.equal(r.scout.aware, false);
    assert.equal(r.scout.vp, 0.7);
});
