"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const gameRoot = require("../reference-inputs.js").gamePath();
const read = (relative) => fs.readFileSync(path.join(gameRoot, relative), "utf8");

test("native swap admission allows an owned web structure after its spider-only path condition", () => {
    const { runtime } = require("./helpers/spinner-native-runtime.js"),
        { stripTypeScriptTypes } = require("node:module"),
        vm = require("node:vm"),
        { context: c } = runtime(),
        source = read("Game/src/enemy/KinkyDungeonEnemies.ts"),
        start = source.indexOf("function KinkyDungeonCanSwapWith("),
        end = source.indexOf("function KinkyDungeonNoEnemyExceptSub(", start);
    assert.ok(start >= 0 && end > start);
    Object.assign(c, {
        KDIsImmobile: (entity) => !!entity.Enemy.immobile,
        KDEnemyHasFlag: () => false,
        KinkyDungeonLeashingEnemy: () => undefined,
        KinkyDungeonJailGuard: () => undefined,
        KDIsPlayerTetheredToLocation: () => false,
    });
    vm.runInContext(stripTypeScriptTypes(source.slice(start, end)), c);
    c.Spiderlings.SpinnerNativeField.initializeMap({
        fieldId: "native-admission",
        owners: [1],
        anchors: [
            { id: "a", x: 3, y: 3 },
            { id: "b", x: 5, y: 3 },
        ],
    });
    const web = {
            hp: 2,
            x: 3,
            y: 3,
            Enemy: c.KinkyDungeonEnemies.find((enemy) => enemy.name === "SpiderlingsSpinnerWebCell"),
            SpiderlingsSpinnerProxy: { fieldId: "native-admission", cell: "3,3" },
        },
        spider = { id: 1, hp: 3, x: 2, y: 3, idle: true, Enemy: { tags: { spiderlings: true } } },
        maid = { ...spider, id: 2, Enemy: { tags: {} } };
    assert.equal(c.KinkyDungeonCanSwapWith(web, spider), true);
    assert.equal(c.KinkyDungeonCanSwapWith(web, maid), false);
});

