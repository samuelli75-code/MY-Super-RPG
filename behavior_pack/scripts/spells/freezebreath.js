import { system } from "@minecraft/server";
import { getClassLevel } from "../data/class_utils.js";
import { areFriendly } from "../systems/team_system.js";
import { castWithCostAndCooldown } from "./spell_casting.js";
import {
    applyFrozen,
    burstParticles,
    damageSpellTarget,
    isSpellTarget,
    playSpellImpact
} from "./spell_effects.js";

const SPELL_ID = "freezebreath";
const SPELL_NAME = "Freeze Breath";
const BASE_MP_COST = 12;
const BASE_DAMAGE = 8;
const BASE_COOLDOWN_TICKS = 300; // 15s
const BASE_DURATION_TICKS = 160; // 8s
const BASE_RANGE = 5;
const BASE_HALF_ANGLE_DEG = 34;
const MAX_CLASS_LEVEL = 20;

/**
 * Scales with mage class-book level (mage_lv).
 * Lv1 = base values; higher levels push range, MP, damage, and duration.
 */
export function getFreezeBreathStats(player) {
    const level = Math.min(
        MAX_CLASS_LEVEL,
        Math.max(1, getClassLevel(player, "mage"))
    );
    const t = level - 1;

    return {
        level,
        mpCost: Math.ceil(BASE_MP_COST * (1 + 0.035 * t)),
        damage: Math.ceil(BASE_DAMAGE * (1 + 0.05 * t)),
        durationTicks: Math.ceil(BASE_DURATION_TICKS * (1 + 0.04 * t)),
        range: BASE_RANGE + 0.35 * t,
        halfAngleDeg: BASE_HALF_ANGLE_DEG + 0.45 * t
    };
}

function normalize(vector) {
    const length = Math.sqrt(
        vector.x * vector.x + vector.y * vector.y + vector.z * vector.z
    );
    if (length <= 0.0001) return { x: 0, y: 0, z: 1 };
    return {
        x: vector.x / length,
        y: vector.y / length,
        z: vector.z / length
    };
}

function isInCone(origin, forward, point, range, cosHalfAngle) {
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;
    const dz = point.z - origin.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance < 0.35 || distance > range) return false;

    const dot = (dx * forward.x + dy * forward.y + dz * forward.z) / distance;
    return dot >= cosHalfAngle;
}

function getBreathOrigin(player) {
    const location = player.location;
    return {
        x: location.x,
        y: location.y + 1.5,
        z: location.z
    };
}

function canReplaceWithPowderSnow(block) {
    if (!block) return false;
    const typeId = block.typeId;
    return (
        typeId === "minecraft:air" ||
        typeId === "minecraft:snow_layer" ||
        typeId === "minecraft:short_grass" ||
        typeId === "minecraft:tall_grass" ||
        typeId === "minecraft:fire"
    );
}

function placeConePowderSnow(dimension, origin, forward, range, cosHalfAngle) {
    const placed = [];
    const minX = Math.floor(origin.x - range);
    const maxX = Math.floor(origin.x + range);
    const minZ = Math.floor(origin.z - range);
    const maxZ = Math.floor(origin.z + range);
    const baseY = Math.floor(origin.y);

    for (let x = minX; x <= maxX; x++) {
        for (let z = minZ; z <= maxZ; z++) {
            const sample = { x: x + 0.5, y: origin.y, z: z + 0.5 };
            if (!isInCone(origin, forward, sample, range, cosHalfAngle)) continue;

            for (let offset = 1; offset >= -3; offset--) {
                const y = baseY + offset;
                const location = { x, y, z };

                try {
                    const block = dimension.getBlock(location);
                    const below = dimension.getBlock({ x, y: y - 1, z });
                    if (!canReplaceWithPowderSnow(block)) continue;
                    if (!below || below.typeId === "minecraft:air") continue;
                    if (below.typeId === "minecraft:powder_snow") continue;

                    block.setType("minecraft:powder_snow");
                    placed.push({ ...location });
                    break;
                } catch {}
            }
        }
    }

    return placed;
}

