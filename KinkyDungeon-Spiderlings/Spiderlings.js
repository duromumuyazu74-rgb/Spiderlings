"use strict";

// Data registration layer / 数据注册层。
// Core utilities live in SpiderlingsCore.js; this file stays mostly declarative.
// 核心工具位于 SpiderlingsCore.js；本文件尽量只保留数据声明。
const SPIDERLINGS = globalThis.Spiderlings;

// KD's NPC target selection and melee resolution use KDHostile on entity pairs.
// Keep this ecology rule on exact Mod entities: inherited Enemy factions from
// nest summons must work without changing Maidforce's global Enemy relation.
(() => {
    if (typeof KDHostile != "function" || KDHostile.spiderlingsMaidHostility) return;
    const nativeHostile = KDHostile;
    const targets = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler", "NestEntrance", "MageSpiderlings"]);
    const provokedFlag = "SpiderlingsPlayerProvoked";
    const provokedTurns = 10;
    let rivalSelection = null;
    function isHostileSpiderlingTarget(entity) {
        return (
            entity &&
            targets.has(entity.Enemy?.name) &&
            KDGetFaction(entity) === "Enemy" &&
            !entity.allied &&
            !entity.Enemy.allied &&
            !(entity.ceasefire > 0) &&
            !(typeof KDIsInParty == "function" && KDIsInParty(entity)) &&
            !(typeof KDIsServant == "function" && KDIsServant(KDGameData.Collection?.[entity.id + ""]))
        );
    }
    function isMaidRival(entity) {
        return (
            entity?.Enemy &&
            KDGetFaction(entity) === "Maidforce" &&
            !entity.allied &&
            !entity.Enemy.allied &&
            !(entity.ceasefire > 0) &&
            !(typeof KDIsInParty == "function" && KDIsInParty(entity)) &&
            !(typeof KDIsServant == "function" && KDIsServant(KDGameData.Collection?.[entity.id + ""]))
        );
    }
    function isRivalPair(enemy, other) {
        return (
            other?.hp > 0 &&
            ((isMaidRival(enemy) && isHostileSpiderlingTarget(other)) ||
                (isHostileSpiderlingTarget(enemy) && isMaidRival(other)))
        );
    }
    KDHostile = function (enemy, other) {
        const original = nativeHostile.apply(this, arguments);
        // Only during the rival-search pass: remove the player's distance ceiling
        // and let the native selector consider this pair, with its normal perception.
        if (rivalSelection === enemy && !isRivalPair(enemy, other)) return false;
        if (original || !other || enemy === other) return original;
        if (enemy.ceasefire > 0 || other.ceasefire > 0) return original;
        return (
            (KDGetFaction(enemy) === "Maidforce" && isHostileSpiderlingTarget(other)) ||
            (KDGetFaction(other) === "Maidforce" && isHostileSpiderlingTarget(enemy)) ||
            original
        );
    };
    KDHostile.spiderlingsMaidHostility = true;
    if (typeof KinkyDungeonNearestPlayer == "function") {
        const nativeNearest = KinkyDungeonNearestPlayer;
        KinkyDungeonNearestPlayer = function (enemy, requireVision, decoy, visionRadius, aiData) {
            if (!decoy || !(enemy?.hp > 0) || !(isMaidRival(enemy) || isHostileSpiderlingTarget(enemy)))
                return nativeNearest.apply(this, arguments);
            let radius = visionRadius || KDEnemyVisionRadius(enemy);
            if (!visionRadius && enemy.blind && !enemy.aware) radius = 1.5;
            const player = KinkyDungeonPlayerEntity;
            const reinforcing = enemy.Enemy.name === "WebCaster" && SPIDERLINGS.Webbing?.needsCocoonReinforcement();
            if (
                (KDEnemyHasFlag(enemy, provokedFlag) || reinforcing) &&
                KDHostile(enemy) &&
                KinkyDungeonCheckLOS(
                    enemy,
                    player,
                    Math.hypot(player.x - enemy.x, player.y - enemy.y),
                    radius,
                    true,
                    true,
                )
            )
                return player;
            // Native NPC acquisition rejects two unaware offscreen actors. Let a
            // spider's own perception wake it, including immobile nests and old saves.
            if (
                !enemy.aware &&
                isHostileSpiderlingTarget(enemy) &&
                !KDHelpless(enemy) &&
                !KDIsImprisoned(enemy) &&
                KDNearbyEnemies(enemy.x, enemy.y, radius).some(
                    (other) =>
                        isRivalPair(enemy, other) &&
                        !other.Enemy.noAttack &&
                        !KDHelpless(other) &&
                        !KDIsImprisoned(other) &&
                        KinkyDungeonCheckLOS(
                            enemy,
                            other,
                            Math.hypot(other.x - enemy.x, other.y - enemy.y),
                            radius,
                            true,
                            true,
                        ),
                )
            )
                enemy.aware = true;
            const previous = rivalSelection;
            rivalSelection = enemy;
            let rival;
            try {
                rival = nativeNearest.call(this, enemy, requireVision, decoy, visionRadius, aiData);
            } finally {
                rivalSelection = previous;
            }
            return rival && !rival.player ? rival : nativeNearest.apply(this, arguments);
        };
    }
    function provoke(enemy) {
        if (enemy?.hp > 0 && (isMaidRival(enemy) || isHostileSpiderlingTarget(enemy)))
            KinkyDungeonSetEnemyFlag(enemy, provokedFlag, provokedTurns);
    }
    // Give roaming rivals a reachable search destination, not extra vision or an
    // unseen combat target. Native movement and target acquisition still execute.
    function seekRival(enemy, player, aiData) {
        if (
            !(isMaidRival(enemy) || (isHostileSpiderlingTarget(enemy) && !enemy.Enemy.immobile)) ||
            !(enemy.hp > 0) ||
            !player?.player ||
            aiData.moveTowardPlayer ||
            (enemy.aware && aiData.aggressive && !aiData.ignore) ||
            KDEnemyHasFlag(enemy, provokedFlag) ||
            enemy.IntentAction ||
            enemy.CurrentAction ||
            enemy.action ||
            enemy.goToDespawn ||
            enemy.leash ||
            enemy.Enemy.master ||
            enemy === KinkyDungeonJailGuard() ||
            enemy === KinkyDungeonLeashingEnemy() ||
            KDHelpless(enemy) ||
            KDIsImprisoned(enemy)
        )
            return false;
        const candidates = KDNearbyEnemies(enemy.x, enemy.y, 12).filter(
            (target) =>
                isRivalPair(enemy, target) &&
                KDHostile(enemy, target) &&
                !target.Enemy.noAttack &&
                !KDHelpless(target) &&
                !KDIsImprisoned(target),
        );
        candidates.sort((a, b) => Math.hypot(a.x - enemy.x, a.y - enemy.y) - Math.hypot(b.x - enemy.x, b.y - enemy.y));
        for (const target of candidates) {
            const route = KinkyDungeonFindPath(
                enemy.x,
                enemy.y,
                target.x,
                target.y,
                false,
                false,
                aiData.ignoreLocks,
                aiData.MovableTiles,
                undefined,
                undefined,
                undefined,
                enemy,
                true,
            );
            if (!route?.length || route.length > 24) continue;
            enemy.gx = target.x;
            enemy.gy = target.y;
            enemy.path = route;
            // KD otherwise refuses NPC acquisition when both unaware actors are off
            // the player's screen. Alert the searching actor only on actual perception.
            const radius = enemy.blind && !enemy.aware ? 1.5 : KDEnemyVisionRadius(enemy);
            if (
                KinkyDungeonCheckLOS(
                    enemy,
                    target,
                    Math.hypot(target.x - enemy.x, target.y - enemy.y),
                    radius,
                    true,
                    true,
                )
            )
                enemy.aware = true;
            return true;
        }
        return false;
    }
    if (typeof KDAIType != "undefined") {
        for (const name of ["hunt", "wander"]) {
            const ai = KDAIType[name];
            const nativeAfterMove = ai.aftermove;
            ai.aftermove = function (enemy, player, aiData) {
                return nativeAfterMove.apply(this, arguments) || seekRival(enemy, player, aiData);
            };
        }
    }
    KDAddEvent(KDEventMapGeneric, "playerAttack", "SpiderlingsRivalry", (_event, data) => {
        // A committed melee attempt provokes even when it misses.
        if (data.attacker?.player && data.damage?.type !== "heal" && data.damage?.type !== "inert") provoke(data.enemy);
    });
    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", "SpiderlingsRivalry", (_event, data) => {
        // Native aggro excludes healing, inert effects and ally spells. Allied NPC
        // attacks must not be attributed to the player merely by their faction.
        if (data.aggro && data.faction === "Player" && !data.attacker?.Enemy) provoke(data.enemy);
    });
    // Maidforce and generic Enemy are favorable (+0.1) in KD 5.5. NPC bullets
    // use this second gate, so target acquisition alone would not deal damage.
    if (typeof KDFactionFavorable == "function") {
        const nativeFavorable = KDFactionFavorable;
        KDFactionFavorable = function (faction, other) {
            if (faction === "Maidforce" && isHostileSpiderlingTarget(other)) return false;
            return nativeFavorable.apply(this, arguments);
        };
    }
})();

