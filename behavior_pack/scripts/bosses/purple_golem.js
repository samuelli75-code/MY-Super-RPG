import { system, world } from "@minecraft/server";
import { dealCustomPlayerDamage } from "../systems/combat_system.js";
import {
    getPurpleGolemPhase,
    isPurpleGolem
} from "../systems/mob_resistances.js";
import { applySlowness } from "../spells/spell_effects.js";

const BOSS_TYPE = "mysrpg:purple_golem";
const PHASE2_HP = 150;
const TICK_INTERVAL = 5;

const TELEPORT_COOLDOWN_P1 = 80;
const TELEPORT_COOLDOWN_P2 = 50;
const TELEPORT_HURT_CHANCE_P1 = 0.22;
const TELEPORT_HURT_CHANCE_P2 = 0.4;

const SANDSTORM_COOLDOWN = 160;
const SANDSTORM_DURATION = 80;
const SANDSTORM_RADIUS = 9;
const SANDSTORM_DAMAGE = 4; // per pulse, lv3
const SANDSTORM_PULSE = 10;

const LASER_COOLDOWN = 100;
const LASER_RANGE = 28;
const LASER_DAMAGE = 10; // lv3 beam hit
const LASER_STEPS = 18;

const SUMMON_COOLDOWN = 6000; // 5 minutes
const SUMMON_ENDERMITES = 5;
const SUMMON_SHULKERS = 4;

/** @type {Map<string, BossState>} */
const bossStates = new Map();

/**
 * @typedef {{
 *   lastTeleport: number,
 *   lastSandstorm: number,
 *   lastLaser: number,
 *   lastSummon: number,
 *   sandstormUntil: number,
 *   announcedPhase2: boolean
 * }} BossState
 */

function isValid(entity) {
    try {
        return Boolean(entity && entity.isValid !== false && entity.location);
    } catch {
        return false;
    }
}

function getHealth(entity) {
    try {
        const health = entity.getComponent("minecraft:health");
        return {
            current: health?.currentValue ?? 0,
            max: health?.effectiveMax ?? health?.defaultValue ?? 320
        };
    } catch {
        return { current: 0, max: 320 };
    }
}

function getState(entity) {
    let state = bossStates.get(entity.id);
    if (!state) {
        const now = system.currentTick;
        state = {
            lastTeleport: now - TELEPORT_COOLDOWN_P1,
            lastSandstorm: now - Math.floor(SANDSTORM_COOLDOWN / 2),
            lastLaser: now - Math.floor(LASER_COOLDOWN / 2),
            lastSummon: now,
            sandstormUntil: 0,
            announcedPhase2: false
        };
        bossStates.set(entity.id, state);
    }
    return state;
}

function ensureNameTag(entity, phase) {
    const label =
        phase === 2
            ? "\u00a75Purple Golem\u00a7d [Phase 2]"
            : "\u00a75Purple Golem";
    try {
        if (!entity.nameTag || !entity.nameTag.includes("Purple Golem")) {
            entity.nameTag = label;
        } else if (phase === 2 && !entity.nameTag.includes("Phase 2")) {
            entity.nameTag = label;
        }
    } catch {}
}

function announce(dimension, message) {
    try {
        for (const player of dimension.getPlayers()) {
            player.sendMessage(message);
        }
    } catch {}
}

function playBossSound(entity, soundId, pitch = 1) {
    try {
        entity.dimension.playSound(soundId, entity.location, {
            pitch,
            volume: 1.4
        });
    } catch {}
}

function spawnParticles(entity, particleId, yOffset = 1) {
    try {
        entity.dimension.spawnParticle(particleId, {
            x: entity.location.x,
            y: entity.location.y + yOffset,
            z: entity.location.z
        });
    } catch {}
}

function findNearestPlayer(entity, maxDistance = 48) {
    try {
        const players = entity.dimension.getPlayers({
            location: entity.location,
            maxDistance
        });
        let best;
        let bestDist = Infinity;
        for (const player of players) {
            const dx = player.location.x - entity.location.x;
            const dy = player.location.y - entity.location.y;
            const dz = player.location.z - entity.location.z;
            const dist = dx * dx + dy * dy + dz * dz;
            if (dist < bestDist) {
                bestDist = dist;
                best = player;
            }
        }
        return best;
    } catch {
        return undefined;
    }
}

function isSafeTeleportBlock(dimension, x, y, z) {
    try {
        const feet = dimension.getBlock({ x, y, z });
        const head = dimension.getBlock({ x, y: y + 1, z });
        const below = dimension.getBlock({ x, y: y - 1, z });
        if (!feet || !head || !below) return false;
        if (feet.typeId !== "minecraft:air" && !feet.typeId.includes("grass")) {
            // allow only passable
            if (
                feet.typeId !== "minecraft:air" &&
                feet.typeId !== "minecraft:short_grass" &&
                feet.typeId !== "minecraft:tall_grass" &&
                feet.typeId !== "minecraft:snow_layer"
            ) {
                return false;
            }
        }
        if (head.typeId !== "minecraft:air" && head.typeId !== "minecraft:snow_layer") {
            return false;
        }
        return below.typeId !== "minecraft:air" && below.typeId !== "minecraft:lava";
    } catch {
        return false;
    }
}

