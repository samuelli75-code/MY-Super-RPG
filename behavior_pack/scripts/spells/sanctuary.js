import { system } from "@minecraft/server";
import { castWithCostAndCooldown } from "./spell_casting.js";
import {
    burstParticles,
    isSpellTarget,
    playSpellImpact
} from "./spell_effects.js";
import { areFriendly } from "../systems/team_system.js";
import { getScore, setScore } from "../data/class_utils.js";
import {
    getBlessingDurationMultiplier,
    getHealingMultiplier
} from "../classes/class_registry.js";
import { syncPlayerHealth } from "../systems/stats_system.js";
import { reviveDownedPlayer } from "../systems/death_system.js";
import { recordHealingFeedback } from "../systems/combat_feedback.js";

const MP_COST = 10;
const BASE_COOLDOWN_TICKS = 400;
const RADIUS = 3;
const BASE_DURATION_TICKS = BASE_COOLDOWN_TICKS;
const HEAL_PER_SECOND = 2;
const DOME_CENTER_Y_OFFSET = 1.2;
const LIGHT_HEIGHT = 2;
const LIGHT_BLOCK_TYPES = ["minecraft:light_block_15", "minecraft:light_block"];
const BLUE_AURA_PARTICLES = [
    "minecraft:blue_flame_particle",
    "minecraft:snowflake_particle",
    "minecraft:totem_particle"
];

const activeSanctuaries = [];

function getCenter(location) {
    return {
        x: Math.floor(location.x) + 0.5,
        y: Math.floor(location.y),
        z: Math.floor(location.z) + 0.5
    };
}

function canPlaceTemporaryGlass(block) {
    return block?.typeId === "minecraft:air" || block?.typeId === "minecraft:snow_layer";
}

function isDomeShell(dx, dy, dz) {
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const shellThickness = 0.55;
    return Math.abs(distance - RADIUS) <= shellThickness;
}

function placeGlassDome(dimension, center) {
    const baseY = Math.floor(center.y);
    const sphereCenterY = center.y + DOME_CENTER_Y_OFFSET;
    const placedGlass = [];

    for (let x = Math.floor(center.x - RADIUS); x <= Math.floor(center.x + RADIUS); x++) {
        for (let y = baseY - RADIUS + 1; y <= baseY + RADIUS + 2; y++) {
            for (let z = Math.floor(center.z - RADIUS); z <= Math.floor(center.z + RADIUS); z++) {
                const dx = x + 0.5 - center.x;
                const dy = y + 0.5 - sphereCenterY;
                const dz = z + 0.5 - center.z;
                if (!isDomeShell(dx, dy, dz)) continue;

                try {
                    const block = dimension.getBlock({ x, y, z });
                    if (canPlaceTemporaryGlass(block)) {
                        block.setType("minecraft:glass");
                        placedGlass.push({ x, y, z });
                    }
                } catch {}
            }
        }
    }

    return placedGlass;
}

function removeSanctuaryGlass(dimension, placedGlass) {
    for (const position of placedGlass) {
        try {
            const block = dimension.getBlock(position);
            if (block?.typeId === "minecraft:glass") block.setType("minecraft:air");
        } catch {}
    }
}

function getLightPositions(center) {
    const y = Math.floor(center.y) + LIGHT_HEIGHT;
    const positions = [{ x: Math.floor(center.x), y, z: Math.floor(center.z) }];

    for (const [dx, dz] of [[RADIUS - 1, 0], [-(RADIUS - 1), 0], [0, RADIUS - 1], [0, -(RADIUS - 1)]]) {
        positions.push({
            x: Math.floor(center.x + dx),
            y,
            z: Math.floor(center.z + dz)
        });
    }

    return positions;
}

function trySetLightBlock(block) {
    for (const typeId of LIGHT_BLOCK_TYPES) {
        try {
            block.setType(typeId);
            return true;
        } catch {}
    }

    return false;
}

function placeSanctuaryLights(dimension, center) {
    const placedLights = [];

    for (const position of getLightPositions(center)) {
        try {
            const block = dimension.getBlock(position);
            if (block?.typeId !== "minecraft:air") continue;
            if (trySetLightBlock(block)) placedLights.push(position);
        } catch {}
    }

    return placedLights;
}

function removeSanctuaryLights(dimension, placedLights) {
    for (const position of placedLights) {
        try {
            const block = dimension.getBlock(position);
            if (block?.typeId.startsWith("minecraft:light_block")) block.setType("minecraft:air");
        } catch {}
    }
}

function spawnBlueAura(dimension, center) {
    const y = center.y + 1.1;

    for (const particleId of BLUE_AURA_PARTICLES) {
        try {
            dimension.spawnParticle(particleId, { x: center.x, y, z: center.z });
        } catch {}
    }

    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const location = {
            x: center.x + Math.cos(angle) * (RADIUS - 0.4),
            y,
            z: center.z + Math.sin(angle) * (RADIUS - 0.4)
        };

        try {
            dimension.spawnParticle("minecraft:blue_flame_particle", location);
        } catch {}
    }
}

