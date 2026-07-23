import { system } from "@minecraft/server";
import { getScore } from "../data/class_utils.js";

const FEEDBACK_DURATION_TICKS = 60;
const recentDamage = new Map();
const recentHealing = new Map();

function pruneFeedback(map, playerId) {
    const feedback = map.get(playerId);
    if (!feedback) return undefined;

    if (feedback.expiresTick < system.currentTick) {
        map.delete(playerId);
        return undefined;
    }

    return feedback;
}

export function recordCombatFeedback(attacker, target, damage) {
    if (attacker?.typeId !== "minecraft:player" || !target) return;

    recentDamage.set(attacker.id, {
        target,
        type: "damage",
        damage: Math.max(0, Math.round(damage * 10) / 10),
        expiresTick: system.currentTick + FEEDBACK_DURATION_TICKS
    });
}

export function recordHealingFeedback(caster, target, healing) {
    if (caster?.typeId !== "minecraft:player" || !target) return;

    recentHealing.set(caster.id, {
        target,
        type: "healing",
        healing: Math.max(0, Math.round(healing * 10) / 10),
        expiresTick: system.currentTick + FEEDBACK_DURATION_TICKS
    });
}

export function getRecentDamageFeedback(player) {
    return pruneFeedback(recentDamage, player.id);
}

export function getRecentHealingFeedback(player) {
    return pruneFeedback(recentHealing, player.id);
}

/** @deprecated Prefer getRecentDamageFeedback / getRecentHealingFeedback */
export function getRecentCombatFeedback(player) {
    return getRecentDamageFeedback(player) ?? getRecentHealingFeedback(player);
}

export function getEntityHealth(entity) {
    if (!entity) return undefined;

    if (entity.typeId === "minecraft:player") {
        return {
            current: getScore(entity, "hp"),
            maximum: getScore(entity, "max_hp")
        };
    }

    try {
        const health = entity.getComponent("minecraft:health");
        if (!health) return undefined;

        return {
            current: Math.max(0, health.currentValue),
            maximum: health.effectiveMax ?? health.defaultValue ?? health.currentValue
        };
    } catch {
        return undefined;
    }
}