//Enemies------------------------------------------------------------------------------------------------------------------
// 怪物属性速查：
// maxhp: 生命值；weight: 自然生成权重；minLevel: 最低层级。
// movePoints/attackPoints: 移动/攻击行动点，数值越高通常行动越慢。
// attack: 攻击 AI 类型；spells: 可使用的敌方法术；terrainTags: 在不同地形/阶段的生成权重。
// tags: 怪物标签，也会影响 AI、抗性、可施加拘束类型和地图生成。

SPIDERLINGS.addEnemies([
    //Spinner - Standard spiderling. Weak alone but can overwhelm with numbers
    // 织网幼蛛：基础近战单位，命中后施加蛛丝并持续参与战斗。
    {
        name: "Spinner",
        clusterWith: "spiderlings",
        color: "#FF00FF",
        tags: KDMapInit([
            "Spinner",
            "ignoretiedup",
            "doortrap",
            "spiderlings",
            "minor",
            "melee",
            "fireweakness",
            "glueresist",
            "acidweakness",
            "opendoors",
        ]),
        squeeze: true,
        ignorechance: 0.75,
        followRange: 1,
        AI: "hunt",
        sneakThreshold: 1,
        disarm: 0.25,
        visionRadius: 5,
        maxhp: 2,
        minLevel: 0,
        weight: 10,
        movePoints: 1.5,
        attackPoints: 2,
        attack: "MeleeEffect",
        suicideOnEffect: false,
        effect: { damage: "tickle", effect: { name: "SpiderlingsWebbingEnemyBind", profile: "Spinner" } },
        attackWidth: 1,
        attackRange: 1,
        power: 1,
        dmgType: "tickle",
        fullBoundBonus: 0,
        terrainTags: { secondhalf: 5, lastthird: 5, doortrap: 10, trap: 30, spiderlings: 50 },
        allFloors: true,
        shrines: ["Latex"],
    },

    //Jumper - Faster version of Spinner
    // 跃击幼蛛：普通攻击仍是近战；独立 Dash 锁定玩家格，并在两次完整玩家行动后结算。
    {
        name: "Jumper",
        clusterWith: "spiderlings",
        color: "#FF00FF",
        tags: KDMapInit([
            "Jumper",
            "ignoretiedup",
            "doortrap",
            "spiderlings",
            "minor",
            "melee",
            "fireweakness",
            "glueresist",
            "acidweakness",
            "opendoors",
        ]),
        squeeze: true,
        ignorechance: 0.75,
        followRange: 1,
        AI: "hunt",
        sneakThreshold: 1,
        disarm: 0.25,
        spells: ["SpiderlingsJumperDash"],
        spellCooldownMult: 1,
        spellCooldownMod: 0,
        castWhileMoving: true,
        stopToCast: true,
        noSpellsWhenHarmless: true,
        projectileTargeting: true,
        visionRadius: 9,
        maxhp: 1,
        minLevel: 0,
        weight: 10,
        movePoints: 1.25,
        attackPoints: 2,
        attack: "SpellMeleeEffectSuicide",
        suicideOnEffect: true,
        effect: { damage: "tickle", effect: { name: "SpiderlingsWebbingEnemyBind", profile: "Jumper" } },
        attackWidth: 1,
        attackRange: 2,
        power: 1,
        dmgType: "tickle",
        fullBoundBonus: 0,
        terrainTags: { secondhalf: 5, lastthird: 5, doortrap: 10, trap: 30, spiderlings: 50 },
        allFloors: true,
        shrines: ["Latex"],
    },

    //WebCaster - Ranged spiderling that can cast area denial effects
    // 喷网幼蛛：远程单位，使用 WebSpray 在地上制造蛛网区域。
    {
        name: "WebCaster",
        clusterWith: "spiderlings",
        tags: KDMapInit(["WebCaster", "spiderlings", "opendoors", "ranged", "unflinching", "hunter", "glueresist"]),
        evasion: 0,
        disarm: 0.25,
        followLeashedOnly: true,
        kite: 3,
        kiteChance: 1,
        followRange: 3,
        castWhileMoving: true,
        spells: ["WebSpray"],
        miscastmsg: "KDBanditMiscast",
        miscastsfx: "Miss",
        stopToCast: false,
        spellRdy: false,
        noKiteWhenHarmless: true,
        noSpellsWhenHarmless: true,
        dontKiteWhenDisabled: true,
        spellCooldownMult: 2,
        spellCooldownMod: 0,
        AI: "hunt",
        visionRadius: 8,
        maxhp: 1,
        minLevel: 0,
        weight: 7,
        movePoints: 1.5,
        attackPoints: 3,
        projectileTargeting: true,
        attack: "Spell",
        focusPlayer: true,
        // dropTable: [{name: "Gold", amountMin: 10, amountMax: 15, weight: 10}, {name: "RedKey", weight: 2}, {name: "PotionStamina", weight: 3}],
        terrainTags: { secondhalf: 3, lastthird: 2, spiderlings: 50 },
        allFloors: true,
        shrines: ["Latex"],
    },

    // Mage's natural weight is adjusted by the encounter selector for security and infestation.
    {
        name: "MageSpiderlings",
        clusterWith: "spiderlings",
        color: "#8b64cf",
        tags: KDMapInit(["MageSpiderlings", "spiderlings", "opendoors", "ranged", "hunter", "glueresist"]),
        AI: "hunt",
        visionRadius: 8,
        maxhp: 3,
        minLevel: 0,
        weight: 2,
        movePoints: 1.5,
        attackPoints: 3,
        attack: "Spell",
        spells: ["SpiderlingsMageBolt", "SpiderlingsMageRune"],
        spellCooldownMult: 1,
        spellCooldownMod: 0,
        castWhileMoving: true,
        stopToCast: false,
        noSpellsWhenHarmless: true,
        projectileTargeting: true,
        followRange: 3,
        kite: 3,
        kiteChance: 1,
        terrainTags: {},
        allFloors: true,
        shrines: ["Latex"],
    },

    //Tunneler - Creates new Nest Entrances
    // 掘穴幼蛛：通过 SummonNestEntrance 创建新的巢穴入口。
    {
        name: "Tunneler",
        clusterWith: "spiderlings",
        color: "#FF00FF",
        tags: KDMapInit([
            "Tunneler",
            "ignoretiedup",
            "doortrap",
            "spiderlings",
            "minor",
            "melee",
            "fireweakness",
            "glueresist",
            "acidweakness",
            "opendoors",
        ]),
        squeeze: true,
        ignorechance: 0.75,
        noSpellsWhenHarmless: true,
        followRange: 1,
        AI: "wander",
        sneakThreshold: 1,
        visionRadius: 5,
        maxhp: 1,
        minLevel: 0,
        weight: 2,
        movePoints: 1.5,
        attackPoints: 2,
        suicideOnSpell: true,
        fullBoundBonus: 1,
        attack: "Spell",
        attackWidth: 1,
        attackRange: 0,
        power: 1,
        spells: ["SummonNestEntrance"],
        spellCooldownMult: 2,
        spellCooldownMod: 8,
        castWhileMoving: false,
        terrainTags: { secondhalf: 2, lastthird: 2, doortrap: 3, trap: 5, spiderlings: 10 },
        allFloors: true,
        shrines: ["Latex"],
    },

    //Nest Entrance - Summons spiderlings
    // 巢穴入口：固定不动的召唤点，会持续召唤各种幼蛛，死亡时额外爆出幼蛛。
    {
        name: "NestEntrance",
        clusterWith: "spiderlings",
        color: "#FF00FF",
        tags: KDMapInit([
            "NestEntrance",
            "spiderlings",
            "immobile",
            "spawner",
            "melee",
            "meleeresist",
            "fireweakness",
            "glueresist",
            "acidweakness",
        ]),
        immobile: true,
        squeeze: true,
        followRange: 1,
        AI: "hunt",
        sneakThreshold: 1,
        enemyCountSpellLimit: 24,
        spells: SPIDERLINGS.buildNestEntranceSpells(),
        spellCooldownMult: 1.5,
        spellCooldownMod: 4,
        castWhileMoving: true,
        visionRadius: 30,
        blindSight: 30,
        maxhp: 12,
        minLevel: 0,
        weight: 10,
        movePoints: 1000,
        attackPoints: 0,
        attack: "Spell",
        attackRange: 0,
        attackWidth: 1,
        power: 1,
        dmgType: "tickle",
        fullBoundBonus: 5,
        terrainTags: { passage: 25, spiderlings: 20, maid: 5, trap: 5 },
        allFloors: true,
        shrines: ["Latex"],
        ondeath: [
            { type: "summon", enemy: "Spinner", range: 2.5, count: 2, strict: true },
            { type: "summon", enemy: "Jumper", range: 2.5, count: 1, strict: true },
            { type: "summon", enemy: "WebCaster", range: 2.5, count: 1, strict: true },
        ],
        factionrep: { Maidforce: 0.005 },
    },
]);

