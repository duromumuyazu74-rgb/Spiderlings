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

    if (typeof KDInputTypes !== "undefined")
        KDInputTypes.spiderlingsSpinnerDoorway = () =>
            setupFromNearbySpinners().started ? "SpinnerDoorwayStarted" : "SpinnerDoorwayBlocked";

    api.SpinnerScenarios = { SCENARIO, plan, setupDoorway, setupFromNearbySpinners };
})();
