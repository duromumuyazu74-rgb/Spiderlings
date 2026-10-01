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

function remoteFixture(name = "Jumper") {
    const r = fixture();
    Object.assign(r.scout, { x: 30, y: 10, Enemy: { name, visionRadius: 8, sneakThreshold: 1 } });
    r.player.x = 35;
    r.helper.noLOS = true;
    r.group.memberIds = [r.helper.id];
    const second = { ...r.helper, id: 3, x: 1, y: 1 },
        group = { ...r.group, id: "remote", memberIds: [3], assignments: {} };
    r.context.KDMapData.Entities.push(second);
    r.encounter.ai.groups.remote = group;
    return { ...r, second, remoteGroup: group };
}

test("every Spiderlings species shares recognized player contact across unrelated distant Spinner crews", () => {
    for (const name of ["Spinner", "Jumper", "WebCaster", "Tunneler", "NestEntrance", "MageSpiderlings"]) {
        const r = remoteFixture(name);
        r.api.refreshObservations(r.encounter);
        for (const group of [r.group, r.remoteGroup]) {
            assert.equal(r.api.groupObservation(group).x, 35, name);
            assert.ok(group.memberIds.includes(group.engagement.lureId), "external reporter cannot become a crew lure");
        }
        assert.equal(r.api.playerObservation().reporterId, 1);
        assert.equal(r.helper.aware, false);
        assert.equal(r.helper.vp, 0);
        r.api.completePositiveTurn(1);
        assert.equal(r.group.engagement.lureNoContactTurns, 1, "shared sight cannot reset personal contact");
    }
});

test("remote reports reject NPC recognition, allies, prisoners and unavailable observers", () => {
    for (const key of ["allied", "party", "imprisoned", "disabled", "helpless", "stun"]) {
        const r = remoteFixture();
        r.scout[key] = 1;
        r.context.KDAllied = (actor) => !!actor.allied;
        r.context.KDIsInParty = (actor) => !!actor.party;
        r.context.KDIsImprisoned = (actor) => !!actor.imprisoned;
        r.api.refreshObservations(r.encounter);
        assert.equal(r.api.playerObservation(), undefined, key);
    }
    const r = remoteFixture();
    r.scout.aware = true;
    r.scout.vp = 0;
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.playerObservation(), undefined, "NPC awareness cannot bypass player sneak recognition");
    r.context.KinkyDungeonNearestPlayer = () => ({ id: 99, hp: 2, x: 35, y: 10 });
    r.scout.vp = 1;
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.playerObservation(), undefined, "NPC coordinates cannot become a player report");
});

test("stationary remote visual reports activate pressure without keeping a lure's personal sight alive", () => {
    const r = remoteFixture();
    r.group.noPlanSignature = "old";
    for (let tick = 0; tick < 12; tick++) {
        r.api.refreshObservations(r.encounter);
        r.api.completePositiveTurn(1);
    }
    assert.equal(r.group.noPlanSignature, undefined, "new intelligence reopens an unsuccessful planning search");
    assert.equal(r.group.engagement.mode, "pressure");
    assert.equal(r.group.engagement.lureNoContactTurns, 12);
    assert.equal(r.group.engagement.noSightTurns, 0);
    assert.equal(r.api.playerObservation().age, 1);
});

test("serialized shared history expires and remains isolated from another map and zero-time reload", () => {
    const r = remoteFixture();
    r.api.refreshObservations(r.encounter);
    r.api.completePositiveTurn(1);
    const saved = JSON.parse(JSON.stringify(r.encounter));
    r.context.Spiderlings.SpinnerNativeField.state = () => saved;
    r.api.restoreAfterLoad();
    const before = JSON.stringify(saved.ai.playerObservation);
    r.api.refreshObservations(saved, 0);
    r.api.completePositiveTurn(0);
    assert.equal(JSON.stringify(saved.ai.playerObservation), before);
    r.context.Spiderlings.SpinnerNativeField.state = () => ({ ai: { groups: {}, plans: {} } });
    assert.equal(r.api.playerObservation(), undefined, "map switch cannot import the old report");
    r.context.Spiderlings.SpinnerNativeField.state = () => saved;
    r.scout.noLOS = true;
    r.player.x = 99;
    for (let tick = 0; tick < 3; tick++) r.api.completePositiveTurn(1);
    assert.equal(r.api.playerObservation(), undefined);
    assert.equal(r.api.groupObservation(saved.ai.groups.team), undefined);
});