//Enemy Text------------------------------------------------------------------------------------------------------------------

//Spinner
addTextKey("NameSpinner", "Spiderling Spinner");
addTextKey(
    "AttackSpinner",
    "The Spiderling Spinner takes tiny steps across your body, its fine legs brushing you with a faint tickle.",
);
addTextKey(
    "AttackSpinnerBind",
    "The Spiderling Spinner winds a loop of silk around your legs, then stays nearby to keep weaving. (+RestraintAdded)",
);
addTextKey("KillSpinner", "The Spiderling Spinner folds its fine legs, easing back and out of sight.");

//Jumper
addTextKey("NameJumper", "Spiderling Jumper");
addTextKey(
    "AttackJumper",
    "The Spiderling Jumper springs lightly toward you, its fine legs brushing your body with a faint tickle.",
);
addTextKey(
    "AttackJumperBind",
    "The Spiderling Jumper lands on you, drawing its silk into a binding with the motion before hopping away. (+RestraintAdded)",
);
addTextKey("KillJumper", "The Spiderling Jumper draws in its fine legs, stepping back and soon out of sight.");

//Tunneler
addTextKey("NameTunneler", "Spiderling Tunneler");
addTextKey(
    "KillTunneler",
    "The Spiderling Tunneler slips away along the ground, leaving a few fine threads to settle behind it.",
);

