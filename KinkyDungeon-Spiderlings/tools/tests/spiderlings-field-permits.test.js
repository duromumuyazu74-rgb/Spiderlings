"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { runtime, load } = require("./helpers/spinner-native-runtime.js");

function scene(count, setting = "3") {
    const r = runtime({
        KDHostile: (entity) => !entity.allied,
        KDAllied: (entity) => !!entity.allied,
        KDIsInParty: (entity) => !!entity.party,
        KDIsImprisoned: (entity) => !!entity.imprisoned,
    });
    const c = r.context;
    for (let id = 1; id <= count; id++)
        c.KDMapData.Entities.push({
            id,
            x: id + 2,
            y: 10,
            hp: 2,
            Enemy: { name: "Spinner", tags: { spiderlings: true } },
        });
    load(c, "SpiderlingsFieldCommand.js");
    load(c, "SpiderlingsFieldProjects.js");
    c.Spiderlings.getSetting = () => setting;
    return c;
}

test("field permits gate the configured maximum at each four-Spinner boundary", () => {
    for (const [count, expected] of [
        [0, 0],
        [3, 0],
        [4, 1],
        [7, 1],
        [8, 2],
        [12, 3],
        [16, 4],
    ]) {
        const c = scene(count);
        assert.equal(c.Spiderlings.FieldProjects.permits(), expected);
        assert.equal(c.Spiderlings.FieldProjects.capacity(), Math.min(3, expected));
        assert.equal(c.Spiderlings.FieldProjects.limit(), 3, "Permits cannot rewrite the user's setting");
    }
    assert.equal(scene(12, "0").Spiderlings.FieldProjects.capacity(), 0);
    assert.equal(scene(12, "1").Spiderlings.FieldProjects.capacity(), 1);
});

test("living commandable Spinner population controls permits independently of temporary duties", () => {
    const c = scene(8, "5");
    const projects = c.Spiderlings.FieldProjects;
    c.KDMapData.Entities[0].stun = 100;
    c.KDMapData.Entities[1].channel = 10;
    c.KDMapData.Entities[2].SpiderlingsTaskNestDefenderTarget = 99;
    assert.equal(projects.permits(), 2, "Temporary incapacity and existing duties do not destroy a permit");
    for (const [key, value] of [
        ["allied", true],
        ["party", true],
        ["imprisoned", true],
        ["hp", 0],
    ]) {
        c.KDMapData.Entities[3][key] = value;
        assert.equal(projects.permits(), 1);
        delete c.KDMapData.Entities[3][key];
        c.KDMapData.Entities[3].hp = 2;
    }
    c.KDMapData.Entities[3].Enemy.name = "Jumper";
    assert.equal(projects.permits(), 1, "Other Spiderling species cannot authorize a Spinner field");
});

function managedScene({ residents = 0, work = "none", executable = false } = {}) {
    const c = scene(Math.max(8, residents)),
        api = c.Spiderlings,
        native = api.SpinnerNativeField;
    c.KinkyDungeonMapGet = () => ".";
    for (const actor of c.KDMapData.Entities) actor.x += 16;
    native.initializeEnclosure({
        compositeId: "managed",
        owners: [1, 2, 3, 4],
        built: true,
        autoSeal: false,
        layers: [
            {
                id: "managed-inner",
                vertices: [
                    { x: 6, y: 6 },
                    { x: 10, y: 6 },
                    { x: 10, y: 10 },
                    { x: 6, y: 10 },
                ],
                gate: { x: 6, y: 8 },
            },
        ],
    });
    const encounter = native.state(),
        graph = encounter.topology;
    if (work === "repair") graph.links[0].hp -= 0.5;
    if (work === "construction") {
        const link = graph.links.find((entry) => entry.builtCells.some((cell) => cell.x === 7 && cell.y === 6));
        link.builtCells = link.builtCells.filter((cell) => cell.x !== 7 || cell.y !== 6);
    }
    api.SpinnerTopology.refresh(graph);
    if (work === "construction") graph.fields["managed-inner"].phase = "preparing";
    encounter.ai = { groups: {}, plans: {}, nextGroupOrdinal: 1, nextPlanOrdinal: 1, coordinationTurn: 0 };
    const ai = encounter.ai,
        receiver = api.FieldCommand.newGroup(ai),
        donor = api.FieldCommand.newGroup(ai);
    receiver.planId = "managed-plan";
    ai.plans[receiver.planId] = {
        id: receiver.planId,
        groupId: receiver.id,
        kind: "enclosure",
        status: "preparing",
        fieldId: "managed-inner",
        fieldIds: ["managed-inner"],
        compositeId: "managed",
        center: { x: 8, y: 8 },
        radius: 2,
    };
    const state = api.FieldCommand.ensure(encounter);
    state.members = {};
    const actors = c.KDMapData.Entities.filter((entity) => entity.Enemy.name === "Spinner");
    for (const [index, actor] of actors.entries()) {
        const group = index < residents ? receiver : donor;
        actor.x = index < residents ? 7 + (index % 3) : 20 + (index % 3);
        actor.y = index < residents ? 7 + Math.floor(index / 3) : 14 + Math.floor(index / 3);
        group.memberIds.push(actor.id);
        state.members[actor.id] = { id: actor.id, home: group.id, commander: group.id, phase: "home" };
    }
    Object.assign(c.KinkyDungeonPlayerEntity, { id: 0, x: 12, y: 8 });
    const planner = {
        members: (group) =>
            group.memberIds
                .map((id) => actors.find((actor) => actor.id === id))
                .filter((actor) => actor.hp > 0 && !c.KinkyDungeonIsDisabled(actor) && !c.KDHelpless(actor)),
        distances: (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)),
        legal: () => true,
        paid: () => true,
        prepareApproach: () => {},
        intercepts: () => false,
        canWork: () => executable,
        start: () => {},
        lineFixture: true,
    };
    const update = () => api.FieldProjects.update(encounter, planner);
    const requests = () => Object.values(state.requests).filter((entry) => !entry.closed);
    return { c, api, encounter, receiver, donor, actors, planner, update, requests };
}

