/* global KDGetEscapeMinimapText */
(async () => {
    const { setup, expect, save, restore } = globalThis.normalAcceptance;
    const kind = "SpiderlingsHuntingGrounds";
    setup("cancelled-hunting-objective-entry");
    const prepareFloor = Spiderlings.Population.prepareFloor;
    try {
        // Inject an exhausted budget at its production boundary; the Hunting setting has a +20 allowance.
        Spiderlings.Population.prepareFloor = function (...args) {
            const result = prepareFloor.apply(this, args);
            return args[0] === kind ? { ...result, cap: 1 } : result;
        };
        MiniGameKinkyDungeonLevel = 5;
        KinkyDungeonCreateMap(
            KinkyDungeonMapParams.grv,
            "",
            kind,
            5,
            false,
            false,
            "Maidforce",
            { x: 0, y: 5 },
            false,
            "",
            0,
            kind,
        );
        const state = KDMapData[kind];
        expect(state?.status === "cancelled", "Under-budget fixture did not cancel the objective");
        expect(KDGetEscapeMethod(5) === "Key", "Cancelled generation retained the stale Hunting escape type");
        expect(!KinkyDungeonEscapeTypes[kind].check(), "Cancelled objectives were awarded completion");
        // Earlier saves retain the type after the objective itself was cancelled.
        KDMapData.EscapeMethod = kind;
        restore(save());
        expect(KDGetEscapeMethod(5) === "Key", "Loading retained a green 0/3 cancelled objective");
        expect(!KDMapData[kind].complete, "Loading fabricated completed progress");
        expect(!KDGetEscapeMinimapText("Key").includes("0/3"), "Native fallback still shows a nest task");
        return { status: "passed", reason: state.reason, method: KDGetEscapeMethod(5), complete: false };
    } finally {
        Spiderlings.Population.prepareFloor = prepareFloor;
    }
})();
