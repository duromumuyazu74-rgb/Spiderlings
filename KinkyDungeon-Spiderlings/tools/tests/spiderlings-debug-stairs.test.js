"use strict";
const test = require("node:test"),
    assert = require("node:assert/strict"),
    fs = require("node:fs"),
    path = require("node:path"),
    vm = require("node:vm");
function fixture(mod = "SpiderlingsInfestation", legacy = false) {
    const callbacks = {},
        events = {},
        state = { complete: false, destroyedIds: [] },
        context = {
            KDEventMapGeneric: {},
            KDAddEvent(_map, trigger, _name, handler) {
                events[trigger] = handler;
            },
            Spiderlings: {
                Infestation: { activeState: () => (mod === "SpiderlingsInfestation" ? state : undefined) },
                HuntingGrounds: { activeState: () => (mod === "SpiderlingsHuntingGrounds" ? state : undefined) },
            },
            KDMapData: { MapMod: mod, EndPosition: { x: 12, y: 10 } },
            KinkyDungeonPlayerEntity: { x: 3, y: 3 },
            DrawButtonKDEx(name, callback) {
                callbacks[name] = callback;
                return "native-draw";
            },
        };
    vm.createContext(context);
    if (legacy)
        vm.runInContext(
            `
        let TestMode = true, KDDebugMode = true, KinkyDungeonDrawState = "Restart", hitDebugStairs = false;
        function MouseIn(x, y, width, height) { return hitDebugStairs && x === 1100 && y === 300 && width === 300 && height === 64; }
        function KinkyDungeonHandleHUD() {
            if (KinkyDungeonDrawState === "Restart" && TestMode && KDDebugMode && MouseIn(1100, 300, 300, 64)) {
                Object.assign(KinkyDungeonPlayerEntity, KDMapData.EndPosition); return true;
            }
            return false;
        }
    `,
            context,
        );
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsFloorSelection.js"), "utf8"), context);
    return { context, callbacks, state, events };
}
test("only successful native teleport-to-stairs callbacks bypass the current Mod objective", () => {
    for (const mod of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"]) {
        const { context: c, callbacks, state } = fixture(mod);
        const before = JSON.stringify(state);
        assert.equal(
            c.DrawButtonKDEx("debugtelestairs", () => {
                Object.assign(c.KinkyDungeonPlayerEntity, c.KDMapData.EndPosition);
                return true;
            }),
            "native-draw",
        );
        assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), false);
        assert.equal(callbacks.debugtelestairs(), true);
        assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), true);
        assert.equal(JSON.stringify(state), before, "Cheating must not destroy nests, award or complete the objective");
        c.KDMapData = JSON.parse(JSON.stringify(c.KDMapData));
        assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), true);
        c.KDMapData = { MapMod: mod, EndPosition: { x: 12, y: 10 } };
        assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), false);
    }
});
test("ordinary stairs, other debug buttons and failed teleport callbacks never bypass", () => {
    const { context: c, callbacks } = fixture();
    Object.assign(c.KinkyDungeonPlayerEntity, c.KDMapData.EndPosition);
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), false);
    c.DrawButtonKDEx("other", () => true);
    callbacks.other();
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), false);
    c.DrawButtonKDEx("debugtelestairs", () => false);
    callbacks.debugtelestairs();
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), false);
    c.DrawButtonKDEx("debugtelestairs", () => {
        throw new Error("native failure");
    });
    assert.throws(() => callbacks.debugtelestairs(), /native failure/);
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), false);
});
test("native teleport on an ordinary map does not create a Mod bypass marker", () => {
    const { context: c, callbacks } = fixture("None");
    c.DrawButtonKDEx("debugtelestairs", () => {
        Object.assign(c.KinkyDungeonPlayerEntity, c.KDMapData.EndPosition);
        return true;
    });
    callbacks.debugtelestairs();
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), false);
    assert.equal(c.KDMapData.SpiderlingsDebugStairBypass, undefined);
});

test("debug grant survives same-floor side-room return but expires on real advance and load", () => {
    const { context: c, callbacks, events } = fixture();
    c.DrawButtonKDEx("debugtelestairs", () => {
        Object.assign(c.KinkyDungeonPlayerEntity, c.KDMapData.EndPosition);
        return true;
    });
    callbacks.debugtelestairs();
    const main = JSON.parse(JSON.stringify(c.KDMapData));
    events.beforeHandleStairs({}, { AdvanceAmount: 0 });
    c.KDMapData = { MapMod: "None" };
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), false);
    c.KDMapData = main;
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), true);
    events.beforeHandleStairs({}, { AdvanceAmount: 1 });
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), false);
    callbacks.debugtelestairs();
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), true);
    const saved = JSON.parse(JSON.stringify(c.KDMapData));
    events.afterLoadGame();
    c.KDMapData = saved;
    assert.equal(
        c.Spiderlings.FloorSelection.canBypassObjective(),
        false,
        "A saved token is not an active session grant",
    );
});

test("legacy 5.4 HUD permits only the native explicit debug rectangle action", () => {
    const { context: c } = fixture("SpiderlingsInfestation", true);
    assert.equal(c.KinkyDungeonHandleHUD(), false);
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), false);
    vm.runInContext("hitDebugStairs = true; KDDebugMode = false;", c);
    assert.equal(c.KinkyDungeonHandleHUD(), false);
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), false);
    vm.runInContext("KDDebugMode = true;", c);
    assert.equal(c.KinkyDungeonHandleHUD(), true);
    assert.equal(c.Spiderlings.FloorSelection.canBypassObjective(), true);
});
