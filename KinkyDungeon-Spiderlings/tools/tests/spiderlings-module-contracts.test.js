"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { auditModule, auditRepository } = require("../check-spiderlings-modules.js");

test("module contracts reject cross-owner work, request and structure mutations", () => {
    const cases = [
        ["SpiderlingsFieldCommand.js", "function sync(group) { delete group.assignments[id]; }", "field-work"],
        ["SpiderlingsSpinnerDuties.js", "group.maintenance = {memberId: id};", "field-work"],
        [
            "SpiderlingsFieldProjects.js",
            "for (const request of Object.values(state.requests)) request.closed = true;",
            "command-requests",
        ],
        ["SpiderlingsSpinnerAI.js", "composite.constructionOrder = 'outer-first';", "field-structure"],
    ];
    for (const [file, source, rule] of cases) {
        const errors = auditModule(source, file);
        assert.equal(errors.length, 1, file);
        assert.ok(errors[0].includes(rule), errors[0]);
    }
});

test("module contracts follow aliases, computed fields, bulk edits and mutable collections", () => {
    const source = `
        function act(group, encounter) {
            const jobs = group["assignments"];
            delete jobs[id];
            Object.assign(group, {maintenance: null});
            const composite = encounter.topology.composites[id];
            composite.layerIds.push(next);
            const {assignments: copiedAlias} = group;
            copiedAlias[id] = job;
        }
    `;
    assert.equal(auditModule(source, "SpiderlingsSpinnerAI.js").length, 4);
    assert.equal(auditModule("Object.assign(group, savedGroup);", "SpiderlingsSpinnerAI.js").length, 1);
});

test("collection provenance follows Object.values with arbitrary local names", () => {
    const source = "for (const entry of Object.values(encounter.command.requests)) entry.closed = true;";
    assert.equal(auditModule(source, "SpiderlingsFieldProjects.js").length, 1);
    assert.deepEqual(auditModule(source, "SpiderlingsFieldCommand.js"), []);
});

test("module contracts retain owner writes and distinguish reads, shadowing and unrelated local arrays", () => {
    assert.deepEqual(
        auditModule("group.assignments[id] = job; delete group.maintenance;", "SpiderlingsFieldProjects.js"),
        [],
    );
    assert.deepEqual(auditModule("request.closed = true;", "SpiderlingsFieldCommand.js"), []);
    assert.deepEqual(auditModule("composite.layerIds.push(id);", "SpiderlingsSpinnerTopology.js"), []);
    const source = `
        const jobs = group.assignments;
        const current = jobs[id];
        function other(jobs) { jobs[id] = unrelated; }
        const request = [...args]; request[0] = name;
        const groups = []; groups.push(group);
    `;
    assert.deepEqual(auditModule(source, "SpiderlingsSpinnerAI.js"), []);
});

test("native phase installation belongs to the shared adapter, including named AI aliases", () => {
    const source = `
        const hunt = KDAIType.hunt;
        hunt.beforemove = wrapper;
        for (const [name, selected] of Object.entries(KDAIType)) selected.attack = wrapper;
        KDGetDir = wrapper;
    `;
    assert.equal(auditModule(source, "SpiderlingsWebCaster.js").length, 3);
    assert.deepEqual(auditModule(source, "SpiderlingsNativeActions.js"), []);
    assert.deepEqual(auditModule("KDGetDir = wrapped;", "SpiderlingsWebMobility.js"), []);
});

test("packaged runtime satisfies the recorded module ownership contracts", () => {
    assert.deepEqual(auditRepository(), []);
});
