import { system, world } from "@minecraft/server";
import { areFriendly } from "../systems/team_system.js";

const PROJECTILE_TYPE = "minecraft:snowball";
const DEFAULT_MAX_LIFE_TICKS = 100;
const SPELL_PROJECTILE_TAG = "mysrpg_spell_projectile";
export const SPELL_HIT_MODES = {
    ENTITY_ONLY: "entity_only",
    ENTITY_OR_BLOCK: "entity_or_block"
};

export const SPELL_FRIENDLY_MODES = {
    BLOCK: "block",
    PASS_THROUGH: "pass_through",
    HIT: "hit"
};

export function isSpellProjectile(entity) {
    try {
        return !!entity?.hasTag?.(SPELL_PROJECTILE_TAG);
    } catch {
        return false;
    }
}

const activeProjectiles = new Map();
const PASSABLE_BLOCKS = new Set([
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air",
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava",
    "minecraft:fire",
    "minecraft:soul_fire",
    "minecraft:snow_layer"
]);

function getDefaultSpeedForHitMode(hitMode) {
    if (hitMode === SPELL_HIT_MODES.ENTITY_OR_BLOCK) return 1.0;
    return 1.2;
}

function isValidEntity(entity) {
    try {
        if (!entity) return false;
        if (typeof entity.isValid === "function") return entity.isValid();
        return entity.isValid;
    } catch {
        return false;
    }
}

export function spawnParticle(dimension, particleId, location) {
    try {
        dimension.spawnParticle(particleId, location);
    } catch {}
}

export function playSound(dimension, soundId, location, options = {}) {
    try {
        dimension.playSound(soundId, location, options);
    } catch {}
}

export function getCastPosition(player) {
    const direction = player.getViewDirection();

    return {
        x: player.location.x + direction.x * 1.2,
        y: player.location.y + 1.5 + direction.y * 1.2,
        z: player.location.z + direction.z * 1.2
    };
}

export function launchSpellProjectile(player, spell) {
    const direction = player.getViewDirection();
    const position = getCastPosition(player);
    const resolvedSpell = {
        hitMode: SPELL_HIT_MODES.ENTITY_ONLY,
        friendlyMode: SPELL_FRIENDLY_MODES.BLOCK,
        ...spell
    };
    const entity = player.dimension.spawnEntity(resolvedSpell.projectileType ?? PROJECTILE_TYPE, position);
    const projectile = entity.getComponent("minecraft:projectile");
    const speed = resolvedSpell.speed ?? getDefaultSpeedForHitMode(resolvedSpell.hitMode);

    if (projectile) projectile.owner = player;
    try {
        entity.addTag(SPELL_PROJECTILE_TAG);
    } catch {}

    entity.applyImpulse({
        x: direction.x * speed,
        y: direction.y * speed,
        z: direction.z * speed
    });

    activeProjectiles.set(entity.id, {
        entity,
        owner: player,
        lifeTicks: 0,
        dimension: player.dimension,
        lastLocation: position,
        spell: resolvedSpell
    });

    for (const particle of spell.castParticles ?? []) {
        spawnParticle(player.dimension, particle, position);
    }

    if (spell.castSound) {
        player.playSound(spell.castSound.id, spell.castSound.options ?? {});
    }
}

function removeProjectile(id, data) {
    try {
        if (isValidEntity(data.entity)) data.entity.remove();
    } catch {}
    activeProjectiles.delete(id);
}

function isProjectileTarget(data, entity) {
    return entity &&
        entity.id !== data.entity.id &&
        entity.id !== data.owner.id &&
        entity.typeId !== "minecraft:item" &&
        entity.typeId !== "minecraft:xp_orb";
}

function findNearbyTarget(data, location = data.entity.location) {
    try {
        return data.entity.dimension.getEntities({
            location,
            maxDistance: data.spell.hitDistance ?? 1.6
        }).find((entity) => isProjectileTarget(data, entity));
    } catch {
        return undefined;
    }
}

function findTargetAlongPath(data, from, to) {
    if (!from || !to) return findNearbyTarget(data);

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(1, Math.ceil(distance / 0.25));

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const location = {
            x: from.x + dx * t,
            y: from.y + dy * t,
            z: from.z + dz * t
        };
        const target = findNearbyTarget(data, location);
        if (target) return target;
    }

    return undefined;
}

