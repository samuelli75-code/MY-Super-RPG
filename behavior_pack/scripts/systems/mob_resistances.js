/**
 * Incoming damage multipliers for custom mobs.
 * resistance 50% => multiplier 0.5 (take half damage)
 */

const MAGIC_CAUSES = new Set([
    "magic",
    "fire",
    "lightning",
    "entityExplosion",
    "blockExplosion",
    "fireTick",
    "lava",
    "wither"
]);

const PURPLE_GOLEM_ID = "mysrpg:purple_golem";
const PHASE2_HP = 150;

function getHealthCurrent(entity) {
    try {
        const health = entity.getComponent("minecraft:health");
        return health?.currentValue ?? 0;
    } catch {
        return 0;
    }
}

export function isPurpleGolem(entity) {
    return entity?.typeId === PURPLE_GOLEM_ID;
}

export function getPurpleGolemPhase(entity) {
    if (!isPurpleGolem(entity)) return 0;
    return getHealthCurrent(entity) < PHASE2_HP ? 2 : 1;
}

export function getPurpleGolemAttackDamage(entity) {
    return getPurpleGolemPhase(entity) === 2 ? 26 : 22;
}

/**
 * @param {"melee"|"projectile"|"magic"} channel
 */
export function getMobIncomingDamageMultiplier(entity, channel) {
    if (!isPurpleGolem(entity)) return 1;

    const phase = getPurpleGolemPhase(entity);

    if (phase === 2) {
        if (channel === "melee") return 0.3;       // 70% resist
        if (channel === "projectile") return 0.2;  // 80% resist
        if (channel === "magic") return 0.2;       // 80% resist
        return 1;
    }

    // Phase 1
    if (channel === "melee") return 0.5;           // 50% resist
    if (channel === "projectile") return 0.9;      // 10% resist
    if (channel === "magic") return 0.8;           // 20% resist
    return 1;
}

export function classifyDamageChannel(cause, projectile) {
    if (projectile?.typeId === "minecraft:arrow") return "projectile";
    if (
        cause === "entityAttack" ||
        cause === "maceSmash" ||
        cause === "ramAttack"
    ) {
        return "melee";
    }
    if (MAGIC_CAUSES.has(cause) || cause === "projectile") {
        // Non-arrow projectiles / spell causes count as magic for boss resists
        if (cause === "projectile" && projectile?.typeId === "minecraft:arrow") {
            return "projectile";
        }
        if (MAGIC_CAUSES.has(cause)) return "magic";
    }
    if (MAGIC_CAUSES.has(cause)) return "magic";
    return "melee";
}

export function scaleMobIncomingDamage(entity, damage, channel) {
    const multiplier = getMobIncomingDamageMultiplier(entity, channel);
    return Math.max(0, damage * multiplier);
}

export function isMagicDamageCause(cause) {
    return MAGIC_CAUSES.has(cause);
}