//NestEntrance - Need to fix summon text
addTextKey("NameNestEntrance", "Nest Entrance");
addTextKey(
    "KillNestEntrance",
    "The nest entrance collapses, its silken fringe settling as the spiderlings within crawl out.",
);

//WebCaster
addTextKey("NameWebCaster", "Spiderling Web Caster");
addTextKey(
    "KillWebCaster",
    "The Spiderling Web Caster draws its fine legs close and eases away, leaving a slender thread behind.",
);

addTextKey("NameMageSpiderlings", "Spiderling Mage");
addTextKey("KillMageSpiderlings", "The Spiderling Mage draws back its legs and retreats into the shadows.");

//Enemy Spells--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

// Glossary of spell effects
// 敌方法术属性速查：
// manacost: Number of turns of no stamina regen after casting the spell. Stacks
// Components: Components required to cast the spell. All of them need to be met
// Level: Determines mana cost and availability. On enemies, increases cooldown
// Power: Determines damage
// Type: "bolt" is a projectile. "inert" is a static delayed blast. "self" is a spell that casts on the player.
// Delay: If the spell's type is "inert", this determines how long before it explodes
// Range: Max targeting range
// damage: damage TYPE. Various damage types have different effects, see KinkyDungeonDealDamage
// speed: speed of a "bolt" projectile
// playerEffect: What happens when the effect hits a player
// trail, trailchance, traildamage, traillifetime: for lingering projectiles left behind the projectile
// onhit: What happens on AoE. Deals aoepower damage, or just power otherwise
// channel: Possibly used for specifying casting time?
// name: 法术 ID；type: bolt=飞弹，inert=延迟/静态效果；onhit: 命中后触发的效果。
// summon: 召唤怪物列表；playerEffect: 命中玩家后施加的效果；trailcast: 飞弹轨迹生成的附加法术。

