(async () => {
    const { setup: nativeSetup, frame, expect, save, restore } = globalThis.normalAcceptance;
    const rows = (globalThis.normalTrace = []);
    let clock = 0;
    KDAddEvent(KDEventMapGeneric, "tickAfter", "SpiderlingsNativeEscapeAcceptance", (_event, data) => {
        if (data.delta > 0) clock += data.delta;
    });
    const setup = (seed, knife = true) => {
        nativeSetup(seed);
        for (let y = 1; y < KDMapData.GridHeight - 1; y++)
            for (let x = 1; x < KDMapData.GridWidth - 1; x++) {
                KinkyDungeonMapSet(x, y, "0");
                KinkyDungeonTilesDelete(`${x},${y}`);
            }
        KDMovePlayer(10, 10, false);
        KDGameData.DelayedActions = [];
        if (!knife) {
            for (const item of KinkyDungeonAllWeapon()) KinkyDungeonInventoryRemove(item);
            KDGameData.PreviousWeapon = [];
        } else if (!KinkyDungeonInventoryGetWeapon("Knife")) KinkyDungeonInventoryAddWeapon("Knife");
        KDSetWeapon(knife ? "Knife" : null);
        KinkyDungeonUpdateStats(0);
        KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
        clock = 0;
    };
    const equip = (id) =>
        KinkyDungeonAddRestraint(
            KinkyDungeonGetRestraintByName(id),
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
        );
    const wait = async () => {
        KinkyDungeonLastAction = "Wait";
        KDSendInput("tick", { delta: 1 });
        await frame();
    };
    const escape = async (id, method) => {
        const group = KinkyDungeonGetRestraintByName(id).Group;
        let actions = 0,
            rests = 0,
            spent = 0;
        while (KinkyDungeonAllRestraintDynamic().some(({ item }) => item.name === id) && clock < 160) {
            const data = {};
            KinkyDungeonStruggle(group, method, 0, true, data);
            if (method === "Cut" && !data.canCut && !data.hasAffinity) break;
            if (KinkyDungeonStatStamina < -data.cost) {
                await wait();
                rests++;
            } else {
                const before = clock;
                KDSendInput("struggle", { group, type: method, index: 0 });
                await frame();
                actions++;
                spent -= data.cost;
                expect(clock > before, "Native escape input was rejected");
                for (let n = 0; KDGameData.DelayedActions.length && n < 10; n++) await wait();
            }
        }
        return {
            id,
            method,
            actions,
            rests,
            spent,
            turns: clock,
            escaped: !KinkyDungeonAllRestraintDynamic().some(({ item }) => item.name === id),
            remaining: KinkyDungeonAllRestraintDynamic().length,
        };
    };
    const ids = [
        "SpiderlingsWebbingLv1Legs",
        "SpiderlingsWebbingLv2Legs",
        "SpiderlingsWebbingLv3Legs",
        "SpiderlingsSpinnerLegbinder",
        "SpiderlingsWebbingCocoon",
        "SpiderlingsWebbingLv2Arm",
        "SpiderlingsWebbingLv3Arm",
    ];
    for (const id of ids)
        for (const method of ["Cut", "Remove", "Struggle"])
            for (let seed = 0; seed < 2; seed++) {
                setup(`native-escape-${seed}`);
                equip(id);
                const item = KinkyDungeonAllRestraintDynamic().find((entry) => entry.item.name === id).item;
                const progress = () =>
                    JSON.stringify([
                        item.cutProgress || 0,
                        item.struggleProgress || 0,
                        item.removeProgress || 0,
                        item.pickProgress || 0,
                    ]);
                const before = progress();
                for (let n = 0; n < 3; n++)
                    KinkyDungeonStruggle(KinkyDungeonGetRestraintByName(id).Group, method, 0, true, {});
                expect(progress() === before, `A query changed native progress: ${id}/${method}`);
                const row = await escape(id, method);
                rows.push(row);
                expect(row.escaped, `${id}/${method} failed ordinary-panel calibration: ${JSON.stringify(row)}`);
                if (id.includes("Lv1")) expect(row.actions === 1, "Lv1 ordinary calibration changed");
                if (id.includes("Lv2")) expect(row.actions === 2, "Lv2 ordinary calibration changed");
                if (id.includes("Lv3"))
                    expect(row.actions >= 2 && row.actions <= 4, "Lv3 strength is outside calibration");
            }
    for (const method of ["Cut", "Remove", "Struggle"]) {
        setup(`native-full-cocoon-${method}`);
        KDPerkStart.SpiderlingsCocoonStart();
        KinkyDungeonUpdateStats(0);
        KinkyDungeonMapSet(10, 10, "/");
        const row = await escape(ids[4], method);
        rows.push({ ...row, mode: "full-sharp" });
        expect(row.escaped && row.remaining === 23, "Cocoon escape removed or lost its inner equipment");
        expect(row.actions >= 6, "Full cocoon lost its substantial native progress requirement");
    }
    const cocoonRows = rows.filter((row) => row.mode === "full-sharp");
    expect(
        cocoonRows[0].turns < cocoonRows[1].turns && cocoonRows[0].spent < cocoonRows[1].spent,
        "Cut is not the best available method for the full cocoon",
    );
    setup("native-no-cutting-tool", false);
    equip(ids[4]);
    KinkyDungeonUpdateStats(0);
    const inaccessible = {};
    KinkyDungeonStruggle("ItemDevices", "Cut", 0, true, inaccessible);
    expect(!inaccessible.canCut && !inaccessible.hasAffinity, "Cocoon bypasses native cutting access");
    setup("native-escape-old-save");
    equip(ids[1]);
    const item = KinkyDungeonGetRestraintItem("ItemLegs");
    item.data = { ...item.data, SpiderlingsEscapeActions: 1 };
    item.cutProgress = 0.23;
    restore(save());
    const migrated = KinkyDungeonGetRestraintItem("ItemLegs");
    expect(
        migrated?.struggleProgress === 0.5 && migrated.cutProgress === 0.23,
        "Old counted save lost native progress during migration",
    );
    expect(!("SpiderlingsEscapeActions" in migrated.data), "Old count gate survived migration");
    rows.push({ mode: "migration", nativeProgress: migrated.struggleProgress, cutProgress: migrated.cutProgress });
    setup("native-escape-impossible-message");
    equip(ids[2]);
    KinkyDungeonApplyBuffToEntity(KinkyDungeonPlayerEntity, {
        id: "Lockdown",
        type: "Lockdown",
        power: 3,
        duration: 120,
    });
    const blocked = KinkyDungeonGetRestraintItem("ItemLegs"),
        attempts = [];
    for (let attempt = 0; attempt < 4; attempt++) {
        const data = {};
        KinkyDungeonStruggle("ItemLegs", "Struggle", 0, true, data);
        expect(data.escapeChance < -0.12, "Fixture no longer reaches native impossibility");
        for (let rests = 0; KinkyDungeonStatStamina < -data.cost && rests < 30; rests++) await wait();
        expect(KinkyDungeonStatStamina >= -data.cost, "Native impossible attempt lacks stamina");
        const nativeText = TextGet,
            lookups = [],
            before = clock;
        TextGet = function (key) {
            const value = nativeText.apply(this, arguments);
            if (key.startsWith("KinkyDungeonStruggle")) lookups.push({ key, value });
            return value;
        };
        try {
            KDSendInput("struggle", { group: "ItemLegs", type: "Struggle", index: 0 });
        } finally {
            TextGet = nativeText;
        }
        await frame();
        expect(clock > before, "Native impossible struggle input was rejected");
        attempts.push({ attempt: attempt + 1, lookups, message: KinkyDungeonActionMessage });
    }
    const fourth = attempts[3],
        impossible = fourth.lookups.find(
            (entry) => entry.key === "KinkyDungeonStruggleStruggleImpossibleSpiderlingsWebbing",
        );
    expect(impossible && !impossible.value.includes("[NotFound]"), "Native impossibility message is missing");
    expect(
        fourth.message === impossible.value.replace("TargetRestraint", TextGet("Restraint" + blocked.name)),
        "Native impossibility message lost its equipped item name",
    );
    expect(KinkyDungeonGetRestraintItem("ItemLegs") === blocked, "Message repair changed equipment identity");
    expect(!(blocked.cutProgress > 0) && !(blocked.struggleProgress > 0), "Impossible attempts gained progress");
    rows.push({ mode: "impossible-message", attempts });
    delete KDEventMapGeneric.tickAfter.SpiderlingsNativeEscapeAcceptance;
    return { rows, profiles: Spiderlings.WebbingData.ESCAPE_PROFILES };
})();