function tryTeleport(entity, preferredTarget) {
    const origin = preferredTarget?.location ?? entity.location;
    const dimension = entity.dimension;

    for (let attempt = 0; attempt < 16; attempt++) {
        const angle = Math.random() * Math.PI * 2;
        const distance = 4 + Math.random() * 10;
        const x = Math.floor(origin.x + Math.cos(angle) * distance);
        const z = Math.floor(origin.z + Math.sin(angle) * distance);
        const baseY = Math.floor(origin.y);

        for (const y of [baseY, baseY + 1, baseY - 1, baseY + 2, baseY - 2]) {
            if (!isSafeTeleportBlock(dimension, x, y, z)) continue;

            spawnParticles(entity, "minecraft:portal_reverse_particle", 1.2);
            playBossSound(entity, "mob.endermen.portal", 0.8);

            try {
                entity.teleport(
                    { x: x + 0.5, y, z: z + 0.5 },
                    { dimension, keepVelocity: false }
                );
            } catch {
                try {
                    entity.teleport({ x: x + 0.5, y, z: z + 0.5 });
                } catch {
                    return false;
                }
            }

            spawnParticles(entity, "minecraft:portal_reverse_particle", 1.2);
            spawnParticles(entity, "minecraft:dragon_breath_trail", 1.5);
            return true;
        }
    }

    return false;
}

function pulseSandstorm(entity) {
    const center = entity.location;
    spawnParticles(entity, "minecraft:crop_growth_emitter", 0.5);
    spawnParticles(entity, "minecraft:dragon_breath_lingering", 1.2);
    playBossSound(entity, "ambient.weather.thunder", 1.6);

    try {
        const victims = entity.dimension.getEntities({
            location: center,
            maxDistance: SANDSTORM_RADIUS
        });

        for (const victim of victims) {
            if (!isValid(victim) || victim.id === entity.id) continue;
            if (victim.typeId !== "minecraft:player") continue;

            dealCustomPlayerDamage(victim, SANDSTORM_DAMAGE, entity, "magic");
            applySlowness(victim, 40, 2);
            try {
                victim.addEffect("blindness", 30, {
                    amplifier: 0,
                    showParticles: false
                });
            } catch {}
        }
    } catch {}
}

function castSandstorm(entity, state) {
    state.sandstormUntil = system.currentTick + SANDSTORM_DURATION;
    state.lastSandstorm = system.currentTick;
    announce(
        entity.dimension,
        "\u00a75Purple Golem\u00a7d casts Sandstorm Lv.3!"
    );
    playBossSound(entity, "beacon.activate", 0.6);
    pulseSandstorm(entity);
}

function castLaser(entity, state) {
    const target = findNearestPlayer(entity, LASER_RANGE);
    if (!target) return false;

    state.lastLaser = system.currentTick;
    announce(
        entity.dimension,
        "\u00a75Purple Golem\u00a7d fires Laser Lv.3!"
    );
    playBossSound(entity, "mob.guardian.attack", 0.5);

    const start = {
        x: entity.location.x,
        y: entity.location.y + 2.4,
        z: entity.location.z
    };
    const end = {
        x: target.location.x,
        y: target.location.y + 1.2,
        z: target.location.z
    };

    for (let i = 1; i <= LASER_STEPS; i++) {
        const t = i / LASER_STEPS;
        const point = {
            x: start.x + (end.x - start.x) * t,
            y: start.y + (end.y - start.y) * t,
            z: start.z + (end.z - start.z) * t
        };
        try {
            entity.dimension.spawnParticle("minecraft:endrod", point);
            entity.dimension.spawnParticle(
                "minecraft:dragon_breath_trail",
                point
            );
        } catch {}
    }

    dealCustomPlayerDamage(target, LASER_DAMAGE, entity, "magic");
    try {
        target.addEffect("slowness", 40, {
            amplifier: 1,
            showParticles: true
        });
    } catch {}
    return true;
}

function spawnSummon(entity, typeId, offset) {
    try {
        const location = {
            x: entity.location.x + offset.x,
            y: entity.location.y,
            z: entity.location.z + offset.z
        };
        const spawned = entity.dimension.spawnEntity(typeId, location);
        try {
            spawned.addTag("mysrpg_purple_golem_summon");
        } catch {}
        return spawned;
    } catch {
        return undefined;
    }
}

