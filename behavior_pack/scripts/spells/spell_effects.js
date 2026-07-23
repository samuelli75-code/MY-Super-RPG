import { dealCustomPlayerDamage } from "../systems/combat_system.js";
import { recordCombatFeedback } from "../systems/combat_feedback.js";
import { areFriendly } from "../systems/team_system.js";
import { getScore, setScore } from "../data/class_utils.js";
import { getMaxHp, syncPlayerHealth } from "../systems/stats_system.js";
import { reviveDownedPlayer } from "../systems/death_system.js";
import { recordCombatCredit } from "../systems/combat_credit.js";
import { playSound, spawnParticle } from "./spell_projectile.js";

const IGNORED_ENTITY_TYPES = new Set([
    "minecraft:item",
    "minecraft:xp_orb",
    "minecraft:snowball"
]);

const UNBREAKABLE_BLOCKS = new Set([
    "minecraft:air",
    "minecraft:bedrock",
    "minecraft:barrier",
    "minecraft:command_block",
    "minecraft:chain_command_block",
    "minecraft:repeating_command_block",
    "minecraft:structure_block",
    "minecraft:structure_void",
    "minecraft:end_portal",
    "minecraft:end_portal_frame",
    "minecraft:nether_portal"
]);

export function isSpellTarget(entity) {
    return entity && !IGNORED_ENTITY_TYPES.has(entity.typeId);
}

export function damageSpellTarget(owner, target, damage, cause = "magic") {
    if (!isSpellTarget(target) || target.id === owner.id || areFriendly(owner, target)) return false;

    recordCombatCredit(target, owner);

    if (target.typeId === "minecraft:player") {
        dealCustomPlayerDamage(target, damage, owner, cause);
        return true;
    }

    const health = target.getComponent("minecraft:health");
    const actualDamage = health ? Math.min(health.currentValue, damage) : damage;
    target.applyDamage(damage, {
        cause,
        damagingEntity: owner
    });
    recordCombatFeedback(owner, target, actualDamage);
    return true;
}

export function damageTargetsInRadius(owner, location, radius, damage, cause = "magic") {
    const entities = owner.dimension.getEntities({ location, maxDistance: radius });
    for (const entity of entities) {
        damageSpellTarget(owner, entity, damage, cause);
    }
}

export function recordSpellCreditInRadius(owner, location, radius) {
    for (const entity of owner.dimension.getEntities({ location, maxDistance: radius })) {
        if (!isSpellTarget(entity) || entity.id === owner.id || areFriendly(owner, entity)) continue;
        recordCombatCredit(entity, owner);
    }
}

export function applySlowness(target, ticks, amplifier) {
    try {
        target.addEffect("slowness", ticks, {
            amplifier,
            showParticles: true
        });
    } catch {}
}

export function applyFrozen(target, ticks) {
    applySlowness(target, ticks, 255);
    try {
        target.addEffect("weakness", ticks, {
            amplifier: 255,
            showParticles: true
        });
    } catch {}
}

export function igniteAt(dimension, center, radius = 1) {
    const baseY = Math.floor(center.y);
    const radiusSq = radius * radius;

    for (let x = Math.floor(center.x - radius); x <= Math.floor(center.x + radius); x++) {
        for (let z = Math.floor(center.z - radius); z <= Math.floor(center.z + radius); z++) {
            const dx = x + 0.5 - center.x;
            const dz = z + 0.5 - center.z;
            if (dx * dx + dz * dz > radiusSq) continue;

            for (let offset = 1; offset >= -2; offset--) {
                try {
                    const block = dimension.getBlock({ x, y: baseY + offset, z });
                    const below = dimension.getBlock({ x, y: baseY + offset - 1, z });
                    if (
                        block?.typeId === "minecraft:air" &&
                        below?.typeId !== "minecraft:air" &&
                        below?.typeId !== "minecraft:fire"
                    ) {
                        block.setType("minecraft:fire");
                        break;
                    }
                } catch {}
            }
        }
    }
}