function applySanctuaryVision(caster, entity) {
    if (entity.typeId !== "minecraft:player" || !areFriendly(caster, entity)) return;

    try {
        entity.addEffect("night_vision", 60, {
            amplifier: 0,
            showParticles: false
        });
    } catch {}
}

function pushEnemiesOut(caster, center) {
    for (const entity of caster.dimension.getEntities({ location: center, maxDistance: RADIUS + 0.8 })) {
        if (!isSpellTarget(entity) || entity.id === caster.id || areFriendly(caster, entity)) continue;

        const dx = entity.location.x - center.x;
        const dz = entity.location.z - center.z;
        const length = Math.max(0.1, Math.sqrt(dx * dx + dz * dz));
        const targetDistance = RADIUS + 1.2;
        const pushStrength = Math.max(0.8, targetDistance - length);
        const targetLocation = {
            x: center.x + (dx / length) * targetDistance,
            y: entity.location.y + 0.1,
            z: center.z + (dz / length) * targetDistance
        };

        try {
            entity.applyImpulse({
                x: (dx / length) * Math.max(1.2, pushStrength),
                y: 0.35,
                z: (dz / length) * Math.max(1.2, pushStrength)
            });
        } catch {}

        try {
            entity.teleport(targetLocation, {
                dimension: caster.dimension
            });
        } catch {}
    }
}

function getSanctuaryHealAmount(caster) {
    return Math.ceil(HEAL_PER_SECOND * getHealingMultiplier(caster));
}

function getSanctuaryDurationTicks(caster) {
    return Math.ceil(BASE_DURATION_TICKS * getBlessingDurationMultiplier(caster));
}

function healSanctuaryTarget(caster, target, amount) {
    if (target.typeId !== "minecraft:player" || !areFriendly(caster, target)) return false;

    const hp = getScore(target, "hp");
    const maxHp = getScore(target, "max_hp");
    const nextHp = Math.min(maxHp, hp + amount);
    const healed = nextHp - hp;
    if (healed <= 0) return false;

    setScore(target, "hp", nextHp);
    syncPlayerHealth(target);
    reviveDownedPlayer(target, caster);
    recordHealingFeedback(caster, target, healed);
    return true;
}

function createSanctuary(caster) {
    const center = getCenter(caster.location);
    const placedGlass = placeGlassDome(caster.dimension, center);
    const placedLights = placeSanctuaryLights(caster.dimension, center);
    const healPerSecond = getSanctuaryHealAmount(caster);
    const durationTicks = getSanctuaryDurationTicks(caster);
    pushEnemiesOut(caster, center);
    burstParticles(caster.dimension, center, [
        "minecraft:heart_particle",
        "minecraft:totem_particle"
    ]);
    spawnBlueAura(caster.dimension, center);
    playSpellImpact(caster.dimension, center, "random.levelup", 1.4, 0.8);

    activeSanctuaries.push({
        caster,
        dimension: caster.dimension,
        center,
        placedGlass,
        placedLights,
        healPerSecond,
        endTick: system.currentTick + durationTicks
    });
}

export const SANCTUARY_SPELL = {
    id: "sanctuary",
    name: "Sanctuary",
    mpCost: MP_COST,
    cooldownTicks: BASE_COOLDOWN_TICKS,
    castDirect: castSanctuary
};

export function castSanctuary(player) {
    return castWithCostAndCooldown(player, {
        id: "sanctuary",
        name: "Sanctuary",
        mpCost: MP_COST,
        cooldownTicks: BASE_COOLDOWN_TICKS,
        onCast: createSanctuary
    });
}

system.runInterval(() => {
    for (let i = activeSanctuaries.length - 1; i >= 0; i--) {
        const sanctuary = activeSanctuaries[i];
        if (system.currentTick >= sanctuary.endTick) {
            removeSanctuaryLights(sanctuary.dimension, sanctuary.placedLights ?? []);
            removeSanctuaryGlass(sanctuary.dimension, sanctuary.placedGlass ?? []);
            activeSanctuaries.splice(i, 1);
            continue;
        }

        pushEnemiesOut(sanctuary.caster, sanctuary.center);

        for (const entity of sanctuary.dimension.getEntities({
            location: sanctuary.center,
            maxDistance: RADIUS
        })) {
            healSanctuaryTarget(sanctuary.caster, entity, sanctuary.healPerSecond ?? HEAL_PER_SECOND);
            applySanctuaryVision(sanctuary.caster, entity);
        }

        burstParticles(sanctuary.dimension, sanctuary.center, ["minecraft:heart_particle"]);
        spawnBlueAura(sanctuary.dimension, sanctuary.center);
    }
}, 20);