SPIDERLINGS.addSpells([
    {
        enemySpell: true,
        name: "SpiderlingsMageRune",
        tags: ["rune", "trap", "slime"],
        bulletColor: 0xa77bdc,
        color: "#a77bdc",
        school: "Latex",
        manacost: 4,
        components: ["Arms"],
        level: 1,
        type: "dot",
        castRange: 6,
        minRange: 0,
        range: 3,
        size: 1,
        delay: 300,
        onhit: "",
        power: 0,
        bind: 6,
        bindType: "Slime",
        damage: "glue",
        noTerrainHit: true,
    },
    {
        enemySpell: true,
        name: "SpiderlingsMageBolt",
        noSprite: true,
        color: "#a77bdc",
        sfx: "Miss",
        school: "Latex",
        manacost: 4,
        components: ["Arms"],
        level: 1,
        type: "bolt",
        projectileTargeting: true,
        castRange: 6,
        minRange: 0,
        onhit: "",
        power: 0.5,
        range: 8,
        speed: 4,
        size: 1,
        damage: "glue",
        playerEffect: { name: "Damage", power: 0.5 },
    },
    //Jumper Dash - inert transport into a source-owned, two-player-action Dash lifecycle.
    // Jumper 跃击：原生法术只触发独立生命周期；两次完整玩家行动后落地结算，推进蛛丝才消耗 Jumper。
    {
        enemySpell: true,
        name: "SpiderlingsJumperDash",
        noSprite: true,
        noCastMsg: true,
        color: "#ff66ff",
        minRange: 2,
        sfx: "Miss",
        landsfx: "Miss",
        school: "Latex",
        specialCD: 5,
        manacost: 0,
        components: ["Legs"],
        level: 1,
        type: "inert",
        projectileTargeting: true,
        castRange: 4,
        castCondition: "SpiderlingsJumperDash",
        onhit: "",
        time: 1,
        power: 0,
        delay: 1,
        range: 4,
        size: 1,
        aoe: 0,
        lifetime: 1,
        damage: "inert",
        playerEffect: {},
    },

    //Summon Spinner
    // 召唤 Spinner。
    {
        enemySpell: true,
        name: "SummonSpinner",
        noSprite: true,
        minRange: 0,
        sfx: "Bones",
        manacost: 8,
        components: ["Verbal"],
        level: 4,
        projectileTargeting: true,
        castRange: 50,
        type: "bolt",
        onhit: "summon",
        summon: [{ name: "Spinner", count: 1, strict: true }],
        time: 12,
        power: 0,
        delay: 1,
        range: 0.5,
        size: 1,
        aoe: 1.5,
        lifetime: 1,
        speed: 1,
        playerEffect: {},
    },

    //Summon Jumper
    // 召唤 Jumper。
    {
        enemySpell: true,
        name: "SummonJumper",
        noSprite: true,
        minRange: 0,
        sfx: "Bones",
        manacost: 8,
        components: ["Verbal"],
        level: 4,
        projectileTargeting: true,
        castRange: 50,
        type: "bolt",
        onhit: "summon",
        summon: [{ name: "Jumper", count: 1, strict: true }],
        time: 12,
        power: 0,
        delay: 1,
        range: 0.5,
        size: 1,
        aoe: 1.5,
        lifetime: 1,
        speed: 1,
        playerEffect: {},
    },

    //Summon WebCaster
    // 召唤 WebCaster。
    {
        enemySpell: true,
        name: "SummonWebCaster",
        noSprite: true,
        minRange: 0,
        sfx: "Bones",
        manacost: 8,
        components: ["Verbal"],
        level: 4,
        projectileTargeting: true,
        castRange: 50,
        type: "bolt",
        onhit: "summon",
        summon: [{ name: "WebCaster", count: 1, strict: true }],
        time: 12,
        power: 0,
        delay: 1,
        range: 0.5,
        size: 1,
        aoe: 1.5,
        lifetime: 1,
        speed: 1,
        playerEffect: {},
    },

    //Summon Tunneler
    //Increased manacost to reduce spawning
    // 召唤 Tunneler；manacost 较高，用来控制铺场速度。
    {
        enemySpell: true,
        name: "SummonTunneler",
        noSprite: true,
        minRange: 0,
        sfx: "Bones",
        manacost: 16,
        components: ["Verbal"],
        level: 4,
        projectileTargeting: true,
        castRange: 50,
        type: "bolt",
        onhit: "summon",
        summon: [{ name: "Tunneler", count: 1, strict: true }],
        time: 12,
        power: 0,
        delay: 1,
        range: 0.5,
        size: 1,
        aoe: 1.5,
        lifetime: 1,
        speed: 1,
        playerEffect: {},
    },

    //Summon new Nest Entrance - This will need serous tuning to prevent runaway spawning
    // 召唤新的巢穴入口；如果觉得怪物滚雪球太快，优先调 manacost、channel 或 NestEntrance 的 enemyCountSpellLimit。
    // selfcast 将法术落点锁定到 Tunneler 自身；aoe 仍决定其脚下附近的可用召唤格。
    {
        enemySpell: true,
        name: "SummonNestEntrance",
        noSprite: true,
        selfcast: true,
        minRange: 0,
        sfx: "Bones",
        manacost: 24,
        components: ["Verbal"],
        level: 4,
        projectileTargeting: true,
        castRange: 50,
        type: "inert",
        onhit: "summon",
        summon: [{ name: "NestEntrance", count: 1, strict: true }],
        time: 12,
        power: 0,
        delay: 1,
        range: 0.5,
        size: 1,
        aoe: 1.5,
        lifetime: 1,
        speed: 1,
        playerEffect: {},
        channel: 3,
    },

    //SpiderWeb - Generic terrain webbing
    // Generic terrain webbing keeps KD's native glue effect and never enters the Spiderlings resolver.
    // 普通地面蛛网仅保留 KD 原生黏着效果，不进入 Spiderlings 选择器。
    {
        enemySpell: true,
        name: "SpiderWeb",
        tags: ["SpiderWeb"],
        color: "#ffffff",
        landsfx: "Miss",
        school: "Latex",
        manacost: 1,
        components: ["Legs"],
        level: 1,
        type: "inert",
        onhit: "lingering",
        time: 12,
        delay: 1,
        range: 0,
        size: 0,
        aoe: 0,
        lifetime: 12,
        power: 1,
        damage: "glue",
        playerEffect: {
            name: "TrapBindings",
            damage: "glue",
            power: 1,
            count: 1,
            time: 1,
            text: "KinkyDungeonSpellSpiderWebBind",
            tags: ["spiderWebbing"],
            noGuard: true,
        },
    },

    //WebSpray - Sprays a string of webbing from the Caster
    //This version uses the Ribbons spell as a basis
    // WebCaster 的喷网飞弹：直击与带来源标记的原生 lingering trail 分别进入共享 Webbing resolver。
    {
        enemySpell: true,
        name: "WebSpray",
        color: "#ffffff",
        sfx: "Miss",
        school: "Latex",
        manacost: 4,
        components: ["Arms"],
        level: 1,
        type: "bolt",
        piercing: false,
        projectileTargeting: true,
        minRange: 0,
        castRange: 6,
        nonVolatile: true,
        onhit: "SpiderWeb",
        power: 3,
        delay: 0,
        range: 10,
        speed: 4,
        size: 1,
        damage: "inert",
        playerEffect: {
            name: "SpiderlingsWebSprayHit",
            provenance: "WebCaster.WebSpray",
            triggerSource: "direct",
            profile: "WebCaster",
            allowInert: true,
        },
        trailPower: 0,
        trailLifetime: 12,
        trailTime: 4,
        trailDamage: "inert",
        trail: "lingering",
        trailChance: 0.9,
        noTrailOnPlayer: true,
        trailPlayerEffect: {
            name: "SpiderlingsWebSprayHit",
            provenance: "WebCaster.WebSpray",
            triggerSource: "trail",
            profile: "WebCaster",
            allowInert: true,
        },
    },
]);

