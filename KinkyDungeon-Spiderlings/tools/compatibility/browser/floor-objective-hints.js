(async () => {
    const { frame, expect, save, restore, photo } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []),
        images = {};
    const english = (key) => globalThis.compatibilityLocaleLoad?.english[key] || TextGet(key);
    const capture = async (text, label) => {
        // Fresh-save title/music toasts otherwise cover the already emitted objective message.
        await frame();
        KDMusicUpdateTime = 0;
        KDMusicY = 0;
        images[label] = await photo();
        const rendered = [...kdpixisprites.entries()]
            .filter(([, sprite]) => sprite.visible && sprite.text === text)
            .map(([id, sprite]) => ({
                text,
                width: sprite.width,
                height: sprite.height,
                scale: sprite.scale.x,
                fontSize: sprite.style.fontSize,
                effectiveFontSize: sprite.style.fontSize * sprite.scale.x,
                availableWidth: kdprimitiveparams.get(id)?.Width,
            }));
        expect(rendered.length > 0, `${label}: native message text was not drawn`);
        return rendered;
    };
    const nativeMessage = KinkyDungeonSendActionMessage;
    let messages;
    KinkyDungeonSendActionMessage = function (priority, message) {
        messages?.push(message);
        return nativeMessage.apply(this, arguments);
    };
    const drawMarkers = (x, y) => {
        const circles = [];
        const beginFill = kdminimap.beginFill,
            drawCircle = kdminimap.drawCircle;
        let color;
        kdminimap.beginFill = function (fill) {
            color = fill;
            return beginFill.apply(this, arguments);
        };
        kdminimap.drawCircle = function (cx, cy, radius) {
            circles.push({ x: cx, y: cy, radius, color });
            return drawCircle.apply(this, arguments);
        };
        try {
            KDRenderMinimap(x, y, 9, 9, 8, 1, true, false);
        } finally {
            kdminimap.beginFill = beginFill;
            kdminimap.drawCircle = drawCircle;
        }
        return circles.filter((circle) => circle.color === 0xe30022);
    };
    const stairGuard = (toTile, AdvanceAmount) => {
        const data = { toTile, AdvanceAmount };
        KinkyDungeonSendEvent("beforeStairCancel", data);
        return data.cancelevent;
    };
    try {
        for (const [modifier, target] of [
            ["SpiderlingsInfestation", 5],
            ["SpiderlingsHuntingGrounds", 3],
        ]) {
            const seed =
                modifier === "SpiderlingsHuntingGrounds"
                    ? TextGet("KDVersionStr").startsWith("5.4.")
                        ? "normal-acceptance-grv-5-2"
                        : "normal-acceptance-grv-5-0"
                    : `integration-objective-${modifier}`;
            globalThis.compatibilitySetSeed(seed);
            KinkyDungeonStartNewGame(false);
            KDToggles.Sound = false;
            MiniGameKinkyDungeonLevel = 5;
            globalThis.compatibilitySetSeed(seed);
            messages = [];
            KinkyDungeonCreateMap(
                KinkyDungeonMapParams.grv,
                "",
                modifier,
                5,
                false,
                false,
                "Maidforce",
                { x: 6, y: 5 },
                false,
            );
            const state = KDMapData[modifier];
            const entry = TextGet(`KDEscapeMethodDesc_${modifier}`);
            const entryEnglish = english(`KDEscapeMethodDesc_${modifier}`);
            const row = {
                modifier,
                target,
                language: TranslationLanguage,
                entry,
                entryMessages: [...messages],
                markers: [],
            };
            rows.push(row);
            expect(state?.status === "active" && state.targetIds.length === target, "Objective hint fixture cancelled");
            expect(messages.includes(entry), `${modifier}: native entry did not show the objective description`);
            expect(
                /original target nests/i.test(entryEnglish) &&
                    /red minimap quest markers/i.test(entryEnglish) &&
                    /later nests do not count/i.test(entryEnglish),
                `${modifier}: entry does not explain original targets, minimap markers and later nests`,
            );
            // Keep objectives and their guards; unrelated NPC artwork has separate coverage.
            for (const actor of [...KDMapData.Entities])
                if (!actor.Enemy.immobile && !state.targetIds.includes(actor.SpiderlingsNestParentID))
                    KDRemoveEntity(actor, false, false);
            row.entryRender = await capture(entry, `${modifier}-entry`);
            for (const id of state.targetIds) {
                const nest = KDMapData.Entities.find((actor) => actor.id === id);
                expect(KDEnemyHasFlag(nest, "questtarget"), "Original objective nest has no native quest marker");
                const markers = drawMarkers(nest.x - 4, nest.y - 4);
                expect(
                    markers.some((mark) => mark.x === 36 && mark.y === 36),
                    "Native minimap did not draw the target red",
                );
                row.markers.push({ id, x: nest.x, y: nest.y, markers });
            }
            expect(
                drawMarkers(KDMapData.GridWidth + 100, KDMapData.GridHeight + 100).length === 0,
                "Quest markers unexpectedly ignore the minimap viewport",
            );
            row.down = stairGuard("s", 1);
            row.up = stairGuard("S", -1);
            expect(row.down === modifier && row.up !== modifier, "Objective hint changed downward/upward admission");
            messages = [];
            KDMovePlayer(KDMapData.EndPosition.x, KDMapData.EndPosition.y, false);
            KinkyDungeonHandleStairs("s", true);
            await frame();
            row.blocked = KinkyDungeonEscapeTypes[modifier].doortext();
            row.blockedMessages = [...messages];
            expect(messages.includes(row.blocked), "Native blocked stairs did not show the objective hint");
            expect(
                row.blocked.includes(`0/${target}`) && /original target nests/i.test(english(`${modifier}Blocked`)),
                "Blocked hint lost scope or progress",
            );
            row.blockedRender = await capture(row.blocked, `${modifier}-blocked`);
            const nest = KDMapData.Entities.find((actor) => actor.id === state.targetIds[0]);
            const later = KinkyDungeonSummonEnemy(
                nest.x,
                nest.y,
                "NestEntrance",
                1,
                5,
                false,
                undefined,
                false,
                false,
                undefined,
                true,
                undefined,
                false,
                true,
            )?.[0];
            expect(
                later && !state.targetIds.includes(later.id) && !KDEnemyHasFlag(later, "questtarget"),
                "Later ordinary nest acquired objective status",
            );
            expect(
                KDRemoveEntity(later, true, false) && !state.destroyedIds.length,
                "Later nest changed the objective quota",
            );
            expect(KDRemoveEntity(nest, true, false), "Original objective nest could not be removed");
            const ids = [...state.targetIds];
            restore(save());
            await frame();
            const loaded = KDMapData[modifier];
            expect(
                JSON.stringify(loaded.targetIds) === JSON.stringify(ids) && loaded.destroyedIds.length === 1,
                "Reload changed original targets or destruction progress",
            );
            row.partial = KinkyDungeonEscapeTypes[modifier].doortext();
            expect(row.partial.includes(`1/${target}`), "Reloaded objective hint lost partial progress");
            for (const id of ids.slice(1)) {
                const original = KDMapData.Entities.find((actor) => actor.id === id);
                expect(KDRemoveEntity(original, true, false), "Remaining original target did not count");
            }
            row.complete = KinkyDungeonEscapeTypes[modifier].doortext();
            expect(
                loaded.complete && KinkyDungeonEscapeTypes[modifier].check() && !stairGuard("s", 1),
                "Completed originals still block the downward stair",
            );
            expect(row.complete.includes(`${target}/${target}`), "Completed hint lost the fixed target count");
        }
    } finally {
        KinkyDungeonSendActionMessage = nativeMessage;
    }
    return { rows, images };
})();
