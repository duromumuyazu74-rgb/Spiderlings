"use strict";

// Keep grouped fixture equipment behind the native category/name inventory boundary.
function createEquipmentInventory(equipment) {
    const restraints = {
        get(name) {
            return [...equipment.values()].find((item) => item.name === name);
        },
        delete(name) {
            for (const [group, item] of equipment) if (item.name === name) return equipment.delete(group);
            return false;
        },
        set(_name, item) {
            equipment.set(item.group || item.restraint.Group, item);
            return this;
        },
    };
    return new Map([["Restraint", restraints]]);
}

module.exports = { createEquipmentInventory };
