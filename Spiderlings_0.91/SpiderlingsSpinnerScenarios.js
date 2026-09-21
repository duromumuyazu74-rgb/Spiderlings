"use strict";

// Disposable native scenarios supply actors and plans to the same runtime used by later floor activation.
(() => {
    const api = globalThis.Spiderlings,
        SCENARIO = "SpiderlingsSpinnerDoorway";

    function plan(fieldId, ownerIds, anchors) {
        const preview = api.SpinnerTopology.createLine({ fieldId, owners: ownerIds, anchors }),
            link = preview.links[0],
            actions = ownerIds.map(() => []);
        actions[0].push({ type: "placeAnchor", anchorId: preview.anchors[0].id });
        actions[1 % actions.length].push({ type: "placeAnchor", anchorId: preview.anchors[1].id });
        const extensions = link.plannedCells.length ? link.plannedCells : [undefined];
        extensions.forEach((cell, index) =>
            actions[index % actions.length].push({ type: "extendLink", linkId: link.id, ...(cell ? { cell } : {}) }),
        );
        return Object.fromEntries(ownerIds.map((id, index) => [id, { actions: actions[index] }]));
    }

    function setupDoorway(input = {}) {
        const owners = (input.ownerIds || []).filter((id) => id !== undefined),
            x = input.x ?? KinkyDungeonPlayerEntity.x + 4,
            centerY = input.y ?? KinkyDungeonPlayerEntity.y,
            anchors = input.anchors || [
                { x, y: centerY - 2 },
                { x, y: centerY + 2 },
            ],
            fieldId = input.fieldId || `${SCENARIO}:${KinkyDungeonCurrentTick || 0}`;
        if (owners.length !== 2) return { started: false, reason: "owners" };
        const encounter = api.SpinnerNativeField.initializeMap({
            fieldId,
            owners,
            anchors,
            scenario: SCENARIO,
            builders: plan(fieldId, owners, anchors),
        });
        return { started: true, encounter };
    }

    function setupFromNearbySpinners() {
        const owners = KDMapData.Entities.filter(
            (entity) => entity.hp > 0 && entity.Enemy?.name === "Spinner" && KDHostile(entity),
        )
            .slice(0, 2)
            .map((entity) => entity.id);
        return setupDoorway({ ownerIds: owners });
    }

    const rectangle = (left, top, right, bottom) => [
        { x: left, y: top },
        { x: right, y: top },
        { x: right, y: bottom },
        { x: left, y: bottom },
    ];

    function setupEnclosure(input = {}) {
        const owners = (input.ownerIds || []).filter((id) => id !== undefined);
        if (owners.length < 2) return { started: false, reason: "owners" };
        const encounter = api.SpinnerNativeField.initializeEnclosure({
            compositeId: input.compositeId || `${input.scenario || "SpinnerEnclosure"}:${KinkyDungeonCurrentTick || 0}`,
            groupId: input.groupId || "scenario",
            owners,
            layers: input.layers,
            fallbackLine: input.fallbackLine,
            scenario: input.scenario || "enclosure",
            map: input.map,
        });
        return { started: encounter.topology.kind !== "abandoned", encounter, reason: encounter.topology.reason };
    }

    function setupRegular(input = {}) {
        return setupEnclosure({
            ...input,
            scenario: "SpinnerRegularEnclosure",
            compositeId: input.compositeId || "spinner-regular",
            layers: [{ id: "inner", vertices: rectangle(20, 5, 24, 13), gate: { x: 20, y: 9 } }],
        });
    }

    function setupConcave(input = {}) {
        return setupEnclosure({
            ...input,
            scenario: "SpinnerConcaveEnclosure",
            compositeId: input.compositeId || "spinner-concave",
            layers: [
                {
                    id: "inner",
                    vertices: [
                        { x: 15, y: 5 },
                        { x: 22, y: 5 },
                        { x: 22, y: 12 },
                        { x: 20, y: 12 },
                        { x: 20, y: 10 },
                        { x: 15, y: 10 },
                    ],
                    core: { x: 18, y: 8 },
                    gate: { x: 15, y: 7 },
                },
            ],
        });
    }

    function setupNested(input = {}) {
        return setupEnclosure({
            ...input,
            scenario: "SpinnerNestedEnclosure",
            compositeId: input.compositeId || "spinner-nested",
            layers: [
                { id: "inner", vertices: rectangle(10, 7, 16, 13), gate: { x: 10, y: 10 } },
                { id: "outer", vertices: rectangle(7, 4, 19, 16), gate: { x: 7, y: 10 } },
            ],
        });
    }

    function setupInsufficient(input = {}) {
        return setupEnclosure({
            ...input,
            scenario: "SpinnerInsufficientEnclosure",
            compositeId: input.compositeId || "spinner-insufficient",
            layers: [{ id: "inner", vertices: rectangle(4, 4, 7, 7), gate: { x: 4, y: 5 } }],
            fallbackLine: input.fallbackLine || {
                fieldId: "spinner-insufficient-line",
                anchors: [
                    { x: 8, y: 8 },
                    { x: 8, y: 12 },
                ],
            },
        });
    }

    if (typeof KDInputTypes !== "undefined")
        KDInputTypes.spiderlingsSpinnerDoorway = () =>
            setupFromNearbySpinners().started ? "SpinnerDoorwayStarted" : "SpinnerDoorwayBlocked";

    api.SpinnerScenarios = {
        SCENARIO,
        plan,
        setupDoorway,
        setupFromNearbySpinners,
        setupEnclosure,
        setupRegular,
        setupConcave,
        setupNested,
        setupInsufficient,
    };
})();