test("a nearby damaged field retains two readiness staff and a separate repair request", () => {
    const { update, requests } = managedScene({ work: "repair" });
    update();
    assert.equal(requests().find((entry) => entry.kind === "readiness")?.count, 2);
    assert.equal(requests().find((entry) => entry.kind === "repair")?.count, 1);
});

test("enough on-site workers facing unavailable work do not request an endless replacement crew", () => {
    const { c, update, requests, api, receiver, encounter } = managedScene({ residents: 4, work: "construction" });
    Object.assign(c.KinkyDungeonPlayerEntity, { x: 8, y: 8 });
    for (let turn = 0; turn < 12; turn++) {
        update();
        encounter.ai.coordinationTurn++;
    }
    assert.equal(requests().filter((entry) => entry.kind === "build").length, 0);
    assert.equal(encounter.ai.plans[receiver.planId].availableWorkers, 0, "Staffing must not invent an executable job");
    assert.equal(api.SpinnerTopology.fieldWorkNeeds(encounter.topology, ["managed-inner"]).construction, true);
});

test("an unmanned ready field requests support near its edge and retains the loan when prey enters its core", () => {
    const { c, api, encounter, receiver, update, requests } = managedScene();
    const log = encounter.topology.actionLog.length;
    update();
    const readiness = requests().find((entry) => entry.kind === "readiness");
    assert.equal(readiness.count, 2);
    assert.equal(readiness.urgency, 1);
    assert.equal(readiness.deployed, 2);
    assert.equal(
        encounter.ai.plans[receiver.planId].coverageAvailable,
        false,
        "Geometry and travelling promises are not on-site coverage",
    );
    const loans = Object.values(encounter.command.members).filter((member) => member.requestId === readiness.id);
    const identities = loans.map((member) => [member.id, member.loan]);
    Object.assign(c.KinkyDungeonPlayerEntity, { x: 8, y: 8 });
    encounter.ai.coordinationTurn++;
    update();
    const capture = requests().find((entry) => entry.kind === "capture");
    assert.equal(readiness.closed, true);
    assert.equal(capture.count, 2);
    assert.equal(capture.deployed, 2);
    assert.deepEqual(
        loans.map((member) => [member.id, member.loan]),
        identities,
        "Changing the same field's duty must not send its staff back home",
    );
    assert.ok(loans.every((member) => member.requestId === capture.id && member.phase === "travelling"));
    assert.equal(encounter.topology.actionLog.length, log, "Dispatch cannot pay construction");
    assert.equal(api.FieldProjects.limit(), 3);
});

test("outer-ring entry increases readiness urgency before common-core capture", () => {
    const { c, api, encounter, receiver, update, requests } = managedScene();
    const added = api.SpinnerNativeField.addEnclosureLayer({
        compositeId: "managed",
        owners: [1, 2, 3, 4],
        layer: {
            id: "managed-outer",
            vertices: [
                { x: 5, y: 5 },
                { x: 11, y: 5 },
                { x: 11, y: 11 },
                { x: 5, y: 11 },
            ],
            gate: { x: 5, y: 8 },
        },
    });
    assert.equal(added.added, true);
    encounter.ai.plans[receiver.planId].fieldIds.push("managed-outer");
    Object.assign(c.KinkyDungeonPlayerEntity, { x: 10, y: 8 });
    update();
    assert.equal(requests().find((entry) => entry.kind === "readiness").urgency, 2);
    assert.equal(
        requests().some((entry) => entry.kind === "capture"),
        false,
    );
});

