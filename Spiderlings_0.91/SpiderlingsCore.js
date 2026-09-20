"use strict";

// Spiderlings shared namespace / Spiderlings 共享命名空间。
// KD loads mod files as global scripts, so a namespace is safer than many globals.
// KD 会把 mod 文件作为全局脚本加载，因此使用命名空间比散落多个全局变量更安全。
(() => {
    const api = globalThis.Spiderlings = globalThis.Spiderlings || {};

    // KD 5.5.3 summon messages use KDPlayer() when the caster is gone.
    // KDIsSubbier then calls the NPC-only KDCanDom on that player, which has
    // no Enemy definition. Keep player pronouns/messages and all NPC checks.
    if (typeof KDIsSubbier == "function") {
        const nativeIsSubbier = KDIsSubbier;
        KDIsSubbier = function(player, enemy) {
            if (enemy?.player) return false;
            return nativeIsSubbier.apply(this, arguments);
        };
    }

    // Mod configuration constants / Mod 配置常量。
    const MOD_ID = "Spiderlings";
    const MOD_CONFIG = [
        {type: "boolean", name: "spiderlingsPinkWebbing", refvar: "spiderlingsPinkWebbing", default: false, block: undefined},
        {type: "boolean", name: "spiderlingsSquad", refvar: "spiderlingsSquad", default: true, block: undefined},
        {type: "text", refvar: "spiderlingsMapPopulationCap"},
        {type: "string", name: "spiderlingsMapPopulationCap", refvar: "spiderlingsMapPopulationCap", default: "25", block: undefined},
        {type: "text", refvar: "spiderlingsNestSummonWeights"},
        {type: "range", name: "spiderlingsNestSpinnerWeight", refvar: "spiderlingsNestSpinnerWeight", default: 2, rangelow: 0, rangehigh: 10, stepcount: 1, block: undefined},
        {type: "range", name: "spiderlingsNestJumperWeight", refvar: "spiderlingsNestJumperWeight", default: 2, rangelow: 0, rangehigh: 10, stepcount: 1, block: undefined},
        {type: "range", name: "spiderlingsNestWebCasterWeight", refvar: "spiderlingsNestWebCasterWeight", default: 2, rangelow: 0, rangehigh: 10, stepcount: 1, block: undefined},
        {type: "range", name: "spiderlingsNestTunnelerWeight", refvar: "spiderlingsNestTunnelerWeight", default: 1, rangelow: 0, rangehigh: 10, stepcount: 1, block: undefined},
        {type: "text", refvar: "spiderlingsNestReinforcementControl"},
        {type: "string", name: "spiderlingsNestReinforcementCap", refvar: "spiderlingsNestReinforcementCap", default: "6", block: undefined},
        {type: "text", refvar: "spiderlingsNestTunnelerCap"},
        {type: "string", name: "spiderlingsNestTunnelerCap", refvar: "spiderlingsNestTunnelerCap", default: "3", block: undefined},
        {type: "range", name: "spiderlingsNestReinforcementInterval", refvar: "spiderlingsNestReinforcementInterval", default: 2, rangelow: 2, rangehigh: 20, stepcount: 1, block: undefined},
    ];

    // Nest reinforcement population weights / 巢穴增援种群权重。
    const SHARED_SPIDERLING_OPTIONS = Object.freeze([
        Object.freeze({enemy: "Spinner", refvar: "spiderlingsNestSpinnerWeight", default: 2}),
        Object.freeze({enemy: "Jumper", refvar: "spiderlingsNestJumperWeight", default: 2}),
        Object.freeze({enemy: "WebCaster", refvar: "spiderlingsNestWebCasterWeight", default: 2}),
        Object.freeze({enemy: "Tunneler", refvar: "spiderlingsNestTunnelerWeight", default: 1}),
    ]);
    const DEFAULT_SPIDERLING_WEIGHTS = Object.freeze(Object.fromEntries(
        SHARED_SPIDERLING_OPTIONS.map((option) => [option.enemy, option.default])
    ));
    const NORMAL_SPIDERLING_WEIGHTS = Object.freeze({
        Spinner: 12,
        Jumper: 12,
        WebCaster: 8,
        Tunneler: 4,
        NestEntrance: 2,
    });
    const SQUAD_MEMBERS = Object.freeze(["Jumper", "WebCaster", "Tunneler", "Spinner"]);
    const SQUAD_STATE_FIELD = "SpiderlingsGuaranteedSquadState";
    const SQUAD_PROVENANCE_FIELD = "SpiderlingsSquadProvenance";
    const SQUAD_PROVENANCE = "guaranteed-squad";
    const SQUAD_STATES = Object.freeze({
        DISABLED: "disabled",
        INELIGIBLE: "ineligible",
        UNPLACEABLE: "unplaceable",
        POPULATION_CAPPED: "population-capped",
        CREATION_FAILED: "creation-failed",
        SPAWNED: "spawned",
    });
    const TERMINAL_SQUAD_STATES = new Set(Object.values(SQUAD_STATES));
    const NEST_PARENT_ID_FIELD = "SpiderlingsNestParentID";
    const NEST_TIMER_FIELD = "SpiderlingsNestReinforcementTimer";
    const NEST_TUNNELER_COUNT_FIELD = "SpiderlingsNestTunnelerCount";
    const NEST_NPC_THREAT_FLAG = "SpiderlingsNestNPCThreat";
    const NEST_REINFORCEMENT_DEFAULT_CAP = 6;
    const NEST_REINFORCEMENT_DEFAULT_INTERVAL = 2;
    // Per-check summon chance: 15% base plus 10 percentage points for each other
    // living hostile NestEntrance within five tiles, capped at 100%.
    const NEST_REINFORCEMENT_BASE_CHANCE = 0.15;
    const NEST_REINFORCEMENT_NEARBY_BONUS = 0.1;
    const NEST_REINFORCEMENT_PROXIMITY_RADIUS = 5;
    const NEST_REINFORCEMENT_SPAWN_RADII = Object.freeze([2.5, 5, 7.5]);

    function clampSpiderlingWeight(value, fallback) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.max(0, Math.min(10, Math.round(numeric)));
    }

    function normalizeSpiderlingWeights(weights = {}) {
        return Object.fromEntries(SHARED_SPIDERLING_OPTIONS.map((option) => [
            option.enemy,
            clampSpiderlingWeight(weights[option.enemy], option.default),
        ]));
    }

    function selectWeightedSpiderling(weights = {}, random = Math.random) {
        const normalized = normalizeSpiderlingWeights(weights);
        const total = SHARED_SPIDERLING_OPTIONS.reduce((sum, option) => sum + normalized[option.enemy], 0);
        if (total <= 0) return null;

        const randomValue = Math.min(Math.max(Number(random()), 0), 1 - Number.EPSILON);
        const roll = randomValue * total;
        let cursor = 0;
        for (const option of SHARED_SPIDERLING_OPTIONS) {
            cursor += normalized[option.enemy];
            if (roll < cursor) return option.enemy;
        }
        return SHARED_SPIDERLING_OPTIONS[SHARED_SPIDERLING_OPTIONS.length - 1].enemy;
    }

    function nativePopulationOverrides(name, tags = {}) {
        const weight = NORMAL_SPIDERLING_WEIGHTS[name];
        if (weight == undefined) return null;
        const normalizedTags = Array.isArray(tags)
            ? tags.filter((tag) => tag != "minor")
            : Object.assign({}, tags);
        if (!Array.isArray(normalizedTags)) delete normalizedTags.minor;
        return {weight, tags: normalizedTags};
    }

    function pointKey(pointOrX, y) {
        return typeof pointOrX == "object" ? `${pointOrX.x},${pointOrX.y}` : `${pointOrX},${y}`;
    }

    function comparePoints(left, right) {
        return left.y - right.y || left.x - right.x;
    }

    function chebyshevDistance(left, right) {
        return left && right ? Math.max(Math.abs(left.x - right.x), Math.abs(left.y - right.y)) : Infinity;
    }

    function isSquadCellLegal(cell, options = {}) {
        if (!cell || !Number.isInteger(cell.x) || !Number.isInteger(cell.y)
            || cell.x <= 0 || cell.y <= 0 || cell.x >= options.width || cell.y >= options.height) return false;
        if (options.isMovable && !options.isMovable(cell)) return false;
        if (options.isOccupied && options.isOccupied(cell)) return false;
        if (options.isOffLimits && options.isOffLimits(cell)) return false;
        if (options.isReachable && !options.isReachable(cell)) return false;
        if (options.player && chebyshevDistance(cell, options.player) < 10) return false;
        if (options.start && chebyshevDistance(cell, options.start) < 10) return false;
        const exits = [options.end, ...(options.shortcuts || [])].filter(Boolean);
        return exits.every((exit) => chebyshevDistance(cell, exit) >= 4);
    }

    function legalSquadCells(options = {}) {
        const result = [];
        for (let y = 1; y < options.height; y += 1) {
            for (let x = 1; x < options.width; x += 1) {
                const cell = {x, y};
                if (isSquadCellLegal(cell, options)) result.push(cell);
            }
        }
        return result;
    }

    function canonicalCells(cells) {
        return cells.map((cell) => ({x: cell.x, y: cell.y})).sort(comparePoints);
    }

    function candidateKey(cells) {
        return canonicalCells(cells).map(pointKey).join("|");
    }

    function enumerateSquareCandidates(options = {}) {
        const result = [];
        for (let y = 1; y < options.height - 1; y += 1) {
            for (let x = 1; x < options.width - 1; x += 1) {
                const cells = [
                    {x, y}, {x: x + 1, y},
                    {x, y: y + 1}, {x: x + 1, y: y + 1},
                ];
                if (cells.every((cell) => isSquadCellLegal(cell, options))) {
                    result.push({anchor: {x, y}, cells});
                }
            }
        }
        return result;
    }

    function isConnectedCandidate(cells) {
        if (!Array.isArray(cells) || cells.length !== 4 || new Set(cells.map(pointKey)).size !== 4) return false;
        const remaining = new Map(cells.map((cell) => [pointKey(cell), cell]));
        const pending = [cells[0]];
        remaining.delete(pointKey(cells[0]));
        while (pending.length > 0) {
            const current = pending.pop();
            for (const [key, cell] of remaining) {
                const distance = chebyshevDistance(current, cell);
                if (distance > 0 && distance <= 1) {
                    remaining.delete(key);
                    pending.push(cell);
                }
            }
        }
        return remaining.size === 0;
    }

    function findCompactAnchor(cells) {
        if (!isConnectedCandidate(cells)) return null;
        const ordered = canonicalCells(cells);
        const anchor = ordered.find((candidate) => ordered.every((cell) => chebyshevDistance(candidate, cell) <= 2));
        return anchor ? {x: anchor.x, y: anchor.y} : null;
    }

    function isSquareCandidate(cells) {
        const xs = [...new Set(cells.map((cell) => cell.x))].sort((left, right) => left - right);
        const ys = [...new Set(cells.map((cell) => cell.y))].sort((left, right) => left - right);
        return xs.length === 2 && ys.length === 2 && xs[1] - xs[0] === 1 && ys[1] - ys[0] === 1;
    }

    function enumerateCompactCandidates(options = {}) {
        const legal = legalSquadCells(options);
        const indexByKey = new Map(legal.map((cell, index) => [pointKey(cell), index]));
        const candidates = new Map();

        function enumerateConnectedSubsets(rootIndex, candidateIndexes, visited) {
            const partialKey = candidateIndexes.join(",");
            if (visited.has(partialKey)) return;
            visited.add(partialKey);
            if (candidateIndexes.length === 4) {
                const cells = candidateIndexes.map((index) => legal[index]);
                const anchor = findCompactAnchor(cells);
                if (anchor && !isSquareCandidate(cells)) {
                    candidates.set(candidateKey(cells), {anchor, cells: canonicalCells(cells)});
                }
                return;
            }

            const frontier = new Set();
            for (const index of candidateIndexes) {
                const cell = legal[index];
                for (let dx = -1; dx <= 1; dx += 1) {
                    for (let dy = -1; dy <= 1; dy += 1) {
                        if (dx === 0 && dy === 0) continue;
                        const neighborIndex = indexByKey.get(pointKey(cell.x + dx, cell.y + dy));
                        if (neighborIndex != undefined && neighborIndex > rootIndex && !candidateIndexes.includes(neighborIndex)) {
                            frontier.add(neighborIndex);
                        }
                    }
                }
            }
            for (const neighborIndex of [...frontier].sort((left, right) => left - right)) {
                enumerateConnectedSubsets(
                    rootIndex,
                    [...candidateIndexes, neighborIndex].sort((left, right) => left - right),
                    visited
                );
            }
        }

        for (let rootIndex = 0; rootIndex < legal.length; rootIndex += 1) {
            enumerateConnectedSubsets(rootIndex, [rootIndex], new Set());
        }
        return [...candidates.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([, candidate]) => candidate);
    }

    function normalizedRandom(random) {
        return Math.min(Math.max(Number(random()), 0), 1 - Number.EPSILON);
    }

    function planSquadPlacement(options = {}) {
        const squares = enumerateSquareCandidates(options);
        const tier = squares.length > 0 ? "square" : "compact";
        const candidates = squares.length > 0 ? squares : enumerateCompactCandidates(options);
        if (candidates.length === 0) return {outcome: "unplaceable"};

        const random = options.random || Math.random;
        const candidate = candidates[Math.floor(normalizedRandom(random) * candidates.length)];
        const members = [...SQUAD_MEMBERS];
        for (let index = members.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(normalizedRandom(random) * (index + 1));
            [members[index], members[swapIndex]] = [members[swapIndex], members[index]];
        }
        return {
            outcome: "placeable",
            tier,
            candidateCount: candidates.length,
            anchor: {x: candidate.anchor.x, y: candidate.anchor.y},
            placements: candidate.cells.map((cell, index) => ({enemy: members[index], cell: {x: cell.x, y: cell.y}})),
        };
    }

    function isEligibleOrdinaryMap(room = {}) {
        return room.bossroom !== true && room.enemies !== false && room.spawns !== false;
    }

    api.EncounterRules = Object.freeze({
        DEFAULT_WEIGHTS: DEFAULT_SPIDERLING_WEIGHTS,
        NATIVE_WEIGHTS: NORMAL_SPIDERLING_WEIGHTS,
        SQUAD_MEMBERS,
        SQUAD_PROVENANCE,
        SQUAD_PROVENANCE_FIELD,
        SQUAD_STATES,
        SQUAD_STATE_FIELD,
        enumerateCompactCandidates,
        enumerateSquareCandidates,
        findCompactAnchor,
        isConnectedCandidate,
        isEligibleOrdinaryMap,
        isSquadCellLegal,
        nativePopulationOverrides,
        normalizeSpiderlingWeights,
        planSquadPlacement,
        selectWeightedSpiderling,
    });

    function clampInteger(value, fallback, minimum, maximum) {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return fallback;
        return Math.max(minimum, Math.min(maximum, Math.round(numeric)));
    }

    function normalizeReinforcementCap(value) {
        const normalized = typeof value == "string" ? value.trim() : value;
        if (typeof normalized == "string" && !/^\d+$/.test(normalized)) return NEST_REINFORCEMENT_DEFAULT_CAP;
        const numeric = Number(normalized);
        return Number.isSafeInteger(numeric) && numeric >= 0 ? numeric : NEST_REINFORCEMENT_DEFAULT_CAP;
    }

    function normalizeReinforcementInterval(value) {
        return clampInteger(value, NEST_REINFORCEMENT_DEFAULT_INTERVAL, 2, 20);
    }

    function normalizeNestTimer(value) {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
    }

    function countLivingOffspring(entities = [], parentID) {
        return entities.filter((entity) => entity
            && entity.hp > 0
            && entity[NEST_PARENT_ID_FIELD] === parentID).length;
    }

    function reinforcementSpatialKey(entity) {
        return `${Math.floor(entity.x / NEST_REINFORCEMENT_PROXIMITY_RADIUS)},${Math.floor(entity.y / NEST_REINFORCEMENT_PROXIMITY_RADIUS)}`;
    }

    function indexReinforcementState(entities) {
        const nests = [];
        const hostileNests = new Set();
        const hostileNestBuckets = new Map();
        const livingOffspringByParent = new Map();
        const knownTunnelersByParent = new Map();

        // Rebuild once per tick: entity allegiance and life state can change without an invalidation event.
        for (const entity of entities) {
            if (!entity) continue;
            const parentID = entity[NEST_PARENT_ID_FIELD];
            if (parentID !== undefined && entity.Enemy?.name == "Tunneler")
                knownTunnelersByParent.set(parentID, (knownTunnelersByParent.get(parentID) || 0) + 1);
            if (entity.hp > 0 && parentID !== undefined) {
                livingOffspringByParent.set(parentID, (livingOffspringByParent.get(parentID) || 0) + 1);
            }
            if (entity.hp <= 0 || !entity.Enemy || entity.Enemy.name != "NestEntrance") continue;
            nests.push(entity);
            if (typeof KDHostile != "function" || !KDHostile(entity)) continue;
            hostileNests.add(entity);
            const key = reinforcementSpatialKey(entity);
            const bucket = hostileNestBuckets.get(key) || [];
            bucket.push(entity);
            hostileNestBuckets.set(key, bucket);
        }
        return {nests, hostileNests, hostileNestBuckets, livingOffspringByParent, knownTunnelersByParent};
    }

    function countNearbyHostileNests(nest, hostileNestBuckets) {
        const bucketX = Math.floor(nest.x / NEST_REINFORCEMENT_PROXIMITY_RADIUS);
        const bucketY = Math.floor(nest.y / NEST_REINFORCEMENT_PROXIMITY_RADIUS);
        let count = 0;
        for (let dx = -1; dx <= 1; dx += 1) {
            for (let dy = -1; dy <= 1; dy += 1) {
                const bucket = hostileNestBuckets.get(`${bucketX + dx},${bucketY + dy}`) || [];
                for (const candidate of bucket) {
                    if (candidate !== nest && Math.hypot(candidate.x - nest.x, candidate.y - nest.y)
                        <= NEST_REINFORCEMENT_PROXIMITY_RADIUS) count += 1;
                }
            }
        }
        return count;
    }

    function advanceNestTimer(options = {}) {
        const timer = normalizeNestTimer(options.timer);
        const cap = normalizeReinforcementCap(options.cap);
        const interval = normalizeReinforcementInterval(options.interval);
        const delta = Number(options.delta);
        if (!options.eligible || cap === 0 || !Number.isFinite(delta) || delta <= 0) {
            return {attempt: false, timer};
        }

        const nextTimer = Math.min(interval, timer + delta);
        const livingOffspring = Math.max(0, Number(options.livingOffspring) || 0);
        return {
            attempt: nextTimer >= interval && livingOffspring < cap,
            timer: nextTimer,
        };
    }

    api.ReinforcementRules = Object.freeze({
        DEFAULT_CAP: NEST_REINFORCEMENT_DEFAULT_CAP,
        DEFAULT_INTERVAL: NEST_REINFORCEMENT_DEFAULT_INTERVAL,
        PARENT_ID_FIELD: NEST_PARENT_ID_FIELD,
        PROXIMITY_RADIUS: NEST_REINFORCEMENT_PROXIMITY_RADIUS,
        RADIUS: NEST_REINFORCEMENT_SPAWN_RADII[0],
        SPAWN_RADII: NEST_REINFORCEMENT_SPAWN_RADII,
        TIMER_FIELD: NEST_TIMER_FIELD,
        advanceTimer: advanceNestTimer,
        countLivingOffspring,
        normalizeCap: normalizeReinforcementCap,
        normalizeInterval: normalizeReinforcementInterval,
    });

    api.MOD_ID = MOD_ID;

    // Registration helper: replace by name instead of duplicating entries on reload.
    // 注册工具：按 name 覆盖旧条目，避免重复加载 mod 后出现同名怪物/拘束/法术多份。
    api.registerNamed = function(array, object) {
        const index = array.findIndex((entry) => entry.name == object.name);
        if (index >= 0) array.splice(index, 1, object);
        else array.push(object);
    };

    const RESTRAINT_COMMON_SHRINES = Object.freeze(["Latex", "SpiderlingsWeb"]);
    const RESTRAINT_REFRESH_TRIGGERS = Object.freeze(["postApply", "postRemoval", "afterDress"]);
    const RESTRAINT_REFRESH_EVENT = "SpiderlingsRefreshModels";
    const restraintCatalogEntries = new Map();

    function addUnique(list, value) {
        const result = Array.isArray(list) ? list : [];
        if (!result.includes(value)) result.push(value);
        return result;
    }

    function describeRestraintDefinition(definition) {
        const restraint = definition && definition.restraint;
        const id = definition && (definition.id || (restraint && restraint.name));
        const model = definition && (definition.model || (restraint && restraint.Model));
        if (!id) throw new TypeError("Spiderlings restraint definitions require an id or restraint.name.");
        if (model && (/\.png$/i.test(model) || /[\\/]/.test(model))) {
            throw new TypeError(`Spiderlings restraint ${id} must reference a logical model name, not a PNG path.`);
        }
        return Object.freeze({
            id,
            module: definition.module || null,
            stage: definition.stage || null,
            model: model || null,
        });
    }

    function buildRestraint(definition) {
        const restraint = definition.restraint;
        if (!restraint || typeof restraint != "object") throw new TypeError("Spiderlings restraint definitions require restraint data.");
        for (const shrine of RESTRAINT_COMMON_SHRINES) restraint.shrine = addUnique(restraint.shrine, shrine);
        restraint.events = Array.isArray(restraint.events) ? restraint.events : [];
        for (const trigger of RESTRAINT_REFRESH_TRIGGERS) {
            if (!restraint.events.some((event) => event.trigger == trigger && event.type == RESTRAINT_REFRESH_EVENT)) {
                restraint.events.push({inheritLinked: true, trigger, type: RESTRAINT_REFRESH_EVENT});
            }
        }
        return restraint;
    }

    api.restraintCatalog = Object.freeze({
        describe: describeRestraintDefinition,
        list() {
            return [...restraintCatalogEntries.values()];
        },
        register(definition) {
            const descriptor = describeRestraintDefinition(definition);
            const restraint = buildRestraint(definition);
            restraintCatalogEntries.set(descriptor.id, Object.freeze({
                ...descriptor,
                restraint,
            }));
            api.registerNamed(KinkyDungeonRestraints, restraint);
            if (definition.text) api.registerRestraintText(descriptor.id, ...definition.text);
            return restraint;
        },
    });

    api.registerRestraintText = function(name, displayName, description, flavorText) {
        if (typeof KinkyDungeonAddRestraintText != "function") return false;
        const entry = restraintCatalogEntries.get(name);
        if (entry) {
            restraintCatalogEntries.set(name, Object.freeze({
                ...entry,
                text: Object.freeze([displayName, description, flavorText]),
            }));
        }
        KinkyDungeonAddRestraintText(name, displayName, description, flavorText);
        return true;
    };

    // Add a restraint to KinkyDungeonRestraints / 添加拘束到 KinkyDungeonRestraints。
    api.createRestraint = function(object) {
        return api.restraintCatalog.register({restraint: object});
    };

    function disableLegacyNestSpells(enemy) {
        if (enemy && enemy.name == "NestEntrance") enemy.spells = [];
        return enemy;
    }

    // Add enemies to KinkyDungeonEnemies / 添加怪物到 KinkyDungeonEnemies。
    // KD 5.5 draws enemy sprites from Game/Enemies/<name>.png; spiderlings use 72x72 non-humanoid sprites.
    // KD 5.5 会按 Game/Enemies/<name>.png 查找贴图；幼蛛统一声明为非人形 72x72 贴图。
    api.addEnemies = function(enemies) {
        for (let enemy of enemies) {
            const populationOverrides = nativePopulationOverrides(enemy.name, enemy.tags);
            if (populationOverrides) Object.assign(enemy, populationOverrides);
            if (SQUAD_MEMBERS.includes(enemy.name)) enemy.tags.SpiderlingsMapPopulation = true;
            disableLegacyNestSpells(enemy);
            enemy.nonHumanoid = true;
            enemy.GFX = Object.assign({spriteWidth: 72, spriteHeight: 72}, enemy.GFX || {});
            api.registerNamed(KinkyDungeonEnemies, enemy);
        }
    };

    // Add enemy spells to KinkyDungeonSpellListEnemies / 添加敌方法术到 KinkyDungeonSpellListEnemies。
    api.addSpells = function(spells) {
        for (let spell of spells) api.registerNamed(KinkyDungeonSpellListEnemies, spell);
    };

    function configDefault(refvar) {
        const config = MOD_CONFIG.find((entry) => entry.refvar == refvar);
        return config ? config.default : undefined;
    }

    // Register defaults after settings load, while still letting Spiderlings run without KDModConfigs.
    // 在设置加载后注册默认值，同时保证没有 KDModConfigs 时 Spiderlings 也能正常运行。
    api.ensureModSettings = function() {
        if (typeof KDModConfigs != "undefined") KDModConfigs[MOD_ID] = MOD_CONFIG;
        if (typeof KDModSettings == "undefined") return;
        if (KDModSettings == null) KDModSettings = {};
        if (!KDModSettings[MOD_ID]) KDModSettings[MOD_ID] = {};
        for (let config of MOD_CONFIG) {
            if (config.refvar && config.default != undefined && KDModSettings[MOD_ID][config.refvar] == undefined) {
                KDModSettings[MOD_ID][config.refvar] = config.default;
            }
        }
    };

    api.getSetting = function(refvar) {
        const fallback = configDefault(refvar);
        if (typeof KDModSettings == "undefined" || !KDModSettings || !KDModSettings[MOD_ID]) return fallback;
        return KDModSettings[MOD_ID][refvar] != undefined ? KDModSettings[MOD_ID][refvar] : fallback;
    };

    api.getMapPopulationCap = function() {
        const value = String(api.getSetting("spiderlingsMapPopulationCap")).trim();
        const numeric = Number(value);
        return /^\d+$/.test(value) && Number.isSafeInteger(numeric) ? numeric : 25;
    };

    function availableSpiderlingSlots() {
        const cap = api.getMapPopulationCap();
        if (cap === 0) return Infinity;
        const entities = typeof KDMapData != "undefined" ? KDMapData?.Entities || [] : [];
        const living = entities.filter((entity) => entity.hp > 0
            && SQUAD_MEMBERS.includes(typeof entity.Enemy == "string" ? entity.Enemy : entity.Enemy?.name)).length;
        return Math.max(0, cap - living);
    }

    // Keep the native weighted selection and its fallback, excluding only our
    // registered species when the current map has no free spider slots.
    if (typeof KinkyDungeonGetEnemy == "function") {
        const nativeGetEnemy = KinkyDungeonGetEnemy;
        KinkyDungeonGetEnemy = function(...args) {
            if (availableSpiderlingSlots() === 0) {
                args[7] = [...(args[7] || []), "SpiderlingsMapPopulation"];
            }
            return nativeGetEnemy.apply(this, args);
        };
    }

    // Native wandering waves can choose RespawnQueue entries by name instead
    // of using the weighted pool. Leave blocked entries queued for a later wave.
    if (typeof KinkyDungeonHandleWanderingSpawns == "function" && typeof KinkyDungeonGetEnemyByName == "function") {
        let selectingWanderingSpawns = false;
        const nativeWanderingSpawns = KinkyDungeonHandleWanderingSpawns;
        const nativeGetEnemyByName = KinkyDungeonGetEnemyByName;
        KinkyDungeonGetEnemyByName = function(name) {
            const result = nativeGetEnemyByName.apply(this, arguments);
            if (selectingWanderingSpawns && SQUAD_MEMBERS.includes(result?.name)
                && availableSpiderlingSlots() === 0) return undefined;
            return result;
        };
        KinkyDungeonHandleWanderingSpawns = function() {
            const previous = selectingWanderingSpawns;
            selectingWanderingSpawns = true;
            try { return nativeWanderingSpawns.apply(this, arguments); }
            finally { selectingWanderingSpawns = previous; }
        };
    }

    // All Spiderlings spells, death bursts and controlled reinforcements use this
    // native entry. Clamp before creation so callers receive only real entities.
    if (typeof KinkyDungeonSummonEnemy == "function") {
        const nativeSummonEnemy = KinkyDungeonSummonEnemy;
        KinkyDungeonSummonEnemy = function(x, y, summonType, count, ...rest) {
            const name = typeof summonType == "string" ? summonType : summonType?.name;
            if (SQUAD_MEMBERS.includes(name)) {
                const slots = availableSpiderlingSlots();
                if (slots === 0) return [];
                if (count > slots) return nativeSummonEnemy.call(this, x, y, summonType, slots, ...rest);
            }
            return nativeSummonEnemy.apply(this, arguments);
        };
    }

    // Clamp saved values so broken localStorage cannot create invalid spell arrays.
    // 限制存档设置值，避免损坏的 localStorage 生成无效召唤列表。
    api.getNestWeight = function(refvar, fallback) {
        const raw = Number(api.getSetting(refvar));
        return clampSpiderlingWeight(raw, fallback);
    };

    api.getSharedSpiderlingWeights = function() {
        return Object.fromEntries(SHARED_SPIDERLING_OPTIONS.map((option) => [
            option.enemy,
            api.getNestWeight(option.refvar, option.default),
        ]));
    };

    api.getNestReinforcementCap = function() {
        return normalizeReinforcementCap(api.getSetting("spiderlingsNestReinforcementCap"));
    };

    api.getNestTunnelerCap = function() {
        const value = String(api.getSetting("spiderlingsNestTunnelerCap")).trim();
        const numeric = Number(value);
        return /^\d+$/.test(value) && Number.isSafeInteger(numeric) ? numeric : 3;
    };

    api.getNestReinforcementInterval = function() {
        return normalizeReinforcementInterval(api.getSetting("spiderlingsNestReinforcementInterval"));
    };

    // Compatibility entry point for older Spiderlings.js data. Recurring nest spells are disabled.
    // 兼容旧 Spiderlings.js 数据的入口；巢穴循环法术已停用。
    api.buildNestEntranceSpells = function() {
        return [];
    };

    // Keep the legacy generic spell path disabled after settings load/save.
    // 设置读取或保存后仍保持旧通用法术路径停用。
    api.refreshNestEntranceSummons = function() {
        if (typeof KinkyDungeonEnemies == "undefined") return;
        const nestEntrance = KinkyDungeonEnemies.find((enemy) => enemy.name == "NestEntrance");
        disableLegacyNestSpells(nestEntrance);
        if (typeof KinkyDungeonRefreshEnemiesCache == "function") KinkyDungeonRefreshEnemiesCache();
    };

    // Hook KD's settings events so changes take effect without editing the mod file.
    // 挂接 KD 设置事件，让配置变化无需手改 mod 文件即可生效。
    api.registerModConfig = function() {
        api.ensureModSettings();
        if (typeof KDEventMapGeneric == "undefined") return;
        KDEventMapGeneric["afterModSettingsLoad"] = KDEventMapGeneric["afterModSettingsLoad"] || {};
        KDEventMapGeneric["afterModSettingsLoad"][MOD_ID] = (e, data) => {
            api.ensureModSettings();
            api.refreshNestEntranceSummons();
            if (api.applyWebbingColor) api.applyWebbingColor(true);
        };
        KDEventMapGeneric["afterModConfig"] = KDEventMapGeneric["afterModConfig"] || {};
        KDEventMapGeneric["afterModConfig"][MOD_ID] = (e, data) => {
            api.ensureModSettings();
            api.refreshNestEntranceSummons();
            if (api.applyWebbingColor) api.applyWebbingColor(true);
        };
    };

    // English fallback labels for the configuration screen.
    // 配置界面的英文兜底文本；中文翻译在 SpiderlingsCN.csv 中。
    api.registerModConfigText = function() {
        if (typeof addTextKey != "function") return;
        addTextKey("KDModButtonSpiderlings", "Spiderlings");
        addTextKey("KDModButtonspiderlingsPinkWebbing", "Pink webbing (off: original)");
        addTextKey("KDModButtonspiderlingsSquad", "Fixed spiderling squad");
        addTextKey("KDModButtonspiderlingsMapPopulationCap", "Spiders per map (0: unlimited)");
        addTextKey("KDModButtonspiderlingsNestSummonWeights", "Nest reinforcement type weights");
        addTextKey("KDModButtonspiderlingsNestSpinnerWeight", "Spinner weight");
        addTextKey("KDModButtonspiderlingsNestJumperWeight", "Jumper weight");
        addTextKey("KDModButtonspiderlingsNestWebCasterWeight", "Web Caster weight");
        addTextKey("KDModButtonspiderlingsNestTunnelerWeight", "Tunneler weight");
        addTextKey("KDModButtonspiderlingsNestReinforcementControl", "Living reinforcements per nest");
        addTextKey("KDModButtonspiderlingsNestReinforcementCap", "Living reinforcements per nest");
        addTextKey("KDModButtonspiderlingsNestTunnelerCap", "Lifetime Tunnelers per nest (0: none)");
        addTextKey("KDModButtonspiderlingsNestReinforcementInterval", "Nest interval (turns)");
    };

    function currentRoomRules() {
        if (typeof KDGetAltType != "function" || typeof MiniGameKinkyDungeonLevel == "undefined") return {};
        return KDGetAltType(MiniGameKinkyDungeonLevel) || {};
    }

    function runtimePlacementOptions(random) {
        const mapTile = (cell) => KinkyDungeonMapGet(cell.x, cell.y);
        return {
            width: KDMapData.GridWidth,
            height: KDMapData.GridHeight,
            player: typeof KinkyDungeonPlayerEntity != "undefined" ? KinkyDungeonPlayerEntity : null,
            start: KDMapData.StartPosition,
            end: KDMapData.EndPosition,
            shortcuts: Object.values(KDMapData.ShortcutPositions || {}),
            isMovable: (cell) => typeof KinkyDungeonMapGet == "function"
                && typeof KinkyDungeonMovableTilesEnemy != "undefined"
                && KinkyDungeonMovableTilesEnemy.includes(mapTile(cell)),
            isOccupied: (cell) => {
                if (typeof KinkyDungeonEntityAt == "function" && KinkyDungeonEntityAt(cell.x, cell.y)) return true;
                if (typeof KinkyDungeonPlayerEntity != "undefined" && KinkyDungeonPlayerEntity
                    && KinkyDungeonPlayerEntity.x == cell.x && KinkyDungeonPlayerEntity.y == cell.y) return true;
                return (KDMapData.Entities || []).some((entity) => entity && entity.x == cell.x && entity.y == cell.y);
            },
            isOffLimits: (cell) => (typeof KDDefaultAvoidTiles != "undefined" && KDDefaultAvoidTiles.includes(mapTile(cell)))
                || (typeof KinkyDungeonTilesGet == "function" && KinkyDungeonTilesGet(pointKey(cell))?.OL === true),
            isReachable: (cell) => !!(KDMapData.RandomPathablePoints && KDMapData.RandomPathablePoints[pointKey(cell)]),
            random,
        };
    }

    function setSquadState(state) {
        KDMapData[SQUAD_STATE_FIELD] = state;
    }

    function runGuaranteedSpiderlingSquad() {
        if (typeof KDMapData == "undefined" || !KDMapData) return false;
        if (TERMINAL_SQUAD_STATES.has(KDMapData[SQUAD_STATE_FIELD])) return false;
        if (api.getSetting("spiderlingsSquad") !== true) {
            setSquadState(SQUAD_STATES.DISABLED);
            return false;
        }
        const room = currentRoomRules();
        if (!isEligibleOrdinaryMap(room)) {
            setSquadState(SQUAD_STATES.INELIGIBLE);
            return false;
        }
        if (availableSpiderlingSlots() < SQUAD_MEMBERS.length) {
            setSquadState(SQUAD_STATES.POPULATION_CAPPED);
            return false;
        }
        const random = typeof KDRandom == "function" ? KDRandom : Math.random;
        const placementOptions = runtimePlacementOptions(random);
        const plan = planSquadPlacement(placementOptions);
        if (plan.outcome === "unplaceable") {
            setSquadState(SQUAD_STATES.UNPLACEABLE);
            return false;
        }
        const definitionsReady = typeof KinkyDungeonGetEnemyByName == "function"
            && plan.placements.every((placement) => !!KinkyDungeonGetEnemyByName(placement.enemy));
        const targetsReady = plan.placements.every((placement) => isSquadCellLegal(placement.cell, placementOptions));
        const capacityReady = Array.isArray(KDMapData.Entities)
            && KDMapData.Entities.length + plan.placements.length <= 300;
        if (!definitionsReady || !targetsReady || !capacityReady
            || typeof KinkyDungeonSummonEnemy != "function" || typeof KDRemoveEntity != "function") {
            setSquadState(SQUAD_STATES.CREATION_FAILED);
            return false;
        }

        const createdMembers = [];
        for (const placement of plan.placements) {
            const point = placement.cell;
            const created = KinkyDungeonSummonEnemy(
                point.x, point.y, placement.enemy, 1, 0, false,
                undefined, false, false, undefined, true, undefined, false, true
            );
            if (Array.isArray(created)) {
                for (const entity of created) if (entity && !createdMembers.includes(entity)) createdMembers.push(entity);
            }
            if (!Array.isArray(created) || created.length !== 1
                || created[0].x !== point.x || created[0].y !== point.y) {
                for (let index = createdMembers.length - 1; index >= 0; index -= 1) {
                    KDRemoveEntity(createdMembers[index], false, false, true);
                }
                setSquadState(SQUAD_STATES.CREATION_FAILED);
                return false;
            }
            created[0][SQUAD_PROVENANCE_FIELD] = SQUAD_PROVENANCE;
        }
        setSquadState(SQUAD_STATES.SPAWNED);
        return createdMembers.length === plan.placements.length;
    }

    api.runGuaranteedSpiderlingSquad = runGuaranteedSpiderlingSquad;

    function nestCanEngagePlayer(nest, hostileNests) {
        if (!hostileNests.has(nest) || !nest.aware) return false;
        if (typeof KinkyDungeonPlayerEntity == "undefined" || !KinkyDungeonPlayerEntity) return false;
        if (typeof KinkyDungeonCheckLOS != "function") return false;
        const dx = nest.x - KinkyDungeonPlayerEntity.x;
        const dy = nest.y - KinkyDungeonPlayerEntity.y;
        const distance = typeof KDistEuclidean == "function" ? KDistEuclidean(dx, dy) : Math.hypot(dx, dy);
        const visionRadius = Number(nest.Enemy.visionRadius) || 0;
        return KinkyDungeonCheckLOS(nest, KinkyDungeonPlayerEntity, distance, visionRadius, false, false);
    }

    function nestCanReinforce(nest, hostileNests) {
        if (!hostileNests.has(nest)) return false;
        if (nestCanEngagePlayer(nest, hostileNests)) return true;
        if (typeof KDEnemyHasFlag == "function" && KDEnemyHasFlag(nest, NEST_NPC_THREAT_FLAG)) return true;
        // The native rival selector retains perception, helplessness, prisoner
        // and allegiance checks, including when the player is out of sight.
        if (typeof KinkyDungeonNearestPlayer != "function" || typeof KDGetFaction != "function") return false;
        const target = KinkyDungeonNearestPlayer(nest, true, true);
        return target?.hp > 0 && !!target.Enemy && KDGetFaction(target) == "Maidforce" && KDHostile(nest, target);
    }

    function recordNestNPCAttack(_event, data = {}) {
        const nest = data.enemy;
        const source = data.attacker;
        if (nest?.Enemy?.name != "NestEntrance" || !(nest.hp > 0) || !data.aggro
            || !source?.Enemy || source.player || source === nest
            || typeof KDHostile != "function" || !KDHostile(nest) || !KDHostile(nest, source)
            || typeof KinkyDungeonSetEnemyFlag != "function") return;
        // One complete reinforcement interval, plus the current tick's native
        // flag expiry. Repeated hits refresh it; no instant or extra summon.
        KinkyDungeonSetEnemyFlag(nest, NEST_NPC_THREAT_FLAG, api.getNestReinforcementInterval() + 1);
    }

    function runNestReinforcements(_event, data = {}) {
        const delta = Number(data.delta);
        if (data.allied !== false || !Number.isFinite(delta) || delta <= 0
            || typeof KDMapData == "undefined" || !KDMapData || !Array.isArray(KDMapData.Entities)) return 0;

        const cap = api.getNestReinforcementCap();
        const tunnelerCap = api.getNestTunnelerCap();
        const interval = api.getNestReinforcementInterval();
        const weights = normalizeSpiderlingWeights(api.getSharedSpiderlingWeights());
        const index = indexReinforcementState(KDMapData.Entities);
        let successfulSummons = 0;

        for (const nest of index.nests) {
            // Native entity saves retain this counter. Existing nests seed it
            // once from attributable children still present in the loaded map.
            if (!Number.isSafeInteger(nest[NEST_TUNNELER_COUNT_FIELD]) || nest[NEST_TUNNELER_COUNT_FIELD] < 0)
                nest[NEST_TUNNELER_COUNT_FIELD] = index.knownTunnelersByParent.get(nest.id) || 0;
            const eligibleWeights = nest[NEST_TUNNELER_COUNT_FIELD] >= tunnelerCap
                ? {...weights, Tunneler: 0} : weights;
            const totalWeight = Object.values(eligibleWeights).reduce((sum, weight) => sum + weight, 0);
            const livingOffspring = index.livingOffspringByParent.get(nest.id) || 0;
            const decision = advanceNestTimer({
                timer: nest[NEST_TIMER_FIELD],
                delta,
                interval,
                cap,
                livingOffspring,
                eligible: nestCanReinforce(nest, index.hostileNests),
            });
            nest[NEST_TIMER_FIELD] = decision.timer;
            if (!decision.attempt || totalWeight <= 0 || availableSpiderlingSlots() === 0
                || typeof KinkyDungeonSummonEnemy != "function") continue;

            const random = typeof KDRandom == "function" ? KDRandom : Math.random;
            const nearbyNests = countNearbyHostileNests(nest, index.hostileNestBuckets);
            // Nearby contributors need only be alive and hostile; their awareness and LOS do not affect this bonus.
            const summonChance = Math.min(1, NEST_REINFORCEMENT_BASE_CHANCE
                + NEST_REINFORCEMENT_NEARBY_BONUS * nearbyNests);
            if (normalizedRandom(random) >= summonChance) {
                nest[NEST_TIMER_FIELD] = 0;
                continue;
            }

            const enemyName = selectWeightedSpiderling(eligibleWeights, random);
            if (!enemyName) continue;
            const faction = typeof KDGetFaction == "function" ? KDGetFaction(nest) : undefined;
            nest[NEST_TIMER_FIELD] = 0;
            let created = [];
            for (const radius of NEST_REINFORCEMENT_SPAWN_RADII) {
                created = KinkyDungeonSummonEnemy(
                    nest.x, nest.y, enemyName, 1, radius, true,
                    undefined, false, false, faction, true, undefined, true, false
                );
                if (Array.isArray(created) && created.length > 0) break;
            }
            if (!Array.isArray(created) || created.length === 0) continue;

            created[0][NEST_PARENT_ID_FIELD] = nest.id;
            if (enemyName == "Tunneler") nest[NEST_TUNNELER_COUNT_FIELD] += 1;
            successfulSummons += 1;
        }
        return successfulSummons;
    }

    api.runNestReinforcements = runNestReinforcements;
    api.registerEncounterEvents = function() {
        if (typeof KDEventMapGeneric == "undefined") return;
        if (typeof KDAddEvent == "function") {
            KDAddEvent(KDEventMapGeneric, "postMapgen", "SpiderlingsGuaranteedSquad", runGuaranteedSpiderlingSquad);
            KDAddEvent(KDEventMapGeneric, "afterEnemyTick", "SpiderlingsNestReinforcement", runNestReinforcements);
            KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", "SpiderlingsNestNPCThreat", recordNestNPCAttack);
        } else {
            KDEventMapGeneric.postMapgen = KDEventMapGeneric.postMapgen || {};
            KDEventMapGeneric.postMapgen.SpiderlingsGuaranteedSquad = runGuaranteedSpiderlingSquad;
            KDEventMapGeneric.afterEnemyTick = KDEventMapGeneric.afterEnemyTick || {};
            KDEventMapGeneric.afterEnemyTick.SpiderlingsNestReinforcement = runNestReinforcements;
        }
    };

    // Shared qualification for direct-hit cooperation and native movement preference.
    api.activeWebCasters = function(player) {
        if (!player || typeof KDMapData == "undefined" || typeof KDHostile != "function"
            || typeof KinkyDungeonCheckPath != "function") return [];
        return (KDMapData.Entities || []).filter((enemy) => enemy.Enemy?.name == "WebCaster"
            && enemy.hp > 0 && enemy.aware && KDHostile(enemy, player)
            && !(enemy.stun > 0 || enemy.freeze > 0 || enemy.silence > 0 || enemy.teleporting > 0)
            && !(typeof KDHelpless == "function" && KDHelpless(enemy))
            && Math.hypot(enemy.x - player.x, enemy.y - player.y) <= 6
            && KinkyDungeonCheckPath(enemy.x, enemy.y, player.x, player.y, false, false));
    };

    // KD hunt targets its own tile at melee distance, which can suppress retreat
    // even after the native kite gate succeeds. Keep the normal movement gates.
    if (typeof KDAIType != "undefined" && KDAIType.hunt) {
        const beforemove = KDAIType.hunt.beforemove;
        KDAIType.hunt.beforemove = function(enemy, player, aiData) {
            const handled = beforemove.apply(this, arguments);
            if (!handled && enemy.Enemy.name == "WebCaster" && aiData.kite
                && enemy.gx == enemy.x && enemy.gy == enemy.y
                && !KDEnemyHasFlag(enemy, "StayHere") && !KDEnemyHasFlag(enemy, "overrideMove")) {
                enemy.gx = enemy.x + Math.sign(enemy.x - player.x);
                enemy.gy = enemy.y + Math.sign(enemy.y - player.y);
            }
            return handled;
        };
    }

    // A direction preference inside KD's existing movement attempt, never an extra action.
    if (typeof KDGetDir == "function") {
        const nativeGetDir = KDGetDir;
        KDGetDir = function(enemy, target, func) {
            const original = nativeGetDir.apply(this, arguments);
            if (enemy.Enemy?.name != "WebCaster" || typeof AIData == "undefined" || !AIData.kite
                || !original || (!original.x && !original.y)
                || KDEnemyHasFlag(enemy, "StayHere") || KDEnemyHasFlag(enemy, "overrideMove")
                || KDIsImmobile(enemy)) return original;
            const player = KinkyDungeonPlayerEntity;
            // KD also calls this for NPC rivals and coordinate path goals.
            // Only spread firing angles while retreating from the player itself.
            if (target !== player) return original;
            const casters = api.activeWebCasters(player);
            if (!casters.includes(enemy) || casters.length < 2) return original;
            const partners = casters.filter((entry) => entry !== enemy);
            const separation = (x, y) => Math.min(...partners.map((partner) => {
                const ax = x - player.x, ay = y - player.y;
                const bx = partner.x - player.x, by = partner.y - player.y;
                return 1 - (ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1);
            }));
            const distance = Math.hypot(enemy.x - player.x, enemy.y - player.y);
            let best = original;
            let score = Math.max(separation(enemy.x, enemy.y), separation(enemy.x + original.x, enemy.y + original.y)) + 0.01;
            for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
                if (!dx && !dy) continue;
                const x = enemy.x + dx, y = enemy.y + dy;
                const range = Math.hypot(x - player.x, y - player.y);
                const candidate = {x: dx, y: dy, delta: Math.round(Math.hypot(dx, dy) * 2) / 2};
                if (range < Math.max(2, distance) || range > 6
                    || !KinkyDungeonEnemyCanMove(enemy, candidate, AIData.MovableTiles, AIData.AvoidTiles, AIData.ignoreLocks, 0)
                    || !KinkyDungeonCheckPath(x, y, player.x, player.y, false, false)) continue;
                const next = separation(x, y);
                if (next > score) { score = next; best = candidate; }
            }
            return best;
        };
    }

    api.registerModConfig();
    api.registerModConfigText();
    api.registerEncounterEvents();

    if (typeof module != "undefined" && module.exports) {
        module.exports = {
            EncounterRules: api.EncounterRules,
            ReinforcementRules: api.ReinforcementRules,
        };
    }
})();
