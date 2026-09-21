"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { modRoot } = require("./helpers/lifecycle-runtime.js");

function findGameRoot() {
    let current = modRoot;
    for (let depth = 0; depth < 6; depth++) {
        const candidate = path.join(current, "KinkiestDungeon-5.5");
        if (fs.existsSync(candidate)) return candidate;
        current = path.dirname(current);
    }
    throw new Error("KinkiestDungeon-5.5 read-only reference is required.");
}
const gameRoot = findGameRoot();
const read = (relative) => fs.readFileSync(path.join(gameRoot, relative), "utf8");

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
