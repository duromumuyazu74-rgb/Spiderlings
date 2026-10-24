"use strict";
/* global KDMapData, KDGameData, KDMovePlayer, KinkyDungeonGenNavMap, KDGetWorldMapLocation,
          KinkyDungeonInventoryAddWeapon, KDSetWeapon, KinkyDungeonAddRestraint,
          KinkyDungeonGetRestraintByName, KinkyDungeonAllRestraintDynamic, KDModSettings,
          Spiderlings, MiniGameKinkyDungeonLevel, KDPlayer, KDAddEvent, KDEventMapGeneric,
          KinkyDungeonUpdateStats, KinkyDungeonGetPlayerWeaponDamage, KinkyDungeonCanUseWeapon,
          KinkyDungeonMapGet, KinkyDungeonMovableTilesSmartEnemy, KDSendInput,
          KinkyDungeonFindSpell, KinkyDungeonGetManaCost, KinkyDungeonHasMana, KinkyDungeonState,
          KinkyDungeonStatStamina: writable, KinkyDungeonStatStaminaMax,
          KinkyDungeonStatWill: writable, KinkyDungeonStatWillMax,
          KinkyDungeonStatMana: writable, KinkyDungeonStatManaMax */

// Uses the same paid construction and controlled source map as compatibility/browser/prison.js.
async function prepareMaturePrison() {
    const { setup, spawn, turn, expect, save } = globalThis.normalAcceptance;
    setup("escape-mature-four-layer");
    KDMapData.GridWidth = 40;
    KDMapData.GridHeight = 30;
    KDMapData.Grid =
        Array.from({ length: 30 }, (_, y) =>
            Array.from({ length: 40 }, (_, x) => (x && y && x < 39 && y < 29 ? "0" : "1")).join(""),
        ).join("\n") + "\n";
    Object.assign(KDMapData, {
        Tiles: {},
        JailPoints: [],
        StartPosition: { x: 2, y: 2 },
        EndPosition: { x: 37, y: 27 },
        ShortcutPositions: {},
        UsedEntrances: {},
        PotentialEntrances: [],
        SpecialAreas: [],
    });
    KDMovePlayer(14, 10, false);
    KinkyDungeonGenNavMap();
    const slot = KDGetWorldMapLocation({ x: KDMapData.mapX, y: KDMapData.mapY });
    slot.main = "";
    slot.data[""] = KDMapData;
    const journey = KDGameData.JourneyMap[KDGameData.JourneyX + "," + KDGameData.JourneyY];
    Object.assign(journey, { RoomType: "", Checkpoint: "grv", type: "basic" });
    save();
    const settings = KDModSettings.Spiderlings;
    settings.spiderlingsMapPopulationCap = "25";
    settings.spiderlingsNestReinforcementCap = "8";
    settings.spiderlingsNestReinforcementInterval = "10";
    for (const name of ["Spinner", "Jumper", "WebCaster", "Tunneler", "Mage"])
        settings["spiderlingsNest" + name + "Weight"] = name === "Spinner" ? "1" : "0";
    const source = { room: KDGameData.RoomType, floor: MiniGameKinkyDungeonLevel };
    const entrance = spawn("NestEntrance", 16, 10, "Enemy");
    KinkyDungeonInventoryAddWeapon("Knife");
    KDSetWeapon("Knife");
    KinkyDungeonAddRestraint(KinkyDungeonGetRestraintByName("SpiderlingsWebbingCocoon"), 0, false, "");
    const cocoon = KinkyDungeonAllRestraintDynamic().find(({ item }) => item.name === "SpiderlingsWebbingCocoon").item;
    (cocoon.data ||= {}).SpiderlingsCocoonOuterWebs = { anchored: true, attemptAges: [] };
    expect(Spiderlings.Prison.enter({ entrance, mode: "captured" }), "Mature fixture admission failed.");
    const field = Spiderlings.SpinnerNativeField,
        topology = Spiderlings.SpinnerTopology,
        compositeId = Spiderlings.PrisonConstruction.COMPOSITE;
    let preparationTurns = 0;
    const closed = () => {
        const composite = field.compositeById(compositeId);
        return (
            composite?.layerIds.length >= 4 &&
            composite.layerIds.slice(0, 4).every((id) => topology.isLayerClosed(field.state().topology, id))
        );
    };
    while (!closed() && preparationTurns < 1500) {
        KinkyDungeonStatWill = KinkyDungeonStatWillMax;
        KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
        await turn();
        preparationTurns++;
        if (preparationTurns % 100 === 0) console.log(`Mature prison preparation: ${preparationTurns} turns`);
    }
    expect(closed(), "Four real chamber layers did not close within the preparation budget.");
    // A declared initial resource budget. No resources are restored during a route trial.
    KinkyDungeonStatWill = KinkyDungeonStatWillMax;
    KinkyDungeonStatStamina = KinkyDungeonStatStaminaMax;
    KinkyDungeonStatMana = KinkyDungeonStatManaMax;
    KinkyDungeonUpdateStats(0);
    KinkyDungeonGetPlayerWeaponDamage(KinkyDungeonCanUseWeapon());
    return {
        saved: save(),
        source,
        prisonRoom: KDGameData.RoomType,
        layoutVersion: KDMapData.SpiderlingsPrison.layoutVersion || 1,
        mapSize: { width: KDMapData.GridWidth, height: KDMapData.GridHeight },
        preparationTurns,
        layers: field.compositeById(compositeId).layerIds.length,
        entities: KDMapData.Entities.filter((actor) => actor.hp > 0).length,
        population: KDMapData.Entities.filter(
            (actor) =>
                actor.hp > 0 &&
                ["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"].includes(actor.Enemy.name),
        ).length,
        density: Spiderlings.SilkDensity.state().value,
        settings: { ...settings },
        interventions: [
            "Controlled ordinary source map and captured Cocoon admission; Knife supplied once.",
            "Same Spinner-only reinforcement weights, cap and interval as the native prison construction fixture.",
            "Will/stamina maintained during construction only; all four layers use real paid builder actions.",
            "Will/stamina/mana start full at the saved trial boundary; no route-time refill or enemy suppression.",
        ],
    };
}

