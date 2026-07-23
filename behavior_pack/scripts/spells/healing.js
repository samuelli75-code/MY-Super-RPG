import { system } from "@minecraft/server";
import {
    getScore,
    setScore
} from "../data/class_utils.js";
import { getHealingMultiplier } from "../classes/class_registry.js";
import { syncPlayerHealth } from "../systems/stats_system.js";
import { areFriendly } from "../systems/team_system.js";
import { reviveDownedPlayer } from "../systems/death_system.js";
import { getSpellCooldownTicks } from "./spell_cooldown.js";
import { spendSpellMp } from "./spell_cost.js";
import { recordHealingFeedback } from "../systems/combat_feedback.js";

const MP_COST = 5;
const BASE_HEAL = 5;
const COOLDOWN_TICKS = 40;
const TARGET_RANGE = 8;

const cooldownUntil = new Map();

function getRemainingCooldown(player) {
    return Math.max(0, (cooldownUntil.get(player.id) ?? 0) - system.currentTick);
}

export const HEALING_SPELL = {
    id: "healing",
    name: "Healing",
    mpCost: MP_COST,
    cooldownTicks: COOLDOWN_TICKS,
    castDirect: castHealing
};

function getHealAmount(player) {
    return Math.ceil(BASE_HEAL * getHealingMultiplier(player));
}

function getNativeHealth(entity) {
    try {
        const health = entity.getComponent("minecraft:health");
        if (!health) return undefined;
        return {
            current: health.currentValue,
            maximum: health.effectiveMax ?? health.defaultValue ?? health.currentValue,
            component: health
        };
    } catch {
        return undefined;
    }
}

function getHealthRatio(entity) {
    if (entity.typeId === "minecraft:player") {
        return getScore(entity, "hp") / Math.max(1, getScore(entity, "max_hp"));
    }

    const health = getNativeHealth(entity);
    return health ? health.current / Math.max(1, health.maximum) : 1;
}

function findHealingTarget(caster, preferredTarget) {
    if (
        preferredTarget &&
        areFriendly(caster, preferredTarget) &&
        getHealthRatio(preferredTarget) < 1
    ) {
        return preferredTarget;
    }

    const candidates = caster.dimension.getEntities({
        location: caster.location,
        maxDistance: TARGET_RANGE
    }).filter((target) =>
        target.id === caster.id || areFriendly(caster, target)
    );

    let selected = caster;
    let lowestRatio = 1;

    for (const target of candidates) {
        const ratio = getHealthRatio(target);

        if (ratio < lowestRatio) {
            selected = target;
            lowestRatio = ratio;
        }
    }

    return selected;
}

export function castHealing(caster, preferredTarget) {
    const remaining = getRemainingCooldown(caster);
    if (remaining > 0) {
        caster.sendMessage(`\u00a77Healing cooldown: ${(remaining / 20).toFixed(1)}s`);
        return false;
    }

    const mpResult = spendSpellMp(caster, MP_COST);
    if (!mpResult.success) {
        caster.sendMessage(`\u00a7cNot enough MP. Need ${mpResult.cost} MP.`);
        return false;
    }

    const target = findHealingTarget(caster, preferredTarget);
    const healAmount = getHealAmount(caster);
    let healed = 0;

    if (target.typeId === "minecraft:player") {
        const hp = getScore(target, "hp");
        const maxHp = getScore(target, "max_hp");
        const nextHp = Math.min(maxHp, hp + healAmount);
        healed = nextHp - hp;
        if (healed > 0) {
            setScore(target, "hp", nextHp);
            syncPlayerHealth(target);
            reviveDownedPlayer(target, caster);
        }
    } else {
        const health = getNativeHealth(target);
        if (health) {
            const nextHp = Math.min(health.maximum, health.current + healAmount);
            healed = nextHp - health.current;
            if (healed > 0) health.component.setCurrentValue(nextHp);
        }
    }

    if (healed <= 0) {
        setScore(caster, "mp", getScore(caster, "mp") + mpResult.cost);
        caster.sendMessage("\u00a7eNo injured ally nearby.");
        return false;
    }

    cooldownUntil.set(
        caster.id,
        system.currentTick + getSpellCooldownTicks(caster, COOLDOWN_TICKS)
    );
    recordHealingFeedback(caster, target, healed);

    try {
        target.addEffect("regeneration", 40, {
            amplifier: 0,
            showParticles: true
        });
        target.dimension.spawnParticle("minecraft:totem_particle", {
            x: target.location.x,
            y: target.location.y + 1,
            z: target.location.z
        });
        caster.playSound("random.levelup", { pitch: 1.5, volume: 0.7 });
    } catch {}

    const targetName = target.name ?? target.typeId.replace("minecraft:", "");
    caster.sendMessage(`\u00a7aHealed ${targetName} for ${healed} HP.`);
    if (target.typeId === "minecraft:player" && target.id !== caster.id) {
        target.sendMessage(`\u00a7a${caster.name} healed you for ${healed} HP.`);
    }

    return true;
}
