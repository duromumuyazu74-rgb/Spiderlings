"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const modRoot = path.resolve(__dirname, "../../..");

function loadLifecycleRuntime(overrides = {}, beforeLoad, spinner = false) {
    const equipment = new Map();
    const loose = new Map();
    const inventoryEvents = {};
    const refreshCalls = [];
    const scheduled = [];
    const nativeStruggleInputs = [];
    const actionMessages = [];
    const errorSounds = [];
    const context = {
        console,
        KinkyDungeonEnemies: [],
        KinkyDungeonRestraints: [],
        KinkyDungeonSpellListEnemies: [],
        KDEventMapGeneric: {},
        KDEventMapInventory: {},
        KDModConfigs: {},
        KDModSettings: {},
        KinkyDungeonFlags: new Map(),
        KinkyDungeonPlayerEntity: { player: true },
        KinkyDungeonRootDirectory: "Game/",
        KDInputTypes: {
            struggle(data) {
                nativeStruggleInputs.push(data);
                return "NativeStruggle";
            },
        },
        queueMicrotask(callback) {
            scheduled.push(callback);
        },
        KDMapInit(values) {
            return Object.fromEntries((values || []).map((value) => [value, true]));
        },
        KDAddEvent(map, trigger, type, handler) {
            map[trigger] = map[trigger] || {};
            map[trigger][type] = handler;
            inventoryEvents[`${trigger}:${type}`] = handler;
        },
        KinkyDungeonAddRestraintText() {},
        KinkyDungeonGetRestraintByName(name) {
            return context.KinkyDungeonRestraints.find((restraint) => restraint.name === name);
        },
        KinkyDungeonGetRestraintItem(group) {
            return equipment.get(group);
        },
        KDDynamicLinkListSurface(root) {
            const result = [];
            let current = root;
            while (current) {
                result.push(current);
                current = current.dynamicLink;
            }
            return result;
        },
        KinkyDungeonAllRestraintDynamic() {
            const entries = [];
            for (const root of equipment.values()) {
                let item = root;
                while (item) {
                    entries.push({ item });
                    item = item.dynamicLink;
                }
            }
            return entries;
        },
        KinkyDungeonReplaceRestraintRoot(group, previous, next) {
            assert.equal(equipment.get(group), previous);
            equipment.set(group, next);
            return true;
        },
        KinkyDungeonInventoryGetLoose(name) {
            return loose.get(name);
        },
        KinkyDungeonInventoryRemove(item) {
            loose.delete(item.name);
        },
        KDCanAddRestraint() {
            return true;
        },
        KinkyDungeonAddRestraint(restraint, tightness, bypass, lock) {
            const item = {
                name: restraint.name,
                group: restraint.Group,
                restraint,
                tightness,
                lock,
                data: {},
                dynamicLink: equipment.get(restraint.Group),
            };
            equipment.set(restraint.Group, item);
            return 1;
        },
        KinkyDungeonAddRestraintIfWeaker(restraint, tightness, bypass, lock) {
            return context.KinkyDungeonAddRestraint(restraint, tightness, bypass, lock);
        },
        KinkyDungeonRemoveRestraintSpecific(item, keep, _add, _noEvent, _shrine, _unlink, _remover, forceRemove) {
            if (!item) return false;
            const group = item.group || (item.restraint && item.restraint.Group);
            const root = equipment.get(group);
            if (root === item) {
                if (item.dynamicLink) equipment.set(group, item.dynamicLink);
                else equipment.delete(group);
            } else {
                let parent = root;
                while (parent && parent.dynamicLink !== item) parent = parent.dynamicLink;
                if (!parent) return false;
                parent.dynamicLink = item.dynamicLink;
            }
            if (keep && !forceRemove) {
                const existing = loose.get(item.name);
                if (existing) existing.quantity += 1;
                else loose.set(item.name, { name: item.name, type: "LooseRestraint", quantity: 1 });
            }
            return [item];
        },
        KDUpdateLinkCaches(root) {
            refreshCalls.push(["links", root]);
        },
        KinkyDungeonUpdateRestraints() {
            refreshCalls.push(["restraints"]);
        },
        KinkyDungeonCalculateSlowLevel() {
            refreshCalls.push(["slow"]);
        },
        KinkyDungeonUpdateStruggleGroups() {
            refreshCalls.push(["struggle"]);
        },
        TextGet(key) {
            const names = {
                RestraintSpiderlingsWebbingLv1Arm: "Arm Webbing",
                RestraintSpiderlingsWebbingLv2Arm: "Lv2 Arm Webbing",
            };
            return names[key] || key;
        },
        KinkyDungeonSendActionMessage(...args) {
            actionMessages.push(args);
        },
        KDSoundEnabled() {
            return true;
        },
        AudioPlayInstantSoundKD(sound) {
            errorSounds.push(sound);
        },
        ...overrides,
    };
    context.globalThis = context;
    context.window = context;
    vm.createContext(context);
    if (beforeLoad) beforeLoad(context);
    for (const file of [
        "SpiderlingsCore.js",
        "SpiderlingsEncounters.js",
        "SpiderlingsWebCaster.js",
        "SpiderlingsCombat.js",
        "SpiderlingsWebbingData.js",
        "SpiderlingsWebbingRules.js",
        "SpiderlingsWebbing.js",
        ...(spinner ? ["SpiderlingsSpinnerCapture.js"] : []),
    ]) {
        vm.runInContext(fs.readFileSync(path.join(modRoot, file), "utf8"), context, { filename: file });
    }

    function nativeInventoryEquip(restraint) {
        const owned = loose.get(restraint.name);
        context.KinkyDungeonFlags.set("SelfBondage", 1);
        const added = context.KinkyDungeonAddRestraintIfWeaker(restraint, 0, true, "");
        if (!(Number(added) > 0)) return false;
        if (owned.quantity > 1) owned.quantity -= 1;
        else loose.delete(owned.name);
        const applied = context
            .KinkyDungeonAllRestraintDynamic()
            .map((entry) => entry.item)
            .find((item) => item.name === restraint.name);
        inventoryEvents["postApply:SpiderlingsNormalizeManualChain"]({ trigger: "postApply" }, applied, {
            item: applied,
        });
        return true;
    }

    function flushScheduled() {
        while (scheduled.length) scheduled.shift()();
    }

    function dispatchInventoryFlow(trigger, data = {}) {
        for (const root of equipment.values()) {
            let current = root;
            while (current) {
                const restraint = current.restraint || context.KinkyDungeonGetRestraintByName(current.name) || {};
                for (const event of restraint.events || []) {
                    const handler = inventoryEvents[`${trigger}:${event.type}`];
                    if (event.trigger === trigger && handler) handler(event, current, data);
                }
                current = current.dynamicLink;
            }
        }
        flushScheduled();
    }

    return {
        context,
        dispatchInventoryFlow,
        equipment,
        flushScheduled,
        loose,
        inventoryEvents,
        nativeInventoryEquip,
        refreshCalls,
        nativeStruggleInputs,
        actionMessages,
        errorSounds,
    };
}

function item(name, state = {}) {
    return {
        name,
        group: state.group,
        tightness: state.tightness || 0,
        lock: state.lock || "",
        data: state.data || {},
        ...state,
    };
}

module.exports = { loadLifecycleRuntime, item, modRoot };