test("remote home workers and urgent incoming staff are not reserved twice for the same construction", () => {
    const { c, actors, receiver, encounter, update, requests } = managedScene({
        residents: 2,
        work: "construction",
        executable: true,
    });
    for (const actor of actors.slice(0, 2)) Object.assign(actor, { x: 17, y: 17 });
    Object.assign(c.KinkyDungeonPlayerEntity, { x: 8, y: 8 });
    update();
    assert.equal(requests().find((entry) => entry.kind === "capture").count, 2);
    assert.equal(
        requests().some((entry) => entry.kind === "build"),
        false,
        "The original travelling builders can fulfill construction",
    );
    assert.equal(encounter.ai.plans[receiver.planId].availableWorkers, 2);
});

test("protected sources serving another target do not fill the player's capture deficit", () => {
    const { c, api, update, requests } = managedScene({ residents: 2 });
    Object.assign(c.KinkyDungeonPlayerEntity, { x: 8, y: 8 });
    api.SpinnerNPCCapture = {
        usesSource: (id) => id === 1 || id === 2,
        records: () => ({ other: { targetId: 99, admittedCompositeId: "managed", sourceIds: [1, 2] } }),
    };
    update();
    assert.equal(requests().find((entry) => entry.kind === "capture").count, 2);
});

test("losing permits and setting the maximum to zero preserve an invested managed field", () => {
    const { c, api, encounter, receiver, actors, update } = managedScene({ residents: 4 });
    const planId = receiver.planId,
        fields = Object.keys(encounter.topology.fields),
        paid = encounter.topology.actionLog.length;
    for (const actor of actors.slice(2)) actor.hp = 0;
    c.Spiderlings.getSetting = () => "0";
    update();
    assert.equal(api.FieldProjects.permits(), 0);
    assert.equal(api.FieldProjects.capacity(), 0);
    assert.equal(receiver.planId, planId);
    assert.notEqual(encounter.ai.plans[planId].status, "retired");
    assert.deepEqual(Object.keys(encounter.topology.fields), fields);
    assert.equal(encounter.topology.fields[fields[0]].retired, false);
    assert.equal(encounter.topology.actionLog.length, paid);
});

test("the real positive-turn planner waits for a fourth Spinner before accepting a new field", () => {
    const c = scene(3),
        api = c.Spiderlings;
    c.KinkyDungeonMapGet = (x, y) => (x > 0 && y > 0 && x < 30 && y < 20 ? "." : "1");
    load(c, "SpiderlingsSpinnerPassagePlanner.js");
    load(c, "SpiderlingsSpinnerAI.js");
    const ai = api.SpinnerAI.beginTurn({ activate: true });
    assert.equal(Object.keys(ai.plans).length, 0);
    c.KDMapData.Entities.push({ id: 99, x: 7, y: 10, hp: 2, Enemy: { name: "Spinner", tags: { spiderlings: true } } });
    api.SpinnerAI.beginTurn({ activate: true });
    assert.equal(
        Object.values(ai.plans).filter((plan) => !["invalid", "abandoned", "retired"].includes(plan.status)).length,
        1,
    );
    assert.equal(api.FieldProjects.limit(), 3);
    assert.equal(api.FieldProjects.permits(), 1);
    assert.equal(api.SpinnerNativeField.state().topology.actionLog.length, 0);
});

test("ready geometry waiting for staff remains unmet without borrowing its last worker into a duplicate field", () => {
    const { c, encounter, receiver, actors, planner, update, requests } = managedScene({ residents: 1 });
    c.KinkyDungeonIsDisabled = (actor) => !!actor.disabled;
    for (const actor of actors.slice(1)) actor.disabled = true;
    planner.lineFixture = false;
    planner.propose = () => {
        throw new Error("A reusable ready field must receive staff before starting a duplicate project");
    };
    update();
    assert.equal(Object.values(encounter.ai.groups).filter((group) => group.planId).length, 1);
    assert.equal(encounter.command.members[actors[0].id].commander, receiver.id);
    assert.equal(encounter.ai.plans[receiver.planId].usableCoverage, true);
    assert.equal(encounter.ai.plans[receiver.planId].coverageAvailable, false);
    assert.ok(encounter.ai.projects.unmet.some((target) => target.target.kind === "player"));
    assert.equal(requests().find((entry) => entry.kind === "readiness").missing, 1);
});
