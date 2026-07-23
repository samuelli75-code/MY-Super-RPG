import { system } from "@minecraft/server";
import { getSpellCooldownTicks } from "./spell_cooldown.js";
import { refundSpellMp, spendSpellMp } from "./spell_cost.js";

const cooldownUntil = new Map();

function getKey(player, spellId) {
    return `${player.id}:${spellId}`;
}

export function getRemainingSpellCooldown(player, spellId) {
    return Math.max(0, (cooldownUntil.get(getKey(player, spellId)) ?? 0) - system.currentTick);
}

export function castWithCostAndCooldown(player, spell) {
    const remaining = getRemainingSpellCooldown(player, spell.id);
    if (remaining > 0) {
        player.sendMessage(`\u00a77${spell.name} cooldown: ${(remaining / 20).toFixed(1)}s`);
        return false;
    }

    const mpResult = spendSpellMp(player, spell.mpCost);
    if (!mpResult.success) {
        player.sendMessage(`\u00a7cNot enough MP. Need ${mpResult.cost} MP.`);
        return false;
    }

    try {
        spell.onCast(player);
        cooldownUntil.set(
            getKey(player, spell.id),
            system.currentTick + getSpellCooldownTicks(player, spell.cooldownTicks)
        );
        player.sendMessage(`\u00a7b${spell.name}!`);
        return true;
    } catch (error) {
        refundSpellMp(player, mpResult.cost);
        player.sendMessage(`\u00a7c${spell.name} failed.`);
        console.warn(`[${spell.name}] Cast failed: ${error}`);
        return false;
    }
}