//Enemy Spell Text--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
addTextKey("KinkyDungeonSpellSpiderlingsMageBolt", "Mage Silk Bolt");
addTextKey("KinkyDungeonSpellSpiderlingsMageRune", "Silken Rune");
addTextKey("KinkyDungeonSpellCastSpiderlingsMageRune", "The Spiderling Mage marks a nearby tile with a glowing rune.");
addTextKey(
    "KinkyDungeonSpellCastSpiderlingsMageBolt",
    "The Spiderling Mage gathers a bright knot of silk and casts it toward you.",
);
addTextKey("KinkyDungeonSpellSummonSpinner", "Summon Spinner");
addTextKey(
    "KinkyDungeonSummonSummonSpinner",
    "A Spiderling Spinner follows a strand of silk into view, its fine legs touching lightly down.",
);
addTextKey(
    "KinkyDungeonSpellCastSummonSpinner",
    "A soft patter stirs the slender threads; a Spiderling Spinner is about to emerge.",
);

addTextKey("KinkyDungeonSpellSummonJumper", "Summon Jumper");
addTextKey(
    "KinkyDungeonSummonSummonJumper",
    "A Spiderling Jumper hops into view, its fine legs unfolding as it lands.",
);
addTextKey(
    "KinkyDungeonSpellCastSummonJumper",
    "A delicate rustling draws closer; a Spiderling Jumper is about to emerge.",
);

