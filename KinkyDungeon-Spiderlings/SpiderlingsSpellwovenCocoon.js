"use strict";

// Item-owned layers and per-action deductions. Native costs, delayed work and
// compatibility still decide whether an action and an equipment change commit.
(() => {
    const api = globalThis.Spiderlings;
    const ID = "SpiderlingsSpellwovenCocoon";
    const MODEL = ID + "Model";
    const MAX_LAYERS = 20;
    const METHODS = new Set(["Struggle", "Remove", "Cut"]);
    let attempt;
    let committing = false;
    const item = (id) =>
        KinkyDungeonAllRestraintDynamic().find(
            (entry) => entry.item.name === ID && (id === undefined || entry.item.id === id),
        )?.item;
    const layers = (restraint = item()) => Math.max(1, Math.min(MAX_LAYERS, restraint?.data?.Spellwoven?.layers || 1));
    const loss = (density, layer) => ((0.025 * density) / (100 + density)) * (1 + (layer - 1) / (MAX_LAYERS - 1));
    function refresh() {
        KinkyDungeonDressPlayer();
        if (typeof ForceRefreshModels === "function") ForceRefreshModels(KinkyDungeonPlayer);
    }
    function grow(restraint) {
        if (!restraint || item(restraint.id) !== restraint) return;
        restraint.data ||= {};
        restraint.data.Spellwoven ||= { layers: 1, wrap: 1, serial: 0 };
        restraint.data.Spellwoven.layers = Math.min(MAX_LAYERS, layers(restraint) + 1);
        restraint.data.Spellwoven.animationAt = Date.now();
        refresh();
    }
    function equip(source) {
        if (item()) return undefined;
        const current = KinkyDungeonGetRestraintItem("ItemDevices");
        if (current && current.name !== api.Webbing.COCOON_ID) return undefined;
        const definition = KinkyDungeonGetRestraintByName(ID);
        if (KDGetBlockersToAddRestraint(definition, KinkyDungeonPlayerEntity, false).length) return undefined;
        if (
            !KDCanAddRestraint(
                definition,
                false,
                "",
                false,
                KinkyDungeonGetRestraintItem("ItemDevices"),
                true,
                true,
                source,
            )
        )
            return undefined;
        const result = KinkyDungeonAddRestraint(
            definition,
            0,
            false,
            "",
            false,
            false,
            false,
            undefined,
            "Enemy",
            false,
            undefined,
            undefined,
            true,
            source,
        );
        const applied = item();
        if (!(result > 0) || !applied) return undefined;
        applied.data ||= {};
        applied.data.Spellwoven = { layers: 1, wrap: 0.2, serial: 0 };
        refresh();
        return applied;
    }
    function wrap(restraint, amount) {
        if (!restraint?.data?.Spellwoven) return;
        restraint.data.Spellwoven.wrap = Math.max(0, Math.min(1, amount));
        refresh();
    }
    const model = api.WebbingModels.cocoonDefinition.create();
    model.Name = MODEL;
    model.Layers = {};
    AddModel(model);
    api.restraintCatalog.register({
        id: ID,
        module: "SpellwovenCocoon",
        stage: "SpellwovenCocoon",
        model: MODEL,
        restraint: {
            name: ID,
            inventory: true,
            unlimited: true,
            accessible: true,
            alwaysStruggleable: true,
            hobble: 3,
            Asset: "Web",
            Model: MODEL,
            Type: "Cocooned",
            Color: "#ffffff",
            Group: "ItemDevices",
            power: 11,
            weight: 0,
            escapeChance: { Struggle: 0.12, Remove: 0.12, Cut: 0.15 },
            speedMult: { Struggle: 1, Remove: 1, Cut: 1 },
            struggleMinSpeed: { Struggle: 0.01, Remove: 0.01, Cut: 0.01 },
            limitChance: { Struggle: 0, Remove: 0, Cut: 0 },
            affinity: {},
            helpChance: {},
            failSuffix: {},
            customEscapeSucc: "SpiderlingsCocoon",
            alwaysEscapable: ["Remove", "Struggle"],
            enemyTags: {},
            playerTags: {},
            minLevel: 0,
            allFloors: true,
            shrine: ["Wrapping", "Latex", ID],
            addTag: [...api.WebbingData.CLOSED_TAGS],
            LinkableBy: [],
            renderWhenLinked: [],
            events: [{ inheritLinked: true, trigger: "beforeSuccessRemove", type: api.Webbing.FINAL_ESCAPE_EVENT }],
        },
        text: [
            "Spellwoven Cocoon",
            "A living silk layer encloses you. Unsuccessful escape actions add another layer; quiet time lets its density decay.",
            "The newest threads tighten over the older weave.",
        ],
    });
    if (typeof KinkyDungeonStruggle === "function")
        KinkyDungeonStruggle = api.Hooks.wrap(
            "Spellwoven.attempt",
            KinkyDungeonStruggle,
            (native) =>
                function (group, method, index, query) {
                    const target = KinkyDungeonGetRestraintItem(group, index);
                    if (query || target?.name !== ID || !METHODS.has(method)) return native.apply(this, arguments);
                    const previous = attempt;
                    attempt = {
                        itemId: target.id,
                        method,
                        density: api.SilkDensity.state()?.value || 0,
                        layers: layers(target),
                        queued: false,
                        redirected: false,
                    };
                    try {
                        const result = native.apply(this, arguments);
                        if (!attempt.queued && attempt.paid && ["Fail", "Success"].includes(result) && item(target.id))
                            grow(target);
                        return attempt.redirected ? "Fail" : result;
                    } finally {
                        attempt = previous;
                    }
                },
        );
    KDAddEvent(KDEventMapGeneric, "struggle", "Spellwoven.paidAttempt", (_event, data) => {
        if (
            attempt &&
            data?.restraint?.id === attempt.itemId &&
            METHODS.has(data.struggleType) &&
            ["Fail", "Success"].includes(data.result)
        )
            attempt.paid = true;
    });
    if (typeof KDAddDelayedStruggle === "function")
        KDAddDelayedStruggle = api.Hooks.wrap(
            "Spellwoven.delayedWork",
            KDAddDelayedStruggle,
            (native) =>
                function (amount, time, method, group, index, _data) {
                    const target = KinkyDungeonGetRestraintItem(group, index);
                    if (target?.name !== ID || !METHODS.has(method)) return native.apply(this, arguments);
                    target.data ||= {};
                    const saved = (target.data.Spellwoven ||= { layers: 1, wrap: 1, serial: 0 });
                    const previous = new Set(KDGameData.DelayedActions || []);
                    const result = native.apply(this, arguments);
                    const actions = KDGameData.DelayedActions.filter(
                        (action) =>
                            !previous.has(action) &&
                            action.commit === "Struggle" &&
                            action.data?.escapeData?.restraint?.id === target.id,
                    );
                    if (!actions.length) return result;
                    if (attempt) attempt.queued = true;
                    const density = attempt?.density ?? api.SilkDensity.state()?.value ?? 0;
                    const deduction = loss(density, attempt?.layers ?? layers(target));
                    // Amounts already contain the shared density scaling at KDAddDelayedAction.
                    const total = actions.reduce((sum, action) => sum + Math.max(0, action.data.amount), 0);
                    const serial = ++saved.serial;
                    saved.pending = {
                        serial,
                        remaining: actions.length,
                        seen: [],
                        debt: Math.max(0, deduction - total),
                        method,
                    };
                    actions.forEach((action, ordinal) => {
                        action.data = {
                            ...action.data,
                            amount: total > 0 ? (action.data.amount * Math.max(0, total - deduction)) / total : 0,
                            Spellwoven: { itemId: target.id, serial, ordinal },
                        };
                    });
                    return result;
                },
        );
    if (typeof KDDelayedActionCommit !== "undefined" && typeof KDDelayedActionCommit.Struggle === "function")
        KDDelayedActionCommit.Struggle = api.Hooks.wrap(
            "Spellwoven.commit",
            KDDelayedActionCommit.Struggle,
            (native) =>
                function (action) {
                    const marker = action.data?.Spellwoven,
                        target = marker && item(marker.itemId),
                        pending = target?.data?.Spellwoven?.pending;
                    if (!marker) return native.apply(this, arguments);
                    if (!target || pending?.serial !== marker.serial || pending.seen.includes(marker.ordinal)) return;
                    const dynamic = KDGetDynamicItem(action.data.group, action.data.index);
                    if (dynamic.restraint?.id !== target.id) return;
                    pending.seen.push(marker.ordinal);
                    if (pending.debt) {
                        const channel = pending.method === "Cut" ? "cutProgress" : "struggleProgress";
                        const other = pending.method === "Cut" ? "struggleProgress" : "cutProgress";
                        const first = Math.min(target[channel] || 0, pending.debt);
                        target[channel] = Math.max(0, (target[channel] || 0) - first);
                        target[other] = Math.max(0, (target[other] || 0) - (pending.debt - first));
                        pending.debt = 0;
                    }
                    const old = committing;
                    committing = true;
                    try {
                        native.apply(this, arguments);
                    } finally {
                        committing = old;
                    }
                    pending.remaining--;
                    if (!pending.remaining && item(target.id)) {
                        delete target.data.Spellwoven.pending;
                        grow(target);
                    }
                },
        );
    if (typeof KDSuccessRemove === "function")
        KDSuccessRemove = api.Hooks.wrap(
            "Spellwoven.success",
            KDSuccessRemove,
            (native) =>
                function (method, target, lockType, index, data) {
                    if (!committing && attempt?.itemId === target?.id && target.name === ID && METHODS.has(method)) {
                        // Native early-success bypasses delayed work. Route that one paid
                        // attempt through the same net-progress calculation before removal.
                        attempt.redirected = true;
                        KDAddDelayedStruggle(
                            Math.max(0.04, data.escapeChance / Math.max(1, data.struggleTime)),
                            1,
                            method,
                            data.struggleGroup,
                            index,
                            data,
                            method === "Cut" ? target.cutProgress : target.struggleProgress,
                            100,
                        );
                        return false;
                    }
                    return native.apply(this, arguments);
                },
        );
    api.SpellwovenCocoon = Object.freeze({ ID, MAX_LAYERS, item, layers, loss, equip, wrap });
})();
