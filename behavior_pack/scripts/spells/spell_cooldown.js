import {
    getSpellCooldownMultiplier
} from "../classes/class_registry.js";

export function getSpellCooldownTicks(player, baseCooldownTicks) {
    const baseTicks = Math.max(1, Math.floor(baseCooldownTicks));
    return Math.max(
        1,
        Math.ceil(baseTicks * getSpellCooldownMultiplier(player))
    );
}
