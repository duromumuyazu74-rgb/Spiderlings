"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { runtime } = require("./tests/helpers/spinner-native-runtime.js");

function rolloutFixture(groupCount, source) {
    const { context } = runtime();
    const map = context.KDMapData;
    map.GridWidth = groupCount * 10 + 12;
    map.GridHeight = 25;
    map.EndPosition = { x: map.GridWidth - 2, y: 12 };
    context.KinkyDungeonMapGet = () => ".";
    context.Spiderlings.getSetting = () => true;
    const native = context.Spiderlings.SpinnerNativeField;
    let snapshotCalls = 0;
    context.Spiderlings.SpinnerNativeField = {
        ...native,
        mapSnapshot() {
            snapshotCalls++;
            return native.mapSnapshot();
        },
    };
    const ai = { groups: {}, plans: {} };
    for (let index = 0; index < groupCount; index++) {
        const id = `g${index + 1}`,
            planId = `p${index + 1}`,
            x = 8 + index * 10;
        ai.groups[id] = { id, planId, memberIds: [index * 2 + 1, index * 2 + 2] };
        ai.plans[planId] = {
            id: planId,
            fieldId: `line-${id}`,
            anchors: [
                { x, y: 8 },
                { x, y: 12 },
            ],
        };
    }
    native.ensureMap().ai = ai;
    map.SpiderlingsSpinnerRollout = { version: 1, enabled: true, kind: "ordinary" };
    vm.runInContext(
        source || fs.readFileSync(path.join(__dirname, "../SpiderlingsSpinnerRollout.js"), "utf8"),
        context,
    );
    return { context, snapshotCalls: () => snapshotCalls };
}

function measure(groupCount, source) {
    const durations = [];
    let snapshots, digest;
    for (let run = 0; run < 12; run++) {
        const fixture = rolloutFixture(groupCount, source);
        const start = performance.now();
        fixture.context.Spiderlings.SpinnerRollout.preparePositiveTurn();
        const duration = performance.now() - start;
        if (run < 2) continue;
        durations.push(duration);
        snapshots = fixture.snapshotCalls();
        const state = fixture.context.KDMapData;
        digest = createHash("sha256")
            .update(
                JSON.stringify([state.SpiderlingsSpinnerRollout, state.SpiderlingsSpinnerEncounter, state.Entities]),
            )
            .digest("hex");
    }
    durations.sort((a, b) => a - b);
    return {
        groups: groupCount,
        workers: groupCount * 2,
        snapshots,
        medianMilliseconds: durations[5],
        stateSha256: digest,
    };
}

if (require.main === module) {
    const source = process.argv[2] ? fs.readFileSync(path.resolve(process.argv[2]), "utf8") : undefined;
    console.log(
        JSON.stringify(
            {
                scope: "Saved rollout decision bookkeeping on open fixture maps",
                results: [1, 2, 4].map((count) => measure(count, source)),
            },
            null,
            2,
        ),
    );
}

module.exports = { rolloutFixture };