addTextKey("KinkyDungeonSpellSummonWebCaster", "Summon Web Caster");
addTextKey(
    "KinkyDungeonSummonSummonWebCaster",
    "A Spiderling Web Caster crawls into view, laying a trailing thread along the ground.",
);
addTextKey(
    "KinkyDungeonSpellCastSummonWebCaster",
    "A strand of silk slowly draws into view; a Spiderling Web Caster is about to emerge.",
);

addTextKey("KinkyDungeonSpellSummonTunneler", "Summon Tunneler");
addTextKey(
    "KinkyDungeonSummonSummonTunneler",
    "A Spiderling Tunneler emerges, taking tiny steps along the ground on its fine legs.",
);
addTextKey(
    "KinkyDungeonSpellCastSummonTunneler",
    "A soft digging sound comes from the ground; a Spiderling Tunneler is about to emerge.",
);

addTextKey("KinkyDungeonSpellSummonNestEntrance", "Dig a Spiderling Nest");
addTextKey(
    "KinkyDungeonSummonSummonNestEntrance",
    "An opening appears in the ground, fine silk lining its edges as a new nest entrance takes shape.",
);
addTextKey(
    "KinkyDungeonSpellCastSummonNestEntrance",
    "The Spiderling Tunneler settles close to the ground to dig, laying silk along the cracks strand by strand.",
);

