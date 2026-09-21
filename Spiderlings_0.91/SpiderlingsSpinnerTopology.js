"use strict";

// JSON-only Spinner interception-line rules. Native entities are projections owned by the field adapter.
(() => {
    const api = globalThis.Spiderlings,
        VERSION = 1,
        ANCHOR_HP = 2,
        OWNERLESS_TURNS = 20;
    const clone = (value) => JSON.parse(JSON.stringify(value));
    const key = (cell) => `${cell.x},${cell.y}`;
    const sameCell = (a, b) => a.x === b.x && a.y === b.y;
    const unique = (values) => Array.from(new Set(values));

    function cellsBetween(a, b) {
        if (a.x !== b.x && a.y !== b.y) throw new Error("Spinner lines must be axis-aligned.");
        const result = [],
            dx = Math.sign(b.x - a.x),
            dy = Math.sign(b.y - a.y),
            length = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
        for (let i = 1; i < length; i++) result.push({ x: a.x + dx * i, y: a.y + dy * i });
        return result;
    }

    function createLine(input) {
        if (!input?.fieldId || !Array.isArray(input.owners) || input.owners.length === 0)
            throw new Error("A Spinner line needs a field ID and at least one owner.");
        if (!Array.isArray(input.anchors) || input.anchors.length !== 2)
            throw new Error("A Spinner interception line needs exactly two anchors.");
        const anchors = input.anchors.map((anchor, index) => ({
                id: anchor.id || `${input.fieldId}:anchor:${index}`,
                x: anchor.x,
                y: anchor.y,
                hp: ANCHOR_HP,
                maxHp: ANCHOR_HP,
                owners: [input.fieldId],
                built: false,
                snaredTargetIds: [],
            })),
            plannedCells = cellsBetween(anchors[0], anchors[1]),
            occupiedCellCount = plannedCells.length + 2;
        return {
            version: VERSION,
            fieldId: input.fieldId,
            owners: unique(input.owners),
            ownerlessAge: 0,
            collapsed: false,
            anchors,
            links: [
                {
                    id: `${input.fieldId}:link:0`,
                    a: anchors[0].id,
                    b: anchors[1].id,
                    owners: [input.fieldId],
                    hp: 2 + 0.5 * (occupiedCellCount - 1),
                    maxHp: 2 + 0.5 * (occupiedCellCount - 1),
                    plannedCells,
                    builtCells: [],
                    connected: false,
                },
            ],
        };
    }

    function solidCells(state) {
        if (!state || state.collapsed) return [];
        const cells = new Map();
        for (const anchor of state.anchors)
            if (anchor.built && anchor.hp > 0)
                cells.set(key(anchor), { x: anchor.x, y: anchor.y, anchorIds: [anchor.id], linkIds: [] });
        for (const link of state.links) {
            if (!(link.hp > 0)) continue;
            for (const cell of link.builtCells) {
                const current = cells.get(key(cell)) || { x: cell.x, y: cell.y, anchorIds: [], linkIds: [] };
                current.linkIds = unique([...current.linkIds, link.id]);
                cells.set(key(cell), current);
            }
            if (link.connected) {
                for (const anchorId of [link.a, link.b]) {
                    const anchor = state.anchors.find((candidate) => candidate.id === anchorId);
                    if (!anchor?.built || !(anchor.hp > 0)) continue;
                    const current = cells.get(key(anchor));
                    current.linkIds = unique([...current.linkIds, link.id]);
                }
            }
        }
        return Array.from(cells.values()).sort((a, b) => a.y - b.y || a.x - b.x);
    }

    function validateCell(snapshot, cell) {
        if (!snapshot?.inBounds || !snapshot?.floor) return "terrain";
        if (snapshot.protected) return "protected";
        if (snapshot.occupied) return "occupied";
        if (snapshot.cell && !sameCell(snapshot.cell, cell)) return "snapshot";
        return "";
    }

    function legalAction(state, action, snapshot) {
        if (!state || state.collapsed) return { legal: false, reason: "collapsed" };
        if (!state.owners.includes(action?.ownerId)) return { legal: false, reason: "owner" };
        if (action.type === "placeAnchor") {
            const anchor = state.anchors.find((candidate) => candidate.id === action.anchorId);
            if (!anchor || anchor.built || anchor.hp <= 0) return { legal: false, reason: "anchor" };
            const reason = validateCell(snapshot, anchor);
            return { legal: !reason, reason };
        }
        if (action.type === "extendLink") {
            const link = state.links.find((candidate) => candidate.id === action.linkId);
            if (!link || link.connected || link.hp <= 0) return { legal: false, reason: "link" };
            const a = state.anchors.find((candidate) => candidate.id === link.a),
                b = state.anchors.find((candidate) => candidate.id === link.b);
            if (!a?.built || !b?.built) return { legal: false, reason: "anchors" };
            const next = link.plannedCells[link.builtCells.length];
            if (next) {
                if (!sameCell(next, action.cell || next)) return { legal: false, reason: "order" };
                const reason = validateCell(snapshot, next);
                return { legal: !reason, reason };
            }
            return { legal: true, reason: "" };
        }
        return { legal: false, reason: "action" };
    }

    function applyAction(state, action, snapshot) {
        const verdict = legalAction(state, action, snapshot);
        if (!verdict.legal) return { state: clone(state), effects: [], outcome: verdict };
        const next = clone(state),
            effects = [];
        if (action.type === "placeAnchor") {
            const anchor = next.anchors.find((candidate) => candidate.id === action.anchorId);
            anchor.built = true;
            effects.push({ type: "placeProxy", cell: { x: anchor.x, y: anchor.y } });
        } else {
            const link = next.links.find((candidate) => candidate.id === action.linkId),
                cell = link.plannedCells[link.builtCells.length];
            if (cell) {
                link.builtCells.push(cell);
                effects.push({ type: "placeProxy", cell });
            }
            if (link.builtCells.length === link.plannedCells.length) link.connected = true;
        }
        effects.push({ type: "invalidateNavigation" });
        return { state: next, effects, outcome: { legal: true, reason: "" } };
    }

    function distanceToAnchor(state, link, cell) {
        const path = [
                state.anchors.find((anchor) => anchor.id === link.a),
                ...link.plannedCells,
                state.anchors.find((anchor) => anchor.id === link.b),
            ],
            index = path.findIndex((candidate) => sameCell(candidate, cell));
        if (index < 0) return Infinity;
        const anchors = path
            .map((candidate, candidateIndex) => ({ candidate, candidateIndex }))
            .filter(({ candidate }) =>
                state.anchors.some((anchor) => anchor.built && anchor.hp > 0 && sameCell(anchor, candidate)),
            );
        return Math.min(...anchors.map(({ candidateIndex }) => Math.abs(candidateIndex - index)));
    }

    function damageAt(state, hit) {
        const next = clone(state),
            amount = Math.max(0, Number(hit?.damage) || 0),
            cell = hit?.cell,
            effects = [];
        if (!cell || amount <= 0 || next.collapsed) return { state: next, effects, outcome: { damage: 0 } };
        const anchor = next.anchors.find(
                (candidate) => candidate.built && candidate.hp > 0 && sameCell(candidate, cell),
            ),
            damagedLinks = new Set();
        let applied = 0;
        if (anchor) {
            const dealt = Math.min(anchor.hp, amount);
            anchor.hp = Math.max(0, anchor.hp - amount);
            applied += dealt;
            for (const link of next.links.filter(
                (candidate) => candidate.hp > 0 && [candidate.a, candidate.b].includes(anchor.id),
            )) {
                const linkDamage = Math.min(link.hp, amount);
                link.hp = Math.max(0, link.hp - amount);
                applied += linkDamage;
                damagedLinks.add(link.id);
            }
            if (anchor.hp <= 0)
                for (const link of next.links.filter((candidate) => [candidate.a, candidate.b].includes(anchor.id)))
                    link.hp = 0;
        } else {
            for (const link of next.links.filter(
                (candidate) =>
                    candidate.hp > 0 && candidate.builtCells.some((candidateCell) => sameCell(candidateCell, cell)),
            )) {
                const multiplier = Math.max(0.25, 1 - 0.15 * distanceToAnchor(next, link, cell)),
                    linkDamage = amount * multiplier;
                applied += Math.min(link.hp, linkDamage);
                link.hp = Math.max(0, link.hp - linkDamage);
                damagedLinks.add(link.id);
            }
        }
        if (anchor || damagedLinks.size) effects.push({ type: "synchronizeProxies" }, { type: "invalidateNavigation" });
        return { state: next, effects, outcome: { damage: applied, anchorId: anchor?.id, linkIds: [...damagedLinks] } };
    }

    function consumeSnare(state, targetId, cell) {
        const next = clone(state),
            anchor = next.anchors.find((candidate) => candidate.built && candidate.hp > 0 && sameCell(candidate, cell));
        if (!anchor || anchor.snaredTargetIds.includes(targetId))
            return { state: next, effects: [], outcome: { snared: false } };
        anchor.snaredTargetIds.push(targetId);
        return {
            state: next,
            effects: [{ type: "snareTarget", targetId, anchorId: anchor.id }],
            outcome: { snared: true },
        };
    }

    function tickOwnerless(state, input) {
        const next = clone(state),
            active = new Set(input?.activeOwnerIds || []),
            hasOwner = next.owners.some((ownerId) => active.has(ownerId));
        if (hasOwner) next.ownerlessAge = 0;
        else if ((input?.delta || 0) > 0) next.ownerlessAge += input.delta;
        const effects = [];
        if (!next.collapsed && next.ownerlessAge >= OWNERLESS_TURNS) {
            next.collapsed = true;
            for (const anchor of next.anchors) anchor.hp = 0;
            for (const link of next.links) link.hp = 0;
            effects.push({ type: "fieldRetired" }, { type: "invalidateNavigation" });
        }
        return { state: next, effects, outcome: { collapsed: next.collapsed, ownerlessAge: next.ownerlessAge } };
    }

    function inspect(state) {
        const snapshot = clone(state);
        snapshot.solidCells = solidCells(snapshot);
        return snapshot;
    }

    api.SpinnerTopology = {
        VERSION,
        ANCHOR_HP,
        OWNERLESS_TURNS,
        createLine,
        legalAction,
        applyAction,
        damageAt,
        consumeSnare,
        tickOwnerless,
        inspect,
        solidCells,
    };
})();
