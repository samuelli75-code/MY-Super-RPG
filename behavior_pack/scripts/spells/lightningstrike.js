import { castWithCostAndCooldown } from "./spell_casting.js";
import {
    burstParticles,
    damageSpellTarget,
    isSpellTarget,
    playSpellImpact
} from "./spell_effects.js";
import { areFriendly } from "../systems/team_system.js";
import {
    launchSpellProjectile,
    SPELL_HIT_MODES
} from "./spell_projectile.js";

const MP_COST = 1;
const MARK_DAMAGE = 1;
const STRIKE_DAMAGE = 30;
const SPREAD_RADIUS = 12;
const MAX_MARKS = 5;
const BASE_COOLDOWN_TICKS = 4;
const marksByEntityId = new Map();

function getMarks(entity) {
    return marksByEntityId.get(entity.id) ?? 0;
}

function setMarks(entity, amount) {
    if (amount <= 0) {
        marksByEntityId.delete(entity.id);
        return;
    }

    marksByEntityId.set(entity.id, amount);
}

function spawnLightning(dimension, location) {
    try {
        dimension.spawnEntity("minecraft:lightning_bolt", location);
        return;
    } catch {}

    burstParticles(dimension, location, [
        "minecraft:totem_particle",
        "minecraft:blue_flame_particle"
    ]);
}

function shock(owner, target, damage) {
    spawnLightning(target.dimension, target.location);
    damageSpellTarget(owner, target, damage, "lightning");
    playSpellImpact(target.dimension, target.location, "ambient.weather.thunder", 1, 0.8);
}

function spreadLightning(owner, center, primaryTarget) {
    for (const entity of owner.dimension.getEntities({ location: center, maxDistance: SPREAD_RADIUS })) {
        if (
            !isSpellTarget(entity) ||
            entity.id === owner.id ||
            entity.id === primaryTarget.id ||
            areFriendly(owner, entity)
        ) {
            continue;
        }

        const marks = getMarks(entity);
        if (marks <= 0) continue;

        shock(owner, entity, marks * 6);
        setMarks(entity, 0);
    }
}

function markHit(owner, target, location) {
    if (!isSpellTarget(target) || target.id === owner.id || areFriendly(owner, target)) return;

    damageSpellTarget(owner, target, MARK_DAMAGE, "lightning");
    const marks = getMarks(target) + 1;

    burstParticles(target.dimension, target.location, [
        "minecraft:totem_particle",
        "minecraft:blue_flame_particle"
    ]);

    if (marks < MAX_MARKS) {
        setMarks(target, marks);
        playSpellImpact(target.dimension, target.location, "random.orb", 1 + marks * 0.1, 0.5);
        return;
    }

    setMarks(target, 0);
    shock(owner, target, STRIKE_DAMAGE);
    spreadLightning(owner, location ?? target.location, target);
}

export const LIGHTNINGSTRIKE_SPELL = {
    id: "lightningstrike",
    name: "Lightningstrike",
    mpCost: MP_COST,
    cooldownTicks: BASE_COOLDOWN_TICKS,
    projectile: {
        projectileType: "mysrpg:lightningstrike_projectile",
        hitDistance: 1.6,
        castParticles: ["minecraft:totem_particle"],
        trailParticles: ["minecraft:blue_flame_particle"],
        castSound: {
            id: "random.bow",
            options: { pitch: 1.6, volume: 0.7 }
        },
        onHitEntity: markHit
    }
};

export function castLightningstrike(player) {
    return castWithCostAndCooldown(player, {
        id: LIGHTNINGSTRIKE_SPELL.id,
        name: LIGHTNINGSTRIKE_SPELL.name,
        mpCost: LIGHTNINGSTRIKE_SPELL.mpCost,
        cooldownTicks: LIGHTNINGSTRIKE_SPELL.cooldownTicks,
        onCast: (caster) => launchSpellProjectile(caster, {
            name: LIGHTNINGSTRIKE_SPELL.name,
            hitMode: SPELL_HIT_MODES.ENTITY_ONLY,
            ...LIGHTNINGSTRIKE_SPELL.projectile
        })
    });
}
