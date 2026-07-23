import { castWithCostAndCooldown } from "./spell_casting.js";
import {
    breakBlocksInSphere,
    burstParticles,
    createExplosion,
    damageTargetsInRadius,
    igniteArea,
    playSpellImpact,
    recordSpellCreditInRadius
} from "./spell_effects.js";
import {
    launchSpellProjectile,
    SPELL_HIT_MODES
} from "./spell_projectile.js";

const MP_COST = 8;
const BASE_DAMAGE = 10;
const BASE_COOLDOWN_TICKS = 200;
const EXPLOSION_RADIUS = 3;
const FIRE_SECONDS = 5;

function getImpactLocation(targetOrLocation, impactLocation) {
    if (targetOrLocation && typeof targetOrLocation.x === "number") return targetOrLocation;
    if (impactLocation && typeof impactLocation.x === "number") return impactLocation;
    if (targetOrLocation?.location) return targetOrLocation.location;
    if (impactLocation?.location) return impactLocation.location;
    return targetOrLocation;
}

function explode(owner, targetOrLocation, impactLocation) {
    const location = getImpactLocation(targetOrLocation, impactLocation);
    damageTargetsInRadius(owner, location, EXPLOSION_RADIUS, BASE_DAMAGE, "entityExplosion");
    recordSpellCreditInRadius(owner, location, EXPLOSION_RADIUS + 1);
    createExplosion(owner.dimension, owner, location, EXPLOSION_RADIUS, true);
    breakBlocksInSphere(owner.dimension, location, EXPLOSION_RADIUS);
    igniteArea(owner.dimension, location, EXPLOSION_RADIUS + 1, FIRE_SECONDS);
    burstParticles(owner.dimension, location, [
        "minecraft:basic_flame_particle",
        "minecraft:lava_particle"
    ]);
    playSpellImpact(owner.dimension, location, "random.explode", 0.9, 1);
}

export const FLAMEBURST_SPELL = {
    id: "flameburst",
    name: "Flameburst",
    mpCost: MP_COST,
    cooldownTicks: BASE_COOLDOWN_TICKS,
    projectile: {
        projectileType: "mysrpg:flameburst_projectile",
        hitDistance: 1.8,
        onExpireExplode: true,
        castParticles: ["minecraft:basic_flame_particle", "minecraft:lava_particle"],
        trailParticles: ["minecraft:basic_flame_particle", "minecraft:lava_particle"],
        castSound: {
            id: "fire.fire",
            options: { pitch: 0.8, volume: 1 }
        },
        onHitEntity: explode,
        onHitBlock: explode
    }
};

export function castFlameburst(player) {
    return castWithCostAndCooldown(player, {
        id: FLAMEBURST_SPELL.id,
        name: FLAMEBURST_SPELL.name,
        mpCost: FLAMEBURST_SPELL.mpCost,
        cooldownTicks: FLAMEBURST_SPELL.cooldownTicks,
        onCast: (caster) => launchSpellProjectile(caster, {
            name: FLAMEBURST_SPELL.name,
            projectileType: "minecraft:arrow",
            hitMode: SPELL_HIT_MODES.ENTITY_OR_BLOCK,
            ...FLAMEBURST_SPELL.projectile
        })
    });
}