function clearPowderSnow(dimension, placed) {
    for (const location of placed) {
        try {
            const block = dimension.getBlock(location);
            if (block?.typeId === "minecraft:powder_snow") {
                block.setType("minecraft:air");
            }
        } catch {}
    }
}

function affectTargetsInCone(caster, origin, forward, stats, cosHalfAngle) {
    let hitCount = 0;

    try {
        const entities = caster.dimension.getEntities({
            location: origin,
            maxDistance: stats.range + 1
        });

        for (const entity of entities) {
            if (!isSpellTarget(entity) || entity.id === caster.id) continue;
            if (areFriendly(caster, entity)) continue;

            const point = {
                x: entity.location.x,
                y: entity.location.y + 0.9,
                z: entity.location.z
            };
            if (!isInCone(origin, forward, point, stats.range, cosHalfAngle)) {
                continue;
            }

            if (damageSpellTarget(caster, entity, stats.damage, "magic")) {
                applyFrozen(entity, stats.durationTicks);
                hitCount += 1;

                try {
                    entity.dimension.spawnParticle(
                        "minecraft:snowflake_particle",
                        entity.location
                    );
                } catch {}
            }
        }
    } catch {}

    return hitCount;
}

function spawnBreathParticles(dimension, origin, forward, range) {
    for (let step = 1; step <= Math.ceil(range * 2); step++) {
        const distance = step * 0.5;
        const yawSpread = (Math.random() - 0.5) * 0.7;
        const pitchSpread = (Math.random() - 0.5) * 0.25;
        const point = {
            x: origin.x + forward.x * distance + yawSpread,
            y: origin.y + forward.y * distance + pitchSpread,
            z: origin.z + forward.z * distance + yawSpread
        };

        try {
            dimension.spawnParticle("minecraft:snowflake_particle", point);
            if (step % 2 === 0) {
                dimension.spawnParticle(
                    "minecraft:ice_evaporation_emitter",
                    point
                );
            }
        } catch {}
    }
}

function executeFreezeBreath(caster, stats) {
    const origin = getBreathOrigin(caster);
    const forward = normalize(caster.getViewDirection());
    const cosHalfAngle = Math.cos((stats.halfAngleDeg * Math.PI) / 180);

    const hitCount = affectTargetsInCone(
        caster,
        origin,
        forward,
        stats,
        cosHalfAngle
    );
    const placed = placeConePowderSnow(
        caster.dimension,
        origin,
        forward,
        stats.range,
        cosHalfAngle
    );

    spawnBreathParticles(caster.dimension, origin, forward, stats.range);
    burstParticles(caster.dimension, origin, [
        "minecraft:snowflake_particle",
        "minecraft:ice_evaporation_emitter"
    ]);
    playSpellImpact(caster.dimension, origin, "mob.enderdragon.flap", 1.6, 0.9);
    playSpellImpact(caster.dimension, origin, "random.glass", 0.7, 0.7);

    system.runTimeout(() => {
        clearPowderSnow(caster.dimension, placed);
    }, stats.durationTicks);

    caster.sendMessage(
        `\u00a7bFreeze Breath\u00a77 Lv.${stats.level} ` +
            `\u00a78|\u00a7f ${hitCount} hit ` +
            `\u00a78|\u00a79 ${stats.damage} dmg ` +
            `\u00a78|\u00a73 ${(stats.durationTicks / 20).toFixed(1)}s`
    );
}

export function castFreezeBreath(player) {
    const stats = getFreezeBreathStats(player);

    return castWithCostAndCooldown(player, {
        id: SPELL_ID,
        name: SPELL_NAME,
        mpCost: stats.mpCost,
        cooldownTicks: BASE_COOLDOWN_TICKS,
        onCast: (caster) => executeFreezeBreath(caster, stats)
    });
}

export const FREEZEBREATH_SPELL = {
    id: SPELL_ID,
    name: SPELL_NAME,
    mpCost: BASE_MP_COST,
    cooldownTicks: BASE_COOLDOWN_TICKS,
    castDirect: castFreezeBreath
};
