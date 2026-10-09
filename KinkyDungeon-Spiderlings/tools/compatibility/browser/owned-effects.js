(() => {
    const expect = (condition, message) => {
        if (!condition) throw Error(message);
    };
    KinkyDungeonStartNewGame(false);
    KDMapData.Entities = [];
    KDMapData.Bullets = [];
    KDUpdateEnemyCache = true;
    for (let y = 3; y < 16; y++)
        for (let x = 3; x < 19; x++) {
            KinkyDungeonMapSet(x, y, "0");
            KinkyDungeonTilesDelete(`${x},${y}`);
        }
    KDMovePlayer(10, 10, false);
    const webCaster = DialogueCreateEnemy(8, 8, "WebCaster");
    const rune = KinkyDungeonSpellListEnemies.find((spell) => spell.name === "SpiderlingsMageRune");
    const rejected = [
        KinkyDungeonCastSpell(10, 10, rune, webCaster).result,
        KinkyDungeonCastSpell(10, 10, rune, undefined, KinkyDungeonPlayerEntity).result,
    ];
    expect(
        rejected.every((result) => result === "Fail"),
        "Non-Mage or player cast created a Mage rune",
    );
    expect(KDMapData.Bullets.length === 0, "Rejected rune cast left a bullet");
    expect(JSON.stringify(webCaster.Enemy.spells) === '["WebSpray"]', "WebCaster spell list changed");
    const spray = KinkyDungeonSpellListEnemies.find((spell) => spell.name === "WebSpray");
    expect(KinkyDungeonCastSpell(10, 10, spray, webCaster).result === "Cast", "WebCaster spray was blocked");
    const mage = DialogueCreateEnemy(7, 8, "MageSpiderlings");
    expect(KinkyDungeonCastSpell(10, 10, rune, mage).result === "Cast", "Mage rune was blocked");
    expect(
        KDMapData.Bullets.some((bullet) => bullet.SpiderlingsRunePhase === "placing"),
        "Mage rune skipped placement",
    );

    // Reproduce a collared player's generic selection pool without relying on a random draw.
    const oldTags = KinkyDungeonPlayerTags;
    let eligible;
    let added;
    try {
        KinkyDungeonPlayerTags = new Map(oldTags);
        KinkyDungeonPlayerTags.set("Collars", true);
        KinkyDungeonPlayerTags.set("ItemNeckFull", true);
        KinkyDungeonPlayerTags.delete("ItemNeckRestraintsFull");
        const index = KinkyDungeonMapIndex[MiniGameKinkyDungeonCheckpoint] || MiniGameKinkyDungeonCheckpoint;
        eligible = KDGetRestraintsEligible({ tags: ["leashing"] }, 10, index).map((entry) => entry.restraint.name);
        expect(eligible.includes("BasicLeash"), "Generic leashing fixture has no native leash");
        expect(!eligible.includes("SpiderlingsSilkLeash"), "Generic leashing can select Spinner's carrier");
        const leash = KinkyDungeonGetRestraintByName("SpiderlingsSilkLeash");
        added = KinkyDungeonAddRestraint(leash, 0, false, "");
        expect(added > 0, "Exact-ID carrier equip failed");
        expect(
            KinkyDungeonGetRestraintItem("ItemNeckRestraints")?.name === "SpiderlingsSilkLeash",
            "Owned carrier was not equipped",
        );
    } finally {
        KinkyDungeonPlayerTags = oldTags;
    }
    return { rejected, webCasterSpell: "WebSpray", mageRune: "placing", genericLeashes: eligible, exactIdAdded: added };
})();