test("native positive sneak publishes first recognition even without beforemove and preserves native returns", () => {
    const r = remoteFixture("Tunneler"),
        { context } = r;
    context.Spiderlings.Hooks = { wrap: (_key, native, factory) => factory(native) };
    Object.assign(context.Spiderlings.SpinnerNativeField, {
        isOwnedProxy: () => false,
        handleEnemyTurn: () => undefined,
    });
    context.Spiderlings.SpinnerCapture = { handleEnemyTurn: () => undefined };
    context.Spiderlings.SpinnerField = { handleEnemyTurn: () => undefined };
    context.KDAIType = {
        hunt: { beforemove: () => "hunt-native" },
        wander: { beforemove: () => "wander-native" },
    };
    context.KinkyDungeonEnemyLoop = (enemy, target, delta) => {
        enemy.vp += delta * 0.6;
        return context.KinkyDungeonTrackSneak(enemy, delta, target);
    };
    vm.runInContext(fs.readFileSync(path.resolve(__dirname, "../../SpiderlingsSpinnerRuntime.js"), "utf8"), context);
    r.scout.vp = 0;
    assert.equal(context.KinkyDungeonEnemyLoop(r.scout, r.player, 0), 0);
    assert.equal(r.api.playerObservation(), undefined);
    assert.equal(context.KinkyDungeonEnemyLoop(r.scout, r.player, 1), 0.6);
    assert.equal(r.api.playerObservation().x, 35);
    assert.equal(r.scout.vp, 0.6);
    assert.equal(r.scout.aware, false);
    assert.equal(r.calls.filter((call) => call.kind === "sneak" && call.delta > 0).length, 1);
    assert.equal(context.KDAIType.wander.beforemove(r.scout, r.player, {}), "wander-native");
    assert.equal(context.KDAIType.hunt.beforemove(r.scout, r.player, {}), "hunt-native");
    assert.equal(r.scout.SpiderlingsSpinnerRuntimeDelta, undefined);
});

test("a controlling observer still relays knowledge while a busy Spinner never becomes the remote lure", () => {
    const r = remoteFixture();
    r.context.Spiderlings.SpinnerCapture = { state: () => ({ sourceIds: [r.scout.id, r.helper.id] }) };
    r.group.memberIds.push(r.second.id);
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.playerObservation().reporterId, r.scout.id);
    assert.equal(r.group.engagement.lureId, r.second.id);
    assert.deepEqual(r.context.Spiderlings.SpinnerCapture.state().sourceIds, [1, 2]);
});

test("pending player duty switches an NPC target only within real native sensory range", () => {
    const r = remoteFixture(),
        npc = { id: 99, hp: 2, x: 34, y: 9 };
    r.context.Spiderlings.SpinnerRecovery = {
        wantsPursuit: (source, target) => source === r.helper && target === r.player,
    };
    r.api.refreshObservations(r.encounter);
    assert.equal(r.api.recoveryTarget(r.helper, npc, 1), npc, "a remote report cannot grant personal sensory range");
    r.helper.x = 34;
    r.helper.noLOS = false;
    assert.equal(r.api.recoveryTarget(r.helper, npc, 1), r.player);
    assert.equal(r.helper.aware, false);
    assert.equal(r.helper.vp, 0, "native loop remains responsible for recognizing and hitting the player");
    assert.equal(r.api.recoveryTarget(r.helper, npc, 0), npc);
    r.helper.noLOS = true;
    assert.equal(r.api.recoveryTarget(r.helper, npc, 1), npc);
});