addTextKey("KinkyDungeonSpellSpiderlingsJumperDash", "Jumper Dash");
addTextKey(
    "KinkyDungeonSpellCastSpiderlingsJumperDash",
    "The Spiderling Jumper watches the ground beneath you, lowering its body and folding its fine legs in preparation to leap.",
);

addTextKey("KinkyDungeonSpellWebSpray", "Web Spray");
addTextKey(
    "KinkyDungeonSpellCastWebSpray",
    "The Spiderling Web Caster sprays a bundle of silk toward you, its fine threads unfurling in the air.",
);
addTextKey(
    "KinkyDungeonSpellWebSprayDamage",
    "The spray lands on you, its soft, clinging threads winding around you. (DamageDealt)",
);
addTextKey(
    "KinkyDungeonSpellWebSprayBind",
    "The sprayed silk settles against your body, its strands joining into a close-fitting web.",
);

addTextKey("KinkyDungeonSpellSpiderWeb", "Ground Webbing");
addTextKey(
    "KinkyDungeonSpellCastSpiderWeb",
    "Pliant threads settle onto the ground, spreading into an open mesh all around.",
);
addTextKey(
    "KinkyDungeonSpellSpiderWebDamage",
    "You step into the web, drawing up clinging threads that wind around your feet. (DamageDealt)",
);
addTextKey(
    "KinkyDungeonSpellSpiderWebBind",
    "You step into the web, and soft, clinging threads curl around your feet in little loops.",
);

KinkyDungeonRefreshRestraintsCache();
KinkyDungeonRefreshEnemiesCache();

addTextKey(
    "KinkyDungeonSpellCastSpiderlingsJumperDashNPC",
    "The Spiderling Jumper watches the ground beneath its opponent and lowers its body, preparing to leap.",
);