function canHitBlocks(data) {
    return data.spell.hitMode === SPELL_HIT_MODES.ENTITY_OR_BLOCK;
}

function hitTarget(id, data, victim) {
    if (!victim || victim.id === data.owner.id) return false;

    if (areFriendly(data.owner, victim)) {
        if (data.spell.friendlyMode === SPELL_FRIENDLY_MODES.PASS_THROUGH) return false;
        if (data.spell.friendlyMode === SPELL_FRIENDLY_MODES.BLOCK) removeProjectile(id, data);
        if (data.spell.friendlyMode === SPELL_FRIENDLY_MODES.HIT) {
            try {
                data.spell.onHitEntity?.(data.owner, victim, data.entity.location, data.entity);
            } catch (error) {
                console.warn(`[${data.spell.name ?? "Spell"}] Friendly hit failed: ${error}`);
            }
            removeProjectile(id, data);
        }
        return true;
    }

    try {
        data.spell.onHitEntity?.(data.owner, victim, data.entity.location, data.entity);
    } catch (error) {
        console.warn(`[${data.spell.name ?? "Spell"}] Hit failed: ${error}`);
    }

    removeProjectile(id, data);
    return true;
}

function hitBlock(id, data, impactLocation = data.lastLocation ?? data.entity?.location) {
    try {
        data.spell.onHitBlock?.(data.owner, impactLocation, data.entity);
    } catch (error) {
        console.warn(`[${data.spell.name ?? "Spell"}] Block hit failed: ${error}`);
    }

    removeProjectile(id, data);
}

function isSolidBlock(dimension, location) {
    try {
        const block = dimension.getBlock(location);
        return block && !PASSABLE_BLOCKS.has(block.typeId);
    } catch {
        return false;
    }
}

function findSolidBlockImpact(data, from, to) {
    if (!from || !to) return undefined;

    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dz = to.z - from.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const steps = Math.max(1, Math.ceil(distance / 0.25));

    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const location = {
            x: from.x + dx * t,
            y: from.y + dy * t,
            z: from.z + dz * t
        };

        if (isSolidBlock(data.dimension, location)) return location;
    }

    return undefined;
}

system.runInterval(() => {
    for (const [id, data] of activeProjectiles) {
        if (!isValidEntity(data.entity)) {
            if (data.spell.onExpireExplode && data.lastLocation) {
                hitBlock(id, data, data.lastLocation);
            } else {
                activeProjectiles.delete(id);
            }
            continue;
        }

        data.lifeTicks++;
        const currentLocation = { ...data.entity.location };
        const impactLocation = canHitBlocks(data)
            ? findSolidBlockImpact(data, data.lastLocation, currentLocation)
            : undefined;
        if (impactLocation) {
            hitBlock(id, data, impactLocation);
            continue;
        }

        for (const particle of data.spell.trailParticles ?? []) {
            spawnParticle(data.entity.dimension, particle, data.entity.location);
        }

        const target = findTargetAlongPath(data, data.lastLocation, currentLocation);
        if (target && hitTarget(id, data, target)) continue;

        if (data.lifeTicks >= (data.spell.maxLifeTicks ?? DEFAULT_MAX_LIFE_TICKS)) {
            if (canHitBlocks(data) && data.spell.onExpireExplode) {
                hitBlock(id, data, currentLocation);
                continue;
            }
            removeProjectile(id, data);
        }

        data.lastLocation = currentLocation;
    }
}, 1);

world.afterEvents.projectileHitEntity?.subscribe((event) => {
    const data = activeProjectiles.get(event.projectile?.id);
    if (!data) return;

    const victim = event.getEntityHit()?.entity;
    hitTarget(event.projectile.id, data, victim);
});

world.afterEvents.projectileHitBlock?.subscribe((event) => {
    const data = activeProjectiles.get(event.projectile?.id);
    if (!data) return;
    if (!canHitBlocks(data)) {
        removeProjectile(event.projectile.id, data);
        return;
    }

    hitBlock(event.projectile.id, data, event.projectile.location);
});
