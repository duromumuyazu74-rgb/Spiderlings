"use strict";

// Spiderlings shared namespace / Spiderlings 共享命名空间。
// KD loads mod files as global scripts, so a namespace is safer than many globals.
// KD 会把 mod 文件作为全局脚本加载，因此使用命名空间比散落多个全局变量更安全。
(() => {
    const api = (globalThis.Spiderlings = globalThis.Spiderlings || {});

    // Track only Spiderlings wrappers; each installer supplies its native function.
    api.Hooks ||= (() => {
        const chains = new WeakMap();
        return Object.freeze({
            wrap(owner, native, create) {
                if (typeof native !== "function") return native;
                const chain = chains.get(native) || [];
                const existing = chain.find((entry) => entry.owner === owner);
                if (existing) {
                    existing.handler = create(existing.native);
                    return native;
                }
                const entry = { owner, native, handler: create(native) };
                const wrapped = function (...args) {
                    return entry.handler.apply(this, args);
                };
                chains.set(wrapped, [...chain, entry]);
                return wrapped;
            },
            describe(handler) {
                return (chains.get(handler) || []).map((entry) => entry.owner);
            },
        });
    })();

    // KD 5.5.3 summon messages use KDPlayer() when the caster is gone.
    // KDIsSubbier then calls the NPC-only KDCanDom on that player, which has
    // no Enemy definition. Keep player pronouns/messages and all NPC checks.
    if (typeof KDIsSubbier == "function") {
        const nativeIsSubbier = KDIsSubbier;
        KDIsSubbier = function (player, enemy) {
            if (enemy?.player) return false;
            return nativeIsSubbier.apply(this, arguments);
        };
    }

    const MOD_ID = "Spiderlings";
    api.MOD_ID = MOD_ID;

    // Registration helper: replace by name instead of duplicating entries on reload.
    // 注册工具：按 name 覆盖旧条目，避免重复加载 mod 后出现同名怪物/拘束/法术多份。
    api.registerNamed = function (array, object) {
        const index = array.findIndex((entry) => entry.name === object.name);
        if (index >= 0) array.splice(index, 1, object);
        else array.push(object);
    };

    const RESTRAINT_COMMON_SHRINES = Object.freeze(["Latex", "SpiderlingsWeb"]);
    const RESTRAINT_REFRESH_TRIGGERS = Object.freeze(["postApply", "postRemoval", "afterDress"]);
    const RESTRAINT_REFRESH_EVENT = "SpiderlingsRefreshModels";
    const restraintCatalogEntries = new Map();

    function addUnique(list, value) {
        const result = Array.isArray(list) ? list : [];
        if (!result.includes(value)) result.push(value);
        return result;
    }

    function describeRestraintDefinition(definition) {
        const restraint = definition && definition.restraint;
        const id = definition && (definition.id || (restraint && restraint.name));
        const model = definition && (definition.model || (restraint && restraint.Model));
        if (!id) throw new TypeError("Spiderlings restraint definitions require an id or restraint.name.");
        if (model && (/\.png$/i.test(model) || /[\\/]/.test(model))) {
            throw new TypeError(`Spiderlings restraint ${id} must reference a logical model name, not a PNG path.`);
        }
        return Object.freeze({
            id,
            module: definition.module || null,
            stage: definition.stage || null,
            model: model || null,
        });
    }

    function buildRestraint(definition) {
        const restraint = definition.restraint;
        if (!restraint || typeof restraint != "object")
            throw new TypeError("Spiderlings restraint definitions require restraint data.");
        for (const shrine of RESTRAINT_COMMON_SHRINES) restraint.shrine = addUnique(restraint.shrine, shrine);
        restraint.events = Array.isArray(restraint.events) ? restraint.events : [];
        for (const trigger of RESTRAINT_REFRESH_TRIGGERS) {
            if (
                !restraint.events.some((event) => event.trigger === trigger && event.type === RESTRAINT_REFRESH_EVENT)
            ) {
                restraint.events.push({ inheritLinked: true, trigger, type: RESTRAINT_REFRESH_EVENT });
            }
        }
        return restraint;
    }

    api.restraintCatalog = Object.freeze({
        describe: describeRestraintDefinition,
        list() {
            return [...restraintCatalogEntries.values()];
        },
        register(definition) {
            const descriptor = describeRestraintDefinition(definition);
            const restraint = buildRestraint(definition);
            restraintCatalogEntries.set(
                descriptor.id,
                Object.freeze({
                    ...descriptor,
                    restraint,
                }),
            );
            api.registerNamed(KinkyDungeonRestraints, restraint);
            if (definition.text) api.registerRestraintText(descriptor.id, ...definition.text);
            return restraint;
        },
    });

    api.registerRestraintText = function (name, displayName, description, flavorText) {
        if (typeof KinkyDungeonAddRestraintText != "function") return false;
        const entry = restraintCatalogEntries.get(name);
        if (entry) {
            restraintCatalogEntries.set(
                name,
                Object.freeze({
                    ...entry,
                    text: Object.freeze([displayName, description, flavorText]),
                }),
            );
        }
        KinkyDungeonAddRestraintText(name, displayName, description, flavorText);
        return true;
    };

    // Add a restraint to KinkyDungeonRestraints / 添加拘束到 KinkyDungeonRestraints。
    api.createRestraint = function (object) {
        return api.restraintCatalog.register({ restraint: object });
    };

    api.addSpells = function (spells) {
        for (let spell of spells) api.registerNamed(KinkyDungeonSpellListEnemies, spell);
    };
})();