export function igniteArea(dimension, center, radius, seconds) {
    const minX = Math.floor(center.x - radius);
    const maxX = Math.floor(center.x + radius);
    const minY = Math.floor(center.y - 1);
    const maxY = Math.floor(center.y + 1);
    const minZ = Math.floor(center.z - radius);
    const maxZ = Math.floor(center.z + radius);
    const radiusSq = radius * radius;

    for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
            for (let z = minZ; z <= maxZ; z++) {
                const dx = x + 0.5 - center.x;
                const dz = z + 0.5 - center.z;
                if (dx * dx + dz * dz > radiusSq) continue;

                igniteAt(dimension, { x: x + 0.5, y, z: z + 0.5 }, 0.6);
            }
        }
    }

    for (const entity of dimension.getEntities({ location: center, maxDistance: radius })) {
        try {
            if (isSpellTarget(entity)) entity.setOnFire(seconds, false);
        } catch {}
    }
}

export function createExplosion(dimension, owner, location, radius, causesFire) {
    try {
        dimension.createExplosion(location, radius, {
            causesFire,
            breaksBlocks: true,
            source: owner
        });
        return;
    } catch {}

    try {
        dimension.createExplosion(location, radius, {
            causesFire,
            breaksBlocks: true
        });
        return;
    } catch {}

    try {
        dimension.createExplosion(location, radius);
        return;
    } catch {}

    breakBlocksInSphere(dimension, location, radius);
    if (causesFire) igniteArea(dimension, location, radius + 1, 5);
}

export function breakBlocksInSphere(dimension, center, radius) {
    const radiusSq = radius * radius;

    for (let x = Math.floor(center.x - radius); x <= Math.floor(center.x + radius); x++) {
        for (let y = Math.floor(center.y - radius); y <= Math.floor(center.y + radius); y++) {
            for (let z = Math.floor(center.z - radius); z <= Math.floor(center.z + radius); z++) {
                const dx = x + 0.5 - center.x;
                const dy = y + 0.5 - center.y;
                const dz = z + 0.5 - center.z;
                if (dx * dx + dy * dy + dz * dz > radiusSq) continue;

                try {
                    const block = dimension.getBlock({ x, y, z });
                    if (!block || UNBREAKABLE_BLOCKS.has(block.typeId)) continue;
                    block.setType("minecraft:air");
                } catch {}
            }
        }
    }
}

export function placeSnowLayer(dimension, center, radius) {
    const y = Math.floor(center.y);
    const radiusSq = radius * radius;

    for (let x = Math.floor(center.x - radius); x <= Math.floor(center.x + radius); x++) {
        for (let z = Math.floor(center.z - radius); z <= Math.floor(center.z + radius); z++) {
            const dx = x + 0.5 - center.x;
            const dz = z + 0.5 - center.z;
            if (dx * dx + dz * dz > radiusSq) continue;

            for (let offset = 1; offset >= -2; offset--) {
                try {
                    const block = dimension.getBlock({ x, y: y + offset, z });
                    const below = dimension.getBlock({ x, y: y + offset - 1, z });
                    if (
                        (block?.typeId === "minecraft:air" || block?.typeId === "minecraft:snow_layer") &&
                        below?.typeId !== "minecraft:air"
                    ) {
                        block.setType("minecraft:snow_layer");
                        break;
                    }
                } catch {}
            }
        }
    }
}

export function healFriendlyPlayer(caster, target, amount) {
    if (target.typeId !== "minecraft:player" || !areFriendly(caster, target)) return false;

    const currentHp = getScore(target, "hp");
    const maxHp = getMaxHp(target);
    if (currentHp >= maxHp) return false;

    setScore(target, "hp", Math.min(maxHp, currentHp + amount));
    syncPlayerHealth(target);
    reviveDownedPlayer(target, caster);
    spawnParticle(target.dimension, "minecraft:heart_particle", target.location);
    return true;
}

export function burstParticles(dimension, location, particleIds) {
    for (const particleId of particleIds) {
        spawnParticle(dimension, particleId, location);
    }
}

export function playSpellImpact(dimension, location, soundId, pitch = 1, volume = 1) {
    playSound(dimension, soundId, location, { pitch, volume });
}
