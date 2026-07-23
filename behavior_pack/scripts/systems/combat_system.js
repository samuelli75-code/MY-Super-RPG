import { system, world } from "@minecraft/server";
import {
    getProjectileDamageMultiplier,
    modifyIncomingCombatDamage
} from "../classes/class_registry.js";
import { getScore, setScore } from "../data/class_utils.js";
import { isPlayerDowned } from "./death_system.js";
import {
    fillNativeHealth,
    getMeleeDamage,
    getVanillaMeleeReferenceDamage,
    getWeaponDamage,
    syncPlayerHealth
} from "./stats_system.js";
import { areFriendly } from "./team_system.js";
import { recordCombatFeedback } from "./combat_feedback.js";
import { recordCombatCredit } from "./combat_credit.js";
import { isSpellProjectile } from "../spells/spell_projectile.js";
import {
    getPurpleGolemAttackDamage,
    isPurpleGolem,
    scaleMobIncomingDamage
} from "./mob_resistances.js";

function restoreFriendlyDamage(entity, amount) {
    if (entity.typeId === "minecraft:player") {
        fillNativeHealth(entity);
        return;
    }

    try {
        const health = entity.getComponent("minecraft:health");
        if (!health || typeof health.setCurrentValue !== "function") return;

        const maximum =
            health.effectiveMax ?? health.defaultValue ?? 20;
        health.setCurrentValue(
            Math.min(maximum, health.currentValue + amount)
        );
    } catch {}
}

function getArmorMultiplier(event, vanillaReferenceDamage) {
    return Math.max(
        0,
        Math.min(1, event.damage / Math.max(1, vanillaReferenceDamage))
    );
}

function getPlayerMeleeDamageAfterArmor(event, attacker) {
    return Math.max(
        1,
        Math.ceil(
            getMeleeDamage(attacker) *
            getArmorMultiplier(
                event,
                getVanillaMeleeReferenceDamage(attacker)
            )
        )
    );
}

function getProjectileDamage(event, attacker) {
    return Math.max(
        1,
        Math.ceil(
            event.damage * getProjectileDamageMultiplier(attacker)
        )
    );
}

function isExplosionCause(cause) {
    return cause === "entityExplosion" || cause === "blockExplosion";
}

function isMeleeCause(cause) {
    return cause === "entityAttack" || cause === "maceSmash" || cause === "ramAttack";
}

function setEntityDamageFromVanillaEvent(entity, event, desiredDamage) {
    try {
        const health = entity.getComponent("minecraft:health");
        if (!health || typeof health.setCurrentValue !== "function") return 0;

        const maximum =
            health.effectiveMax ?? health.defaultValue ?? 20;
        const healthBeforeHit = health.currentValue + event.damage;
        const actualDamage = Math.min(healthBeforeHit, desiredDamage);

        health.setCurrentValue(
            Math.max(
                0,
                Math.min(maximum, healthBeforeHit - actualDamage)
            )
        );
        return actualDamage;
    } catch {
        return 0;
    }
}

function applyPlayerHpDamage(player, damage, attacker) {
    const currentHp = getScore(player, "hp");
    const actualDamage = Math.min(currentHp, Math.max(1, damage));

    setScore(player, "hp", Math.max(0, currentHp - actualDamage));
    if (attacker?.typeId === "minecraft:player") {
        recordCombatFeedback(attacker, player, actualDamage);
    }
    system.run(() => syncPlayerHealth(player));
    return actualDamage;
}

export function dealCustomPlayerDamage(player, amount, attacker, cause = "magic") {
    if (attacker && areFriendly(attacker, player)) return 0;
    if (isPlayerDowned(player)) return 0;

    const result = modifyIncomingCombatDamage(
        player,
        amount,
        { attacker, cause }
    );

    if (result.blocked) {
        try {
            player.playSound("item.shield.block", {
                pitch: 1,
                volume: 1
            });
            player.sendMessage(
                "\u00a7bBlocked! Damage reduced by half."
            );
        } catch {}
    }

    return applyPlayerHpDamage(player, result.damage, attacker);
}

function handlePlayerVictim(event, player, attacker, projectile) {
    if (isSpellProjectile(projectile)) {
        system.run(() => fillNativeHealth(player));
        return;
    }

    if (event.damageSource?.cause === "starvation") {
        system.run(() => fillNativeHealth(player));
        return;
    }

    if (isPlayerDowned(player)) {
        system.run(() => syncPlayerHealth(player));
        return;
    }

    if (!attacker && !projectile) {
        applyPlayerHpDamage(
            player,
            Math.max(1, Math.ceil(event.damage)),
            undefined
        );
        return;
    }

    let damage = event.damage;
    if (
        attacker?.typeId === "minecraft:player" &&
        !projectile &&
        isMeleeCause(event.damageSource?.cause)
    ) {
        damage = getPlayerMeleeDamageAfterArmor(event, attacker);
    } else if (
        attacker?.typeId === "minecraft:player" &&
        projectile?.typeId === "minecraft:arrow"
    ) {
        damage = getProjectileDamage(event, attacker);
    } else if (isPurpleGolem(attacker)) {
        damage = getPurpleGolemAttackDamage(attacker);
    }

    const result = modifyIncomingCombatDamage(
        player,
        damage,
        {
            attacker,
            projectile,
            cause: event.damageSource?.cause
        }
    );

    if (result.blocked) {
        try {
            player.playSound("item.shield.block", {
                pitch: 1,
                volume: 1
            });
            player.sendMessage(
                "\u00a7bBlocked! Damage reduced by half."
            );
        } catch {}
    }

    applyPlayerHpDamage(player, result.damage, attacker);
}

function handleNonPlayerVictim(event, entity, attacker, projectile) {
    if (attacker?.typeId !== "minecraft:player") return;
    if (isSpellProjectile(projectile)) return;
    if (!isMeleeCause(event.damageSource?.cause) && projectile?.typeId !== "minecraft:arrow") return;

    let desiredDamage;
    if (!projectile) {
        desiredDamage = getPlayerMeleeDamageAfterArmor(event, attacker);
        desiredDamage = scaleMobIncomingDamage(entity, desiredDamage, "melee");
    } else if (projectile.typeId === "minecraft:arrow") {
        desiredDamage = getProjectileDamage(event, attacker);
        desiredDamage = scaleMobIncomingDamage(
            entity,
            desiredDamage,
            "projectile"
        );
    } else {
        return;
    }

    const actualDamage = setEntityDamageFromVanillaEvent(
        entity,
        event,
        desiredDamage
    );
    if (actualDamage > 0) {
        recordCombatCredit(entity, attacker);
        recordCombatFeedback(attacker, entity, actualDamage);
    }
}

world.afterEvents.entityHurt.subscribe((event) => {
    const entity = event.hurtEntity;
    const attacker = event.damageSource?.damagingEntity;
    const projectile = event.damageSource?.damagingProjectile;

    if (isSpellProjectile(projectile)) {
        system.run(() => restoreFriendlyDamage(entity, event.damage));
        return;
    }

    if (attacker && areFriendly(attacker, entity)) {
        system.run(() => restoreFriendlyDamage(entity, event.damage));
        return;
    }

    if (entity.typeId === "minecraft:player") {
        handlePlayerVictim(event, entity, attacker, projectile);
        return;
    }

    if (attacker) recordCombatCredit(entity, attacker);
    handleNonPlayerVictim(event, entity, attacker, projectile);
});

system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        setScore(player, "weapon_damage", getWeaponDamage(player));
        setScore(player, "melee_damage", getMeleeDamage(player));
    }
}, 10);