test("pinned KD 5.5.0 preserves the native Spinner traversal projection contract", () => {
    const version = read("Screens/MiniGame/KinkyDungeon/Text_KinkyDungeon.csv"),
        enemies = read("Game/src/enemy/KinkyDungeonEnemies.ts"),
        pathfinding = read("Game/src/enemy/KinkyDungeonPathfinding.ts"),
        tiles = read("Game/src/map/KinkyDungeonTiles.ts");
    assert.match(version, /KDVersionStr,"5\.5\.0"/);
    assert.match(pathfinding, /!KinkyDungeonEnemyAt\(xx, yy\)\?\.Enemy\?\.immobile/);
    assert.match(pathfinding, /KinkyDungeonNoEnemyExceptSub\(xx, yy, false, Enemy\)/);
    assert.match(enemies, /KDPathConditions\[e\.Enemy\.pathcondition\]\.query\(Enemy, e\)/);
    assert.match(enemies, /move = KDPathConditions\[ee\.Enemy\.pathcondition\]\.doPassthrough\(enemy, ee, KDMapData\)/);
    assert.match(enemies, /if \(move == 1\) \{[\s\S]*?KDMoveEntity\(ee, enemy\.x, enemy\.y/);
    assert.match(enemies, /else if \(move == 0\) \{\s*return false;/);
    assert.match(enemies, /if \(!ee \|\| !KinkyDungeonEnemyAt\(enemy\.x \+ Direction\.x/);
    assert.match(tiles, /if \(!ignoreBlocked && KinkyDungeonEntityAt\(x, y/);
    assert.match(tiles, /KinkyDungeonSendEvent\("enemyMove"/);
});

test("pinned KD 5.5.0 exposes real bump attacks, final damage, movement budgets, and both caches", () => {
    const game = read("Game/src/base/game/KinkyDungeonGame.ts"),
        fight = read("Game/src/fight/KinkyDungeonFight.ts"),
        enemies = read("Game/src/enemy/KinkyDungeonEnemies.ts"),
        pathfinding = read("Game/src/enemy/KinkyDungeonPathfinding.ts");
    assert.match(game, /KinkyDungeonLaunchAttack\(Enemy\)/);
    assert.match(game, /KinkyDungeonStatStamina/);
    assert.match(game, /KinkyDungeonAdvanceTime\(1/);
    assert.match(fight, /KinkyDungeonSendEvent\("afterDamageEnemy", predata, undefined, predata\.forceWeapon\)/);
    assert.match(fight, /Enemy\.hp -= predata\.dmgDealt/);
    assert.match(enemies, /enemy\.movePoints \+= speedMult \* delta\/10/);
    assert.match(enemies, /enemy\.movePoints \+= speedMult \* delta\/2/);
    assert.match(enemies, /let moveNeeded = enemy\.Enemy\.movePoints \+ moveMult/);
    assert.match(pathfinding, /let KDPathCache: Map<string, KDPoint\[]> = new Map\(\)/);
    assert.match(pathfinding, /let KDPathCacheIgnoreLocks: Map<string, KDPoint\[]> = new Map\(\)/);
    assert.doesNotMatch(
        pathfinding.match(/function KDUpdateDoorNavMap\(\) \{[\s\S]*?\n\}/)?.[0] || "",
        /KDPathCacheIgnoreLocks = new Map/,
    );
});

test("pinned KD 5.5.0 target selection can choose an attackable hostile web proxy", () => {
    const enemies = read("Game/src/enemy/KinkyDungeonEnemies.ts"),
        vision = read("Game/src/base/KinkyDungeonVision.ts");
    assert.match(enemies, /if \(KDGetFaction\(e\) == "Natural"\) continue/);
    assert.match(enemies, /KDHostile\(enemy, e\)/);
    assert.match(enemies, /!e\.Enemy\.lowpriority/);
    assert.match(enemies, /nearestVisible = e/);
    assert.match(vision, /blockOnlyLOSBlock/);
});

test("pinned KD 5.5.0 computes sensing and awareness before hunt beforemove", () => {
    const enemies = read("Game/src/enemy/KinkyDungeonEnemies.ts"),
        sensing = enemies.indexOf("AIData.canSensePlayer ="),
        tracking = enemies.indexOf("KinkyDungeonTrackSneak(enemy, delta"),
        awareness = enemies.indexOf("enemy.aware = true;", tracking),
        beforeMove = enemies.indexOf("AIType.beforemove(enemy, player, AIData)");
    assert.ok(sensing > 0);
    assert.ok(tracking > sensing);
    assert.ok(awareness > tracking);
    assert.ok(beforeMove > awareness);
});

test("pinned KD 5.5.0 exposes the real leash carrier and one-move recovery guards", () => {
    const restraints = read("Game/src/restraint/KinkyDungeonRestraintsList.ts"),
        restraintRuntime = read("Game/src/restraint/KinkyDungeonRestraints.ts"),
        tethers = read("Game/src/restraint/KDTethers.ts"),
        tiles = read("Game/src/map/KinkyDungeonTiles.ts"),
        enemies = read("Game/src/enemy/KinkyDungeonEnemies.ts");
    const basicLeash = restraints.match(/name: "BasicLeash"[\s\S]*?shrine: \["Leashes", "Leashable"\]\}/)?.[0] || "";
    assert.match(basicLeash, /Group: "ItemNeckRestraints"/);
    assert.match(basicLeash, /tether: 2\.9/);
    assert.match(basicLeash, /leash: true, power: 1/);
    assert.match(basicLeash, /requireAllTagsToEquip: \["Collars"\]/);
    assert.match(basicLeash, /struggleMinSpeed: \{\s*Cut: 0\.05/);
    assert.match(basicLeash, /limitChance: \{Struggle: 0\.3\}/);
    assert.match(basicLeash, /escapeChance: \{"Struggle": 0\.0, "Cut": 0\.2, "Remove": 0\.5, "Pick": 1\.25\}/);
    assert.match(restraintRuntime, /Deep\?:\s+boolean/);
    assert.match(restraintRuntime, /noOverpower\?:\s+boolean/);
    assert.match(tethers, /if \(Entity\.player && KinkyDungeonFlags\.get\("pulled"\)\) return false/);
    assert.match(tiles, /KinkyDungeonSetFlag\("forceMoved", 1\)/);
    assert.match(tiles, /KinkyDungeonSendEvent\("playerMove", data\)/);
    assert.match(enemies, /else if \(!\(player\?\.player && KinkyDungeonFlags\.get\("forceMoved"\)\)\)/);
});

test("pinned KD 5.5.0 preserves NPC Slime binding, ordinary struggle, and completion thresholds", () => {
    const enemyPath = path.join(gameRoot, "Game/src/enemy/KinkyDungeonEnemies.ts"),
        enemies = fs.readFileSync(enemyPath, "utf8"),
        fight = read("Game/src/fight/KinkyDungeonFight.ts"),
        npcRestraint = read("Game/src/collection/NPCRestrain.ts"),
        factions = read("Game/src/faction/KinkyDungeonFactions.ts");
    assert.equal(
        crypto.createHash("sha256").update(fs.readFileSync(enemyPath)).digest("hex").toUpperCase(),
        "9281E8A60FBC48FA5177FCB87F2ABBE0178C56E2B581796C4BB5DD26DA9E5242",
    );
    assert.match(factions, /function KDHostile\(enemy: entity, enemy2\?: entity\): boolean/);
    assert.match(fight, /if \(!Enemy\.shield \|\| predata\.ignoreshield \|\| predata\.shield_bind\)/);
    assert.match(fight, /if \(resistDamage == 1\) \{\s*predata\.bindEff \*= 0\.75/);
    assert.match(fight, /KDTieUpEnemy\(Enemy, amt, predata\.bindType/);
    assert.match(enemies, /function KDIsImmobile\(enemy: entity, strict\?: boolean\): boolean/);
    assert.match(enemies, /KDEnemyStruggleTurn\(enemy, delta, KDNPCStruggleThreshMult\(enemy\), false, false\)/);
    assert.match(enemies, /enemy\.boundLevel = newBound\.boundLevel/);
    assert.match(enemies, /enemy\.specialBoundLevel = newBound\.specialBoundLevel/);
    assert.match(
        npcRestraint,
        /return 1 \+ KDEnemyRank\(enemy\) \+ \(enemy\.Enemy\.tags\.unstoppable \? 2 : \(enemy\.Enemy\.tags\.unflinching \? 1 : 0\)\)/,
    );
});

test("pinned KD 5.5.0 preserves forced NPC movement events and one-pull guards", () => {
    const files = [
        ["Game/src/map/KinkyDungeonTiles.ts", "86B90439FE9BE8B23E59F402AEEBD687B308A20BE21C234CD2D951EDA88C2796"],
        ["Game/src/enemy/KinkyDungeonEnemies.ts", "9281E8A60FBC48FA5177FCB87F2ABBE0178C56E2B581796C4BB5DD26DA9E5242"],
        ["Game/src/restraint/KDTethers.ts", "0DA0EF0354E25BA6A9F56EC6DD96BF42DC6FD2796387C88D7EBE0D39CA823DD8"],
    ];
    for (const [relative, expected] of files)
        assert.equal(
            crypto
                .createHash("sha256")
                .update(fs.readFileSync(path.join(gameRoot, relative)))
                .digest("hex")
                .toUpperCase(),
            expected,
            relative,
        );
    const tiles = read(files[0][0]),
        tethers = read(files[2][0]);
    assert.match(tiles, /function KDMoveEntity\(enemy: entity, x: number, y: number, willing: boolean/);
    assert.match(tiles, /KinkyDungeonSendEvent\("enemyMove", \{/);
    assert.match(tiles, /lastX: enemy\.lastx/);
    assert.match(tethers, /else if \(KDEnemyHasFlag\(Entity, "pulled"\)\) return false/);
    assert.match(tethers, /KDMoveEntity\(Entity, slot\.x, slot\.y, false/);
    assert.match(tethers, /KinkyDungeonSetEnemyFlag\(Entity, "pulled", 1\)/);
});
