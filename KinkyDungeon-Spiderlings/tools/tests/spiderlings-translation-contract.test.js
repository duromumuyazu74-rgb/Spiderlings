"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { placeholderMultiset, inspectTranslationPlaceholders } = require("../translation-contract.js");

test("a translated status cannot drop, rename or duplicate a registered placeholder", () => {
    const english = { Status: "Field {phase}: {count}/4, {links}/4" };
    for (const value of [
        "Field {phase}: 4, {links}/4",
        "Field {phase}: {total}/4, {links}/4",
        "{phase} {count} {count} {links}",
    ]) {
        const errors = inspectTranslationPlaceholders(english, { CN: new Map([["Status", value]]) });
        assert.equal(errors.length, 1);
        assert.match(errors[0], /CN Status: placeholder mismatch/);
    }
    assert.deepEqual(
        inspectTranslationPlaceholders(english, { CN: new Map([["Status", "{links}/4 · {count}/4 · {phase}"]]) }),
        [],
    );
});

test("native placeholders preserve multiplicity without locking translated wording", () => {
    const english = {
        Complete: "The last marked nest is destroyed. (TARGET/TARGET)",
        Attack: "Silk binds you. (+RestraintAdded) (DamageDealt)",
        Covered: "TargetLv1 is beneath TargetLv2; work on TargetRestraint.",
        Count: "CURRENT/TARGET",
    };
    const locale = new Map([
        ["Complete", "全部目标已完成。（TARGET/TARGET）"],
        ["Attack", "(DamageDealt) 束缚增加 (+RestraintAdded)"],
        ["Covered", "TargetRestraint：TargetLv2 覆盖 TargetLv1"],
        ["Count", "CURRENT/TARGET"],
    ]);
    assert.deepEqual(inspectTranslationPlaceholders(english, { CN: locale }), []);
    locale.set("Complete", "全部目标已完成。（TARGET）");
    assert.match(inspectTranslationPlaceholders(english, { CN: locale })[0], /CN Complete: placeholder mismatch/);
    assert.deepEqual(placeholderMultiset("CURRENTLY a TARGETING example"), []);
});

test("registered text cannot disappear or acquire an unexpected placeholder", () => {
    assert.match(inspectTranslationPlaceholders({ Label: "Silk" }, { JP: new Map() })[0], /missing registered text/);
    assert.match(
        inspectTranslationPlaceholders({ Label: "Silk" }, { JP: new Map([["Label", "糸 {count}"]]) })[0],
        /placeholder mismatch/,
    );
});
