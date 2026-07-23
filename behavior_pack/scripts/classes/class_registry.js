import {
    getClassLevel,
    getPlayerClassKey
} from "../data/class_utils.js";
import {
    ARMOR_SLOTS,
    HEAVY_ARMOR_HELMETS,
    HEAVY_ARMOR_MATERIALS,
    LIGHT_ARMOR_MATERIALS
} from "../data/armor_data.js";
import { ARCHER_RULES } from "./archer.js";
import { MAGE_RULES } from "./mage.js";
import { NO_CLASS_RULES } from "./noclass.js";
import { PRIEST_RULES } from "./priest.js";
import { WARRIOR_RULES } from "./warrior.js";

const CLASS_RULES = {
    noclass: NO_CLASS_RULES,
    warrior: WARRIOR_RULES,
    mage: MAGE_RULES,
    priest: PRIEST_RULES,
    archer: ARCHER_RULES
};

export function getArmorWeight(player) {
    let equippable;
    try {
        equippable = player.getComponent("minecraft:equippable");
    } catch {
        return "none";
    }
    if (!equippable) return "none";

    let hasLightArmor = false;

    for (const slot of ARMOR_SLOTS) {
        let typeId = "";
        try {
            typeId = equippable.getEquipment(slot)?.typeId ?? "";
        } catch {}

        if (
            HEAVY_ARMOR_HELMETS.includes(typeId) ||
            HEAVY_ARMOR_MATERIALS.some((material) =>
                typeId.startsWith(`minecraft:${material}_`)
            )
        ) {
            return "heavy";
        }

        if (
            LIGHT_ARMOR_MATERIALS.some((material) =>
                typeId.startsWith(`minecraft:${material}_`)
            )
        ) {
            hasLightArmor = true;
        }
    }

    return hasLightArmor ? "light" : "none";
}

export function getClassContext(player, extra = {}) {
    const classKey = getPlayerClassKey(player);
    const rules = CLASS_RULES[classKey] ?? NO_CLASS_RULES;

    return {
        player,
        classKey,
        level: getClassLevel(player, classKey),
        armorWeight: getArmorWeight(player),
        rules,
        ...extra
    };
}

export function getMovementMultiplier(player) {
    const context = getClassContext(player);
    return context.rules.getMovementMultiplier(context);
}

export function getSpellMpMultiplier(player) {
    const context = getClassContext(player);
    return context.rules.getSpellMpMultiplier(context);
}

export function getSpellCooldownMultiplier(player) {
    const context = getClassContext(player);
    return context.rules.getSpellCooldownMultiplier(context);
}

export function getHealingMultiplier(player) {
    const context = getClassContext(player);
    return context.rules.getHealingMultiplier(context);
}

export function getBlessingDurationMultiplier(player) {
    const context = getClassContext(player);
    return context.rules.getBlessingDurationMultiplier?.(context) ?? 1;
}

export function getProjectileDamageMultiplier(player) {
    const context = getClassContext(player);
    return context.rules.getProjectileDamageMultiplier(context);
}

export function modifyIncomingCombatDamage(player, damage, source) {
    const context = getClassContext(player, {
        damage: Math.max(1, Math.ceil(damage)),
        source,
        blocked: false
    });

    return context.rules.modifyIncomingCombatDamage(context);
}
