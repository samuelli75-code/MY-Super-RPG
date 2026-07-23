import { system } from "@minecraft/server";
import { castWithCostAndCooldown } from "./spell_casting.js";
import {
    applyFrozen,
    burstParticles,
    createExplosion,
    damageTargetsInRadius,
    isSpellTarget,
    playSpellImpact,
    recordSpellCreditInRadius
} from "./spell_effects.js";
import { areFriendly } from "../systems/team_system.js";
import {
    launchSpellProjectile,
    SPELL_HIT_MODES
} from "./spell_projectile.js";

const MP_COST = 8;
const BASE_DAMAGE = 10;
const BASE_COOLDOWN_TICKS = 200;
const EXPLOSION_RADIUS = 3;
const SNOW_RADIUS = EXPLOSION_RADIUS + 1;
const FREEZE_TICKS = 200;
const MELT_TICKS = 200;

function getImpactLocation(targetOrLocation, impactLocation) {
    if (targetOrLocation && typeof targetOrLocation.x === "number") return targetOrLocation;
    if (impactLocation && typeof impactLocation.x === "number") return impactLocation;
    if (targetOrLocation?.location) return targetOrLocation.location;
    if (impactLocation?.location) return impactLocation.location;
    return targetOrLocation;
}

function placeTemporarySnow(dimension, center, radius) {
    const placed = [];
    const y = Math.floor(center.y);
    const radiusSq = radius * radius;

    for (let x = Math.floor(center.x - radius); x <= Math.floor(center.x + radius); x++) {
        for (let z = Math.floor(center.z - radius); z <= Math.floor(center.z + radius); z++) {
            const dx = x + 0.5 - center.x;
            const dz = z + 0.5 - center.z;
            if (dx * dx + dz * dz > radiusSq) continue;

            for (let offset = 1; offset >= -2; offset--) {
                const location = { x, y: y + offset, z };

                try {
                    const block = dimension.getBlock(location);
                    const below = dimension.getBlock({ x, y: y + offset - 1, z });
                    if (block?.typeId !== "minecraft:air" || below?.typeId === "minecraft:air") continue;

                    block.setType("minecraft:snow_layer");
                    placed.push(location);
                    break;
                } catch {}
            }
        }
    }

    return placed;
}

function pourMeltWater(dimension, center) {
    const baseY = Math.floor(center.y);

    for (let offset = 2; offset >= -3; offset--) {
        const location = {
            x: Math.floor(center.x),
            y: baseY + offset,
            z: Math.floor(center.z)
        };

        try {
            const block = dimension.getBlock(location);
            const below = dimension.getBlock({ ...location, y: location.y - 1 });
            if (
                (block?.typeId === "minecraft:air" || block?.typeId === "minecraft:snow_layer") &&
                below?.typeId !== "minecraft:air"
            ) {
                try {
                    block.setType("minecraft:flowing_water");
                } catch {
                    block.setType("minecraft:water");
                }
                playSpellImpact(dimension, location, "bucket.empty_water", 1, 0.8);
                return;
            }
        } catch {}
    }
}

function meltSnowAndPourWater(dimension, snowLocations, center) {
    for (const location of snowLocations) {
        try {
            const block = dimension.getBlock(location);
            if (block?.typeId === "minecraft:snow_layer") block.setType("minecraft:air");
        } catch {}
    }

    pourMeltWater(dimension, center);
}

function frostBurst(owner, targetOrLocation, impactLocation) {
    const location = getImpactLocation(targetOrLocation, impactLocation);
    damageTargetsInRadius(owner, location, EXPLOSION_RADIUS, BASE_DAMAGE, "entityExplosion");
    recordSpellCreditInRadius(owner, location, SNOW_RADIUS);
    createExplosion(owner.dimension, owner, location, EXPLOSION_RADIUS, false);

    for (const entity of owner.dimension.getEntities({ location, maxDistance: SNOW_RADIUS })) {
        if (!isSpellTarget(entity) || entity.id === owner.id || areFriendly(owner, entity)) continue;

        try {
            const health = entity.getComponent("minecraft:health");
            if (!health || health.currentValue > 0) applyFrozen(entity, FREEZE_TICKS);
        } catch {
            applyFrozen(entity, FREEZE_TICKS);
        }
    }

    const snowLocations = placeTemporarySnow(owner.dimension, location, SNOW_RADIUS);
    system.runTimeout(() => {
        meltSnowAndPourWater(owner.dimension, snowLocations, location);
    }, MELT_TICKS);

    burstParticles(owner.dimension, location, [
        "minecraft:snowflake_particle",
        "minecraft:ice_evaporation_emitter"
    ]);
    playSpellImpact(owner.dimension, location, "random.glass", 0.8, 1);
}

export const FROSTBALL_SPELL = {
    id: "frostball",
    name: "Frostball",
    mpCost: MP_COST,
    cooldownTicks: BASE_COOLDOWN_TICKS,
    projectile: {
        projectileType: "mysrpg:frostball_projectile",
        hitDistance: 1.8,
        onExpireExplode: true,
        castParticles: ["minecraft:snowflake_particle", "minecraft:ice_evaporation_emitter"],
        trailParticles: ["minecraft:snowflake_particle"],
        castSound: {
            id: "mob.snowgolem.shoot",
            options: { pitch: 0.7, volume: 1 }
        },
        onHitEntity: frostBurst,
        onHitBlock: frostBurst
    }
};

export function castFrostball(player) {
    return castWithCostAndCooldown(player, {
        id: FROSTBALL_SPELL.id,
        name: FROSTBALL_SPELL.name,
        mpCost: FROSTBALL_SPELL.mpCost,
        cooldownTicks: FROSTBALL_SPELL.cooldownTicks,
        onCast: (caster) => launchSpellProjectile(caster, {
            name: FROSTBALL_SPELL.name,
            projectileType: "minecraft:arrow",
            hitMode: SPELL_HIT_MODES.ENTITY_OR_BLOCK,
            ...FROSTBALL_SPELL.projectile
        })
    });
}