async function runPrisonRoute({ source, prisonRoom, maxTurns, spell }) {
    const { frame } = globalThis.normalAcceptance;
    const field = Spiderlings.SpinnerNativeField;
    let turns = 0,
        stalls = 0;
    const trace = [],
        webHits = [];
    KDAddEvent(KDEventMapGeneric, "tickAfter", "SpiderlingsEscapeRoute", (_event, data) => {
        if (data.delta > 0) turns += data.delta;
    });
    KDAddEvent(KDEventMapGeneric, "afterDamageEnemy", "SpiderlingsEscapeRoute", (_event, data) => {
        if (data.enemy && field.isOwnedProxy(data.enemy) && data.dmgDealt > 0)
            webHits.push({ turns, x: data.enemy.x, y: data.enemy.y, damage: data.dmgDealt, spell: data.spell?.name });
    });
    const snapshot = () => ({
        turns,
        room: KDGameData.RoomType,
        floor: MiniGameKinkyDungeonLevel,
        x: KDPlayer().x,
        y: KDPlayer().y,
        stamina: KinkyDungeonStatStamina,
        will: KinkyDungeonStatWill,
        mana: KinkyDungeonStatMana,
        density: Spiderlings.SilkDensity.state().value,
        capture: Spiderlings.SpinnerCapture.state()?.phase,
        recovery: !!Spiderlings.SpinnerRecovery.state(),
        remaining: KinkyDungeonAllRestraintDynamic().map(({ item }) => item.name),
        gameState: KinkyDungeonState,
        ownedPrisonIdentity: !!KDGameData.SpiderlingsPrisonIdentity,
        closedLayers: (() => {
            const composite = field.compositeById(Spiderlings.PrisonConstruction.COMPOSITE);
            return (
                composite?.layerIds.filter((id) =>
                    Spiderlings.SpinnerTopology.isLayerClosed(field.state().topology, id),
                ).length || 0
            );
        })(),
    });
    const nextStep = (goal) => {
        const queue = [{ x: KDPlayer().x, y: KDPlayer().y, first: null }],
            visited = new Set([`${KDPlayer().x},${KDPlayer().y}`]);
        for (let index = 0; index < queue.length; index++) {
            const cell = queue[index];
            if (cell.x === goal.x && cell.y === goal.y) return cell.first;
            for (const [dx, dy] of [
                [1, 0],
                [0, -1],
                [0, 1],
                [-1, 0],
            ]) {
                const next = { x: cell.x + dx, y: cell.y + dy },
                    key = `${next.x},${next.y}`;
                if (
                    visited.has(key) ||
                    next.x < 1 ||
                    next.y < 1 ||
                    next.x >= KDMapData.GridWidth - 1 ||
                    next.y >= KDMapData.GridHeight - 1
                )
                    continue;
                if (
                    !KinkyDungeonMovableTilesSmartEnemy.includes(KinkyDungeonMapGet(next.x, next.y)) &&
                    !field.isSpiderlingsWebCell(next)
                )
                    continue;
                visited.add(key);
                queue.push({ ...next, first: cell.first || next });
            }
        }
        return null;
    };
    const move = (dx, dy) =>
        KDSendInput("move", {
            dir: { x: dx, y: dy, delta: 0 },
            delta: 1,
            AllowInteract: true,
            AutoDoor: false,
            AutoPass: true,
            sprint: false,
            SuppressSprint: false,
        });
    let outcome = "turn-budget";
    try {
        for (const goal of KDMapData.SpiderlingsPrison.routes?.upper || [
            { x: 18, y: 22 },
            { x: 18, y: 8 },
            { x: 46, y: 8 },
            { x: 51, y: 22 },
        ]) {
            while (KDGameData.RoomType === prisonRoom && turns < maxTurns && stalls < 12) {
                if (KDPlayer().x === goal.x && KDPlayer().y === goal.y) break;
                const next = nextStep(goal),
                    before = snapshot();
                let action, result;
                if (Spiderlings.SpinnerCapture.state()?.phase === "contest") {
                    action = "pull";
                    result = KDSendInput("spiderlingsSpinnerPull", {});
                } else if (!next) {
                    outcome = "no-route";
                    return { outcome, turns, trace, webHits, final: snapshot() };
                } else if (
                    spell &&
                    field.isSpiderlingsWebCell(next) &&
                    KinkyDungeonHasMana(KinkyDungeonGetManaCost(KinkyDungeonFindSpell(spell, true)))
                ) {
                    action = "cast";
                    result = KDSendInput("tryCastSpell", {
                        tx: next.x,
                        ty: next.y,
                        spellname: spell,
                        player: KDPlayer(),
                    });
                } else {
                    action = "move-or-attack";
                    result = move(Math.sign(next.x - KDPlayer().x), Math.sign(next.y - KDPlayer().y));
                }
                await frame();
                trace.push({ action, result, target: next, before, ...snapshot() });
                if (turns === before.turns) {
                    stalls++;
                    KDSendInput("tick", { delta: 1 });
                    await frame();
                    trace.push({ action: "blocked-rest", ...snapshot() });
                } else stalls = 0;
            }
            if (KDGameData.RoomType !== prisonRoom || turns >= maxTurns || stalls >= 12) break;
        }
        for (let n = 0; n < 3 && KDGameData.RoomType === prisonRoom && turns < maxTurns; n++) {
            move(0, 0);
            await frame();
            trace.push({ action: "exit", ...snapshot() });
        }
        if (
            KDGameData.RoomType === source.room &&
            MiniGameKinkyDungeonLevel === source.floor &&
            !KDGameData.SpiderlingsPrisonIdentity
        )
            outcome = "returned-to-source";
        else if (KDGameData.RoomType !== prisonRoom) outcome = "unexpected-map";
        else if (stalls >= 12) outcome = "blocked";
        return { outcome, turns, trace, webHits, final: snapshot() };
    } finally {
        delete KDEventMapGeneric.tickAfter.SpiderlingsEscapeRoute;
        delete KDEventMapGeneric.afterDamageEnemy.SpiderlingsEscapeRoute;
    }
}

module.exports = { prepareMaturePrison, runPrisonRoute };
