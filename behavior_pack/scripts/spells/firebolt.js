import { dealCustomPlayerDamage } from "../systems/combat_system.js";
import { areFriendly } from "../systems/team_system.js";
import { recordCombatFeedback } from "../systems/combat_feedback.js";
import { scaleMobIncomingDamage } from "../systems/mob_resistances.js";
import { castWithCostAndCooldown } from "./spell_casting.js";
import {
    launchSpellProjectile,
    SPELL_HIT_MODES
} from "./spell_projectile.js";

const MP_COST = 1;
const BASE_DAMAGE = 6;
const BASE_COOLDOWN_TICKS = 20;
const FIRE_SECONDS = 5;

function burnHit(owner, victim, location) {
    if (!victim || victim.id === owner.id || areFriendly(owner, victim)) return;

    try {
        if (victim.typeId === "minecraft:player") {
            dealCustomPlayerDamage(victim, BASE_DAMAGE, owner, "fire");
        } else {
            const resistedDamage = scaleMobIncomingDamage(
                victim,
                BASE_DAMAGE,
                "magic"
            );
            if (resistedDamage <= 0) return;

            const health = victim.getComponent("minecraft:health");
            const actualDamage = health
                ? Math.min(health.currentValue, resistedDamage)
                : resistedDamage;
            victim.applyDamage(resistedDamage, {
                cause: "fire",
                damagingEntity: owner
            });
            recordCombatFeedback(owner, victim, actualDamage);
        }

        victim.setOnFire(FIRE_SECONDS, false);
        victim.dimension.spawnParticle("minecraft:basic_flame_particle", victim.location);
        victim.dimension.spawnParticle("minecraft:lava_particle", victim.location);
        victim.dimension.playSound("random.explode", victim.location, {
            pitch: 1.3,
            volume: 0.7
        });
    } catch (error) {
        console.warn(`[Firebolt] Hit failed: ${error}`);
    }
}

export const FIREBOLT_SPELL = {
    id: "firebolt",
    name: "Firebolt",
    mpCost: MP_COST,
    cooldownTicks: BASE_COOLDOWN_TICKS,
    projectile: {
        projectileType: "mysrpg:firebolt_projectile",
        hitDistance: 1.6,
        castParticles: ["minecraft:basic_flame_particle", "minecraft:lava_particle"],
        trailParticles: ["minecraft:basic_flame_particle"],
        castSound: {
            id: "fire.fire",
            options: { pitch: 1.3, volume: 0.8 }
        },
        onHitEntity: burnHit
    }
};

export function castFirebolt(player) {
    return castWithCostAndCooldown(player, {
        id: FIREBOLT_SPELL.id,
        name: FIREBOLT_SPELL.name,
        mpCost: FIREBOLT_SPELL.mpCost,
        cooldownTicks: FIREBOLT_SPELL.cooldownTicks,
        onCast: (caster) => launchSpellProjectile(caster, {
            name: FIREBOLT_SPELL.name,
            hitMode: SPELL_HIT_MODES.ENTITY_ONLY,
            ...FIREBOLT_SPELL.projectile
        })
    });
}
