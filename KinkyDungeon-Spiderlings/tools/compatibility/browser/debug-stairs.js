(async () => {
    const { frame, expect, save, restore, photo } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []),
        images = {};
    KDToggles.Sound = false;
    for (const mod of ["SpiderlingsInfestation", "SpiderlingsHuntingGrounds"]) {
        KinkyDungeonStartNewGame(false);
        MiniGameKinkyDungeonLevel = 5;
        KDGameData.JourneyY = 3;
        KDsetSeed(`test70-debug-stairs-${mod}`);
        KinkyDungeonCreateMap(KinkyDungeonMapParams.grv, "", mod, 5, false, false, undefined, { x: 0, y: 5 }, false);
        const objective = KDMapData[mod];
        expect(objective?.status === "active" && !objective.complete, "Native special-floor objective absent");
        const progress = JSON.stringify(objective);
        const guard = () => {
            const data = { toTile: "s", AdvanceAmount: 1 };
            KinkyDungeonSendEvent("beforeStairCancel", data);
            return data.cancelevent;
        };
        const row = {
            mod,
            targetIds: [...objective.targetIds],
            before: { escape: KDCanEscape(KDGetEscapeMethod(MiniGameKinkyDungeonLevel)), cancel: guard() },
        };
        rows.push(row);
        expect(!row.before.escape && row.before.cancel === mod, "Ordinary unfinished objective was bypassed");
        images[`${mod}-objective`] = await photo();
        const teleport = async () => {
            TestMode = true;
            KDDebugMode = true;
            KinkyDungeonDrawState = "Restart";
            await frame();
            await frame();
            if (KDButtonsCache.debugtelestairs) {
                expect(KDClickButton("debugtelestairs", "test"), "Native debug button did not succeed");
            } else {
                const previousX = MouseX,
                    previousY = MouseY;
                MouseX = 1250;
                MouseY = 332;
                try {
                    expect(KinkyDungeonHandleHUD(), "Legacy native debug click did not succeed");
                } finally {
                    MouseX = previousX;
                    MouseY = previousY;
                }
            }
            KinkyDungeonDrawState = "Game";
            await frame();
            expect(Spiderlings.FloorSelection.canBypassObjective(), "Native debug button did not grant Mod passage");
        };
        await teleport();
        row.after = {
            escape: KDCanEscape(KDGetEscapeMethod(MiniGameKinkyDungeonLevel)),
            cancel: guard(),
            objectiveUnchanged: JSON.stringify(KDMapData[mod]) === progress,
            quota: KDMapData.QuestQuota,
        };
        expect(
            row.after.escape && !row.after.cancel && row.after.objectiveUnchanged,
            "Debug passage changed objective or retained a guard",
        );
        images[`${mod}-teleported`] = await photo();
        restore(save());
        await frame();
        row.afterReload = {
            bypass: Spiderlings.FloorSelection.canBypassObjective(),
            escape: KDCanEscape(KDGetEscapeMethod(MiniGameKinkyDungeonLevel)),
        };
        expect(!row.afterReload.bypass && !row.afterReload.escape, "Debug grant leaked through save/load");
        await teleport();
        const oldMap = KDMapData,
            oldLevel = MiniGameKinkyDungeonLevel;
        KinkyDungeonConfirmStairs = true;
        KinkyDungeonLastAction = "Wait";
        KinkyDungeonHandleMoveToTile(KinkyDungeonMapGet(KinkyDungeonPlayerEntity.x, KinkyDungeonPlayerEntity.y));
        for (let tick = 0; tick < 90 && KDMapData === oldMap; tick++) await frame();
        row.transition = {
            changedMap: KDMapData !== oldMap,
            oldLevel,
            newLevel: MiniGameKinkyDungeonLevel,
            state: KinkyDungeonState,
            bypass: Spiderlings.FloorSelection.canBypassObjective(),
            oldMarker: oldMap.SpiderlingsDebugStairBypass,
        };
        expect(
            row.transition.changedMap &&
                row.transition.newLevel > oldLevel &&
                !row.transition.bypass &&
                !row.transition.oldMarker,
            "Actual native stair transition or grant cleanup failed",
        );
        images[`${mod}-next-map`] = await photo();
    }
    return { rows, images };
})();
