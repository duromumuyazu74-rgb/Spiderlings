"use strict";

// A field keeps its prey identity after temporary capture/transport ends.
// The native tether and combat controllers still own physical execution.
(() => {
    const api = globalThis.Spiderlings;
    const mobile = new Set(["Spinner", "Jumper", "WebCaster", "Tunneler", "MageSpiderlings"]);
    const same = (a, b) => a !== undefined && b !== undefined && String(a) === String(b);
    const encounter = () => api.SpinnerNativeField?.state?.();
    const player = () => KinkyDungeonPlayerEntity;
    const actors = () => KDMapData.Entities || [];
    const bag = () =>
        KinkyDungeonAllRestraintDynamic().find((e) => e.item.name === "SpiderlingsSpinnerLegbinder")?.item;
    const temporary = () => api.SpinnerCapture?.state?.();
    const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

    function record() {
        const saved = encounter()?.custody;
        if (!saved || !api.SpinnerNativeField.compositeById(saved.compositeId)) return undefined;
        if (same(temporary()?.admittedCompositeId, saved.compositeId)) return saved;
        return saved.bagId !== undefined && same(bag()?.id, saved.bagId) ? saved : undefined;
    }

    function capture(compositeId, bagId) {
        const field = api.SpinnerNativeField?.compositeById?.(compositeId),
            e = encounter();
        if (!field || !e) return false;
        const groupId =
            field.groupId ||
            Object.values(e.ai?.groups || {}).find((g) => same(e.ai.plans[g.planId]?.compositeId, compositeId))?.id;
        if (!groupId) return false;
        const previous = record();
        e.custody = {
            version: 1,
            compositeId,
            groupId,
            targetId: player().id,
            bagId: bagId ?? (same(previous?.compositeId, compositeId) ? previous.bagId : undefined),
            capturedTurn: previous?.capturedTurn ?? KinkyDungeonCurrentTick,
            defenders: [],
            contacts: [],
        };
        return true;
    }

    function observe() {
        const e = encounter();
        if (!e) return;
        const active = temporary(),
            item = bag();
        if (active?.admittedCompositeId && !record()) capture(active.admittedCompositeId, active.itemId);
        if (record() && item && active && same(active.admittedCompositeId, e.custody.compositeId))
            e.custody.bagId = item.id;
        // Old saves have an attributed departure or an active recovery, not a
        // durable custody record. A manually equipped bag is insufficient.
        if (!record()) {
            const prior = api.SpinnerRecovery?.state?.() || api.SpinnerRecovery?.departure?.();
            if (item && same(prior?.legBagId, item.id)) capture(prior.compositeId, item.id);
        }
        if (e.custody && !record()) delete e.custody;
    }

    function eligible(actor) {
        return !!(
            actor?.hp > 0 &&
            mobile.has(actor.Enemy?.name) &&
            !actor.Enemy.immobile &&
            KDHostile(actor) &&
            !KDAllied(actor) &&
            !KDIsInParty(actor) &&
            !KDIsImprisoned(actor) &&
            !KDHelpless(actor) &&
            !KinkyDungeonIsDisabled(actor) &&
            (actor.Enemy.name !== "Spinner" || !(actor.disarm > 0)) &&
            !api.JumperDash?.runtimeController?.snapshot?.().some((entry) => same(entry.sourceId, actor.id)) &&
            ![actor.stun, actor.freeze, actor.channel, actor.teleporting].some((v) => v > 0) &&
            actor.SpiderlingsTaskNestDefenderTarget === undefined
        );
    }

    function competitor() {
        if (!record() || !player().leash || player().leash.reason === "SpiderlingsRecovery") return undefined;
        return actors().find(
            (actor) =>
                same(actor.id, player().leash.entity) &&
                actor.hp > 0 &&
                !actor.player &&
                !actor.Enemy?.tags?.spiderlings &&
                !actor.Enemy?.tags?.scenery &&
                !KDIsImprisoned(actor),
        );
    }

    function perceives(actor, target) {
        return (
            KDCanDetect(actor, target) &&
            KinkyDungeonCheckLOS(
                actor,
                target,
                Math.hypot(actor.x - target.x, actor.y - target.y),
                KDEnemyVisionRadius(actor),
                true,
                true,
            )
        );
    }

    function prepare() {
        observe();
        const saved = record();
        if (!saved) return;
        api.FieldCommand?.adoptCustodyCrew?.(encounter(), saved.groupId);
        const center = api.SpinnerNativeField.commonCore(saved.compositeId),
            threat = competitor();
        const available = actors().filter(
            (actor) =>
                eligible(actor) &&
                !api.FieldCommand?.sourceRole(actor) &&
                (!center || distance(actor, center) <= 10) &&
                (actor.Enemy.name !== "Spinner" || encounter().command?.members[actor.id]?.commander === saved.groupId),
        );
        const choose = (candidates, previous, target, priority = () => 0) =>
            candidates
                .sort(
                    (a, b) =>
                        priority(a) - priority(b) ||
                        Number(previous.some((id) => same(id, b.id))) - Number(previous.some((id) => same(id, a.id))) ||
                        distance(a, target) - distance(b, target) ||
                        String(a.id).localeCompare(String(b.id)),
                )
                .slice(0, 2)
                .map((actor) => actor.id);
        saved.defenders = threat
            ? choose(
                  available.filter((a) => a.Enemy.name !== "Tunneler" && perceives(a, threat)),
                  saved.defenders || [],
                  threat,
              )
            : [];
        const contacts =
            !threat && api.SpinnerRecovery?.requested?.()
                ? available
                      .filter((actor) => actor.Enemy.name === "Spinner" && perceives(actor, player()))
                      .map((actor) => ({ actor, approach: api.SpinnerAI.attackApproach(actor, player()) }))
                      .filter((entry) => entry.approach.path.length)
                : [];
        saved.contacts =
            !threat &&
            center &&
            !same(temporary()?.admittedCompositeId, saved.compositeId) &&
            api.SpinnerRecovery?.requested?.()
                ? choose(
                      contacts.map((entry) => entry.actor),
                      saved.contacts || [],
                      player(),
                      (actor) => (contacts.find((entry) => entry.actor === actor).approach.ready ? 0 : 1),
                  )
                : [];
        const sources = Object.keys(api.SpinnerRecovery?.state?.()?.sources || {}).length;
        saved.contacts = saved.contacts.slice(0, Math.max(0, 2 - sources));
        saved.status = threat ? "contested" : sources || saved.contacts.length ? "recovering" : "held";
    }

    function targetFor(actor) {
        const saved = record(),
            target = competitor();
        if (
            !saved ||
            !target ||
            !saved.defenders?.some((id) => same(id, actor?.id)) ||
            !eligible(actor) ||
            api.FieldCommand?.sourceRole(actor) ||
            !perceives(actor, target)
        )
            return undefined;
        return target;
    }

    function permitsRecovery(actor) {
        const saved = record();
        if (!saved) return undefined;
        if (competitor() || !api.SpinnerRecovery?.requested?.()) return false;
        const recovery = api.SpinnerRecovery?.state?.();
        return (
            Object.values(recovery?.sources || {}).some((s) => same(s.id, actor?.id)) ||
            !!saved.contacts?.some((id) => same(id, actor?.id))
        );
    }

    api.FieldCustody = Object.freeze({
        capture,
        observe,
        prepare,
        targetFor,
        permitsRecovery,
        state: () => {
            const saved = record();
            return saved && JSON.parse(JSON.stringify(saved));
        },
        ownsField: (id) => same(record()?.compositeId, id),
        ownsGroup: (id) => same(record()?.groupId, id),
        assigned: (actor) => !!record() && (record().contacts?.some((id) => same(id, actor?.id)) || !!targetFor(actor)),
        interceptionPair: (left, right) => !!right && (targetFor(left) === right || targetFor(right) === left),
    });
})();
