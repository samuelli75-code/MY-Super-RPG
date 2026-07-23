import { castWithCostAndCooldown } from "./spell_casting.js";
import {
    applyFrozen,
    burstParticles,
    damageSpellTarget,
    playSpellImpact
} from "./spell_effects.js";
import {
    launchSpellProjectile,
    SPELL_HIT_MODES
} from "./spell_projectile.js";

const MP_COST = 1;
const BASE_DAMAGE = 6;
const BASE_COOLDOWN_TICKS = 20;
const SLOW_TICKS = 100;

function freezeHit(owner, target, location) {
    if (!damageSpellTarget(owner, target, BASE_DAMAGE, "magic")) return;
    applyFrozen(target, SLOW_TICKS);
    burstParticles(owner.dimension, location, [
        "minecraft:snowflake_particle",
        "minecraft:ice_evaporation_emitter"
    ]);
    playSpellImpact(owner.dimension, location, "random.glass", 1.5, 0.8);
}

export const ICEBOLT_SPELL = {
    id: "icebolt",
    name: "Icebolt",
    mpCost: MP_COST,
    cooldownTicks: BASE_COOLDOWN_TICKS,
    projectile: {
        projectileType: "mysrpg:icebolt_projectile",
        hitDistance: 1.5,
        castParticles: ["minecraft:snowflake_particle"],
        trailParticles: ["minecraft:snowflake_particle"],
        castSound: {
            id: "mob.snowgolem.shoot",
            options: { pitch: 1.2, volume: 0.8 }
        },
        onHitEntity: freezeHit,
        onHitBlock: (owner, location) => {
            burstParticles(owner.dimension, location, ["minecraft:snowflake_particle"]);
            playSpellImpact(owner.dimension, location, "random.glass", 1.5, 0.5);
        }
    }
};

export function castIcebolt(player) {
    return castWithCostAndCooldown(player, {
        id: ICEBOLT_SPELL.id,
        name: ICEBOLT_SPELL.name,
        mpCost: ICEBOLT_SPELL.mpCost,
        cooldownTicks: ICEBOLT_SPELL.cooldownTicks,
        onCast: (caster) => launchSpellProjectile(caster, {
            name: ICEBOLT_SPELL.name,
            hitMode: SPELL_HIT_MODES.ENTITY_ONLY,
            ...ICEBOLT_SPELL.projectile
        })
    });
}