function castSummon(entity, state) {
    state.lastSummon = system.currentTick;
    announce(
        entity.dimension,
        "\u00a75Purple Golem\u00a7d summons Endermites and Shulkers!"
    );
    playBossSound(entity, "mob.evocation_illager.prepare_summon", 0.9);

    for (let i = 0; i < SUMMON_ENDERMITES; i++) {
        const angle = (Math.PI * 2 * i) / SUMMON_ENDERMITES;
        spawnSummon(entity, "minecraft:endermite", {
            x: Math.cos(angle) * 2.5,
            z: Math.sin(angle) * 2.5
        });
    }

    for (let i = 0; i < SUMMON_SHULKERS; i++) {
        const angle = (Math.PI * 2 * i) / SUMMON_SHULKERS + 0.4;
        spawnSummon(entity, "minecraft:shulker", {
            x: Math.cos(angle) * 4,
            z: Math.sin(angle) * 4
        });
    }

    spawnParticles(entity, "minecraft:dragon_death_explosion_emitter", 1);
}

function updateBoss(entity) {
    if (!isValid(entity) || !isPurpleGolem(entity)) return;

    const state = getState(entity);
    const health = getHealth(entity);
    const phase = health.current < PHASE2_HP ? 2 : 1;
    const now = system.currentTick;

    ensureNameTag(entity, phase);

    if (phase === 2 && !state.announcedPhase2) {
        state.announcedPhase2 = true;
        announce(
            entity.dimension,
            "\u00a75Purple Golem\u00a7c enters Phase 2!"
        );
        playBossSound(entity, "mob.wither.spawn", 1.2);
        tryTeleport(entity, findNearestPlayer(entity));
        state.lastTeleport = now;
        // First phase-2 summon comes quickly, then every 5 minutes.
        state.lastSummon = now - SUMMON_COOLDOWN;
        state.lastSandstorm = now - SANDSTORM_COOLDOWN;
        state.lastLaser = now - LASER_COOLDOWN;
    }

    // Ambient purple flair
    if (now % 20 < TICK_INTERVAL) {
        spawnParticles(entity, "minecraft:dragon_breath_trail", 2.2);
    }

    const target = findNearestPlayer(entity, 48);
    const teleportCooldown =
        phase === 2 ? TELEPORT_COOLDOWN_P2 : TELEPORT_COOLDOWN_P1;

    if (target && now - state.lastTeleport >= teleportCooldown) {
        if (tryTeleport(entity, target)) {
            state.lastTeleport = now;
        }
    }

    if (phase !== 2) return;

    if (state.sandstormUntil > now && now % SANDSTORM_PULSE < TICK_INTERVAL) {
        pulseSandstorm(entity);
    }

    if (now - state.lastSandstorm >= SANDSTORM_COOLDOWN) {
        castSandstorm(entity, state);
    }

    if (now - state.lastLaser >= LASER_COOLDOWN) {
        castLaser(entity, state);
    }

    if (now - state.lastSummon >= SUMMON_COOLDOWN) {
        castSummon(entity, state);
    }
}

world.afterEvents.entityHurt.subscribe((event) => {
    const entity = event.hurtEntity;
    if (!isPurpleGolem(entity) || !isValid(entity)) return;

    const state = getState(entity);
    const phase = getPurpleGolemPhase(entity);
    const chance =
        phase === 2 ? TELEPORT_HURT_CHANCE_P2 : TELEPORT_HURT_CHANCE_P1;
    const cooldown =
        phase === 2 ? TELEPORT_COOLDOWN_P2 : TELEPORT_COOLDOWN_P1;

    if (
        Math.random() < chance &&
        system.currentTick - state.lastTeleport >= Math.floor(cooldown * 0.5)
    ) {
        system.run(() => {
            if (!isValid(entity)) return;
            if (tryTeleport(entity, findNearestPlayer(entity))) {
                state.lastTeleport = system.currentTick;
            }
        });
    }
});

world.afterEvents.entityDie.subscribe((event) => {
    if (isPurpleGolem(event.deadEntity)) {
        bossStates.delete(event.deadEntity.id);
        announce(
            event.deadEntity.dimension,
            "\u00a75Purple Golem\u00a7a has been defeated!"
        );
    }
});

world.afterEvents.entitySpawn.subscribe((event) => {
    const entity = event.entity;
    if (!isPurpleGolem(entity)) return;

    system.run(() => {
        if (!isValid(entity)) return;
        ensureNameTag(entity, 1);
        getState(entity);
        spawnParticles(entity, "minecraft:dragon_death_explosion_emitter", 1);
        announce(
            entity.dimension,
            "\u00a75A Purple Golem boss has awakened!"
        );
    });
});

system.runInterval(() => {
    const active = new Set();

    for (const player of world.getAllPlayers()) {
        try {
            for (const entity of player.dimension.getEntities({
                type: BOSS_TYPE,
                location: player.location,
                maxDistance: 96
            })) {
                active.add(entity.id);
                updateBoss(entity);
            }
        } catch {}
    }

    for (const id of bossStates.keys()) {
        if (!active.has(id)) bossStates.delete(id);
    }
}, TICK_INTERVAL);
