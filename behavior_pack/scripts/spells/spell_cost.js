import { getSpellMpMultiplier } from "../classes/class_registry.js";
import { getScore, setScore } from "../data/class_utils.js";

export function getSpellMpCost(player, baseMpCost) {
    const baseCost = Math.max(0, Math.floor(baseMpCost));
    return Math.ceil(baseCost * getSpellMpMultiplier(player));
}

export function spendSpellMp(player, baseMpCost) {
    const cost = getSpellMpCost(player, baseMpCost);
    const mp = getScore(player, "mp");
    if (mp < cost) return { success: false, cost };

    setScore(player, "mp", mp - cost);
    return { success: true, cost };
}

export function refundSpellMp(player, cost) {
    setScore(
        player,
        "mp",
        getScore(player, "mp") + Math.max(0, cost)
    );
}
