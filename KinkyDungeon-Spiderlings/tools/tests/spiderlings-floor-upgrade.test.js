"use strict";
const test = require("node:test"),
    assert = require("node:assert/strict"),
    fs = require("node:fs"),
    path = require("node:path"),
    vm = require("node:vm");
function fixture(config = { spiderlingsInfestationWeight: "50", spiderlingsHuntingGroundsWeight: "1000" }) {
    const events = {},
        writes = [];
    const c = {
        Spiderlings: { getSetting: (name) => c.KDModSettings.Spiderlings[name] },
        KDModSettings: { Spiderlings: config, OtherMod: { chance: 0.7 } },
        KDGameData: { JourneyY: 12, JourneyMap: {} },
        KDWorldMap: {},
        KDMapMods: {},
        KDMapModRefreshList: [],
        KDJourneySlotTypes: { basic() {} },
        KDGetSideRoom: (slot, top) => ({ name: top ? "top-" + slot.EscapeMethod : "bottom", hidden: top }),
        KDIsHellFloor: (y) => y === 19,
        KDRandom: () => 0.01,
        KDEventMapGeneric: {},
        KDAddEvent(_map, event, name, fn) {
            (events[event] ||= {})[name] = fn;
        },
        localStorage: {
            setItem(key, value) {
                writes.push({ key, value });
            },
        },
    };
    for (const name of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"])
        c.KDMapMods[name] = {
            name,
            escapeMethod: name,
            get weight() {
                return c.Spiderlings.FloorSelection.weight(name);
            },
            filter: (s) => (s.Faction && (name === "SpiderlingsInfestation" || s.Faction === "Maidforce") ? 1 : 0),
        };
    vm.createContext(c);
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../../SpiderlingsFloorSelection.js"), "utf8"), c);
    assert.equal(writes.length, 0, "Mod scripts must not write settings before the native settings-load event");
    for (const fn of Object.values(events.afterModSettingsLoad || {})) fn();
    return {
        c,
        writes,
        event(name) {
            for (const fn of Object.values(events[name] || {})) fn();
        },
    };
}
const slot = (y, extra = {}) => ({
    type: "basic",
    x: 0,
    y,
    MapMod: "None",
    EscapeMethod: "Key",
    RoomType: "",
    Faction: "Bandit",
    SideRooms: ["old"],
    HiddenRooms: {},
    ...extra,
});
test("test90 upgrades the two old floor defaults once and persists deliberate later settings", () => {
    const r = fixture();
    assert.equal(r.c.KDModSettings.Spiderlings.spiderlingsInfestationWeight, "200");
    assert.equal(r.c.KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight, "2000");
    assert.equal(r.writes.length, 1);
    assert.equal(JSON.parse(r.writes[0].value).OtherMod.chance, 0.7);
    const persisted = JSON.parse(r.writes[0].value).Spiderlings;
    persisted.spiderlingsInfestationWeight = "50";
    persisted.spiderlingsHuntingGroundsWeight = "1000";
    const reload = fixture(persisted);
    reload.event("afterModSettingsLoad");
    assert.equal(reload.c.KDModSettings.Spiderlings.spiderlingsInfestationWeight, "50");
    assert.equal(reload.c.KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight, "1000");
    assert.equal(reload.writes.length, 0);
});
test("test90 retains disabled and custom values and handles native settings loaded after scripts", () => {
    const r = fixture({ spiderlingsInfestationWeight: "0", spiderlingsHuntingGroundsWeight: "750" });
    assert.equal(r.c.KDModSettings.Spiderlings.spiderlingsInfestationWeight, "0");
    assert.equal(r.c.KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight, "750");
    r.c.KDModSettings.Spiderlings = { spiderlingsInfestationWeight: 50, spiderlingsHuntingGroundsWeight: 1000 };
    r.event("afterModSettingsLoad");
    assert.equal(r.c.KDModSettings.Spiderlings.spiderlingsInfestationWeight, "200");
    assert.equal(r.c.KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight, "2000");
});
test("test90 supplements only untouched future ordinary previews once, protecting cached maps even with visited false", () => {
    const r = fixture(),
        c = r.c;
    c.KDGameData.JourneyMap = {
        past: slot(7),
        current: slot(12),
        future: slot(13),
        cached: slot(14),
        visited: slot(15, { visited: true }),
        boss: slot(16, { type: "boss", protected: true }),
        special: slot(17, { RoomType: "PerkRoom" }),
        existing: slot(18, {
            MapMod: "SpiderlingsHuntingGrounds",
            EscapeMethod: "SpiderlingsHuntingGrounds",
            Faction: "Maidforce",
        }),
        hell: slot(19),
    };
    c.KDWorldMap.cache = { jx: 0, jy: 14, data: {} };
    const before = JSON.parse(JSON.stringify(c.KDGameData.JourneyMap));
    r.event("afterLoadGame");
    assert.equal(c.KDGameData.JourneyMap.future.MapMod, "SpiderlingsInfestation");
    assert.equal(c.KDGameData.JourneyMap.future.Faction, "Bandit");
    assert.deepEqual(Array.from(c.KDGameData.JourneyMap.future.SideRooms), ["top-SpiderlingsInfestation", "bottom"]);
    for (const name of Object.keys(before).filter((k) => k !== "future"))
        assert.deepEqual(JSON.parse(JSON.stringify(c.KDGameData.JourneyMap[name])), before[name], name);
    const after = JSON.stringify(c.KDGameData);
    c.KDRandom = () => 0.9;
    r.event("afterLoadGame");
    assert.equal(JSON.stringify(c.KDGameData), after);
});
test("test90 leaves new journeys and saves with custom or zero settings alone", () => {
    for (const config of [
        { spiderlingsInfestationWeight: "0", spiderlingsHuntingGroundsWeight: "0" },
        { spiderlingsInfestationWeight: "120", spiderlingsHuntingGroundsWeight: "750" },
    ]) {
        const r = fixture(config);
        r.c.KDGameData.JourneyMap.future = slot(13);
        const before = JSON.stringify(r.c.KDGameData);
        r.event("afterLoadGame");
        assert.equal(JSON.stringify(r.c.KDGameData), before);
    }
    const r = fixture();
    r.c.KDGameData.JourneyMap.future = slot(13);
    r.event("afterNewGame");
    r.event("afterLoadGame");
    assert.equal(r.c.KDGameData.JourneyMap.future.MapMod, "None");
});

test("test91 lowers saved test90 defaults once without redrawing its journey", () => {
    const r = fixture({
        spiderlingsInfestationWeight: "200",
        spiderlingsHuntingGroundsWeight: "1500",
        spiderlingsFloorWeights90: { changed: ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"] },
    });
    assert.equal(r.c.KDModSettings.Spiderlings.spiderlingsInfestationWeight, "200");
    assert.equal(r.c.KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight, "2000");
    r.c.KDGameData.SpiderlingsFloorWeights90 = true;
    r.c.KDGameData.JourneyMap.future = slot(13);
    r.event("afterLoadGame");
    assert.equal(r.c.KDGameData.JourneyMap.future.MapMod, "None");
    const saved = JSON.parse(r.writes[0].value).Spiderlings;
    saved.spiderlingsInfestationWeight = "200";
    saved.spiderlingsHuntingGroundsWeight = "1500";
    const reload = fixture(saved);
    assert.equal(reload.c.KDModSettings.Spiderlings.spiderlingsInfestationWeight, "200");
    assert.equal(reload.c.KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight, "1500");
    assert.equal(reload.writes.length, 0);
});

test("test97 restores saved lower defaults once and preserves zero and custom weights", () => {
    const r = fixture({
        spiderlingsInfestationWeight: "180",
        spiderlingsHuntingGroundsWeight: "1400",
        spiderlingsFloorWeights90: {},
        spiderlingsFloorWeights91: true,
    });
    assert.equal(r.c.KDModSettings.Spiderlings.spiderlingsInfestationWeight, "200");
    assert.equal(r.c.KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight, "2000");
    const saved = JSON.parse(r.writes[0].value).Spiderlings;
    saved.spiderlingsInfestationWeight = "180";
    saved.spiderlingsHuntingGroundsWeight = "0";
    const reload = fixture(saved);
    assert.equal(reload.c.KDModSettings.Spiderlings.spiderlingsInfestationWeight, "180");
    assert.equal(reload.c.KDModSettings.Spiderlings.spiderlingsHuntingGroundsWeight, "0");
    assert.equal(reload.writes.length, 0);
});
