import { world, system } from "@minecraft/server";
import { SPAWNER_LIST } from "../data/spwaner_list.js";
import { BlockPermutation } from "@minecraft/server";

const CHECK_INTERVAL_TICKS = 20 * 60 * 10;
const RETRY_TICKS = 20 * 5;
const DIMENSION_NAMES = ["overworld", "nether", "the_end"];
const DISABLED_SPAWNER_ENTITY_TYPES = [
    "mysrpg:class_master"
];

const AIR_BLOCKS = new Set([
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air"
]);
const REPLACEABLE_FEET_BLOCKS = new Set([
    ...AIR_BLOCKS,
    "minecraft:snow_layer"
]);

// Blocks that must not be the floor under a spawn point
const UNSAFE_FLOOR_BLOCKS = new Set([
    "minecraft:air",
    "minecraft:cave_air",
    "minecraft:void_air",
    "minecraft:water",
    "minecraft:flowing_water",
    "minecraft:lava",
    "minecraft:flowing_lava",
    "minecraft:fire",
    "minecraft:soul_fire",
    "minecraft:magma",
    "minecraft:cactus",
    "minecraft:sweet_berry_bush"
]);

const SAFE_SURFACE_BLOCKS = new Set([
    "minecraft:grass",
    "minecraft:grass_block",
    "minecraft:dirt",
    "minecraft:coarse_dirt",
    "minecraft:podzol",
    "minecraft:mycelium",
    "minecraft:moss_block",
    "minecraft:mud",
    "minecraft:muddy_mangrove_roots",
    "minecraft:sand",
    "minecraft:red_sand",
    "minecraft:gravel",
    "minecraft:snow",
    "minecraft:snow_layer"
]);

const TREE_AND_PLANT_BLOCKS = new Set([
    "minecraft:leaves",
    "minecraft:leaves2",
    "minecraft:azalea_leaves",
    "minecraft:azalea_leaves_flowered",
    "minecraft:mangrove_leaves",
    "minecraft:cherry_leaves",
    "minecraft:log",
    "minecraft:log2",
    "minecraft:oak_log",
    "minecraft:birch_log",
    "minecraft:spruce_log",
    "minecraft:jungle_log",
    "minecraft:acacia_log",
    "minecraft:dark_oak_log",
    "minecraft:mangrove_log",
    "minecraft:cherry_log",
    "minecraft:vine",
    "minecraft:web"
]);

const CAMPFIRE_OFFSETS = [
    { x: 2, z: 0 },
    { x: -2, z: 0 },
    { x: 0, z: 2 },
    { x: 0, z: -2 },
    { x: 1, z: 1 },
    { x: -1, z: 1 },
    { x: 1, z: -1 },
    { x: -1, z: -1 }
];

const runtimeState = new Map();

function getState(config) {
    if (!runtimeState.has(config.id)) {
        runtimeState.set(config.id, {
            despawnTick: 0,
            campfireLocation: undefined,
            nextSpawnTick: getTick() + (config.initialDelayTicks ?? 0)
        });
    }

    return runtimeState.get(config.id);
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getTick() {
    return system.currentTick ?? 0;
}

function getAbsoluteWorldTime() {
    try {
        if (typeof world.getAbsoluteTime === "function") {
            return world.getAbsoluteTime();
        }
    } catch {}

    return getTick();
}

function getTimeOfDay() {
    try {
        if (typeof world.getTimeOfDay === "function") {
            return world.getTimeOfDay();
        }
    } catch {}

    return getAbsoluteWorldTime() % 24000;
}

function isDaylight() {
    const timeOfDay = getTimeOfDay();
    return timeOfDay >= 0 && timeOfDay < 12000;
}

function isSpawnTimeAllowed(config) {
    if (typeof config.minAbsoluteTime === "number" &&
        getAbsoluteWorldTime() < config.minAbsoluteTime) {
        return false;
    }

    if (config.daylightOnly && !isDaylight()) return false;

    return true;
}

function isValidEntity(entity) {
    try {
        if (!entity) return false;
        if (typeof entity.isValid === "function") return entity.isValid();
        return entity.isValid !== false;
    } catch {
        return false;
    }
}

function isDimensionAllowed(config, dimension) {
    return !config.dimensionIds || config.dimensionIds.includes(dimension.id);
}

function getBlock(dimension, location) {
    try {
        return dimension.getBlock(location);
    } catch {
        return undefined;
    }
}

function isAirBlock(typeId) {
    return AIR_BLOCKS.has(typeId);
}

function isOpenFeetBlock(typeId) {
    return REPLACEABLE_FEET_BLOCKS.has(typeId);
}

function isSafeFloor(typeId) {
    return !!typeId &&
        SAFE_SURFACE_BLOCKS.has(typeId) &&
        !UNSAFE_FLOOR_BLOCKS.has(typeId) &&
        !TREE_AND_PLANT_BLOCKS.has(typeId);
}

function hasOpenSky(dimension, location) {
    for (let offset = 2; offset <= 12; offset++) {
        const typeId = getBlock(dimension, {
            x: location.x,
            y: location.y + offset,
            z: location.z
        })?.typeId;

        if (!typeId || !isAirBlock(typeId)) return false;
    }

    return true;
}

function isSafeSpawnLocation(dimension, location) {
    const feet = getBlock(dimension, location)?.typeId;
    const head = getBlock(dimension, {
        x: location.x,
        y: location.y + 1,
        z: location.z
    })?.typeId;
    const floor = getBlock(dimension, {
        x: location.x,
        y: location.y - 1,
        z: location.z
    })?.typeId;

    if (!isOpenFeetBlock(feet) || !isAirBlock(head) || !isSafeFloor(floor)) {
        return false;
    }

    if (!hasOpenSky(dimension, location)) return false;

    // Require a small, flat clearing so the NPC is not wedged in rock or foliage.
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const nearbyFeet = getBlock(dimension, {
                x: location.x + dx,
                y: location.y,
                z: location.z + dz
            })?.typeId;
            const nearbyHead = getBlock(dimension, {
                x: location.x + dx,
                y: location.y + 1,
                z: location.z + dz
            })?.typeId;
            const nearbyFloor = getBlock(dimension, {
                x: location.x + dx,
                y: location.y - 1,
                z: location.z + dz
            })?.typeId;

            if (
                !isOpenFeetBlock(nearbyFeet) ||
                !isAirBlock(nearbyHead) ||
                !isSafeFloor(nearbyFloor)
            ) {
                return false;
            }
        }
    }

    return true;
}

function findSafeY(dimension, x, startY, z, area) {
    const topY    = Math.floor(startY + (area.ySearchUp   ?? 32));
    const bottomY = Math.floor(startY - (area.ySearchDown ?? 96));

    for (let y = topY; y >= bottomY; y--) {
        const location = { x, y, z };
        if (isSafeSpawnLocation(dimension, location)) return location;
    }

    return undefined;
}

function findSafeLocationInRadius(player, area, maxDistance, attempts) {
    const minDistance = Math.min(area.minDistance ?? 0, maxDistance);

    for (let attempt = 0; attempt < attempts; attempt++) {
        const angle    = Math.random() * Math.PI * 2;
        const distance = randomInt(minDistance, maxDistance);
        const x        = Math.floor(player.location.x + Math.cos(angle) * distance);
        const z        = Math.floor(player.location.z + Math.sin(angle) * distance);
        const location = findSafeY(player.dimension, x, Math.floor(player.location.y), z, area);

        if (location) return location;
    }

    return undefined;
}

function getAroundPlayerSafeLocation(player, area) {
    const radius          = area.radius          ?? 200;
    const preferredRadius = Math.min(area.preferredRadius ?? 48, radius);
    const attempts        = area.attempts        ?? 48;

    const preferred = findSafeLocationInRadius(player, area, preferredRadius, attempts);
    if (preferred) return preferred;

    return findSafeLocationInRadius(player, area, radius, attempts);
}

// Find a safe location near an existing entity (used by class_master to stay near camp_merchant)
function getNearEntityLocation(area) {
    const anchor = findEntityByTag(area.anchorTag);
    if (!anchor || !isValidEntity(anchor)) return undefined;

    const radius   = area.radius   ?? 4;
    const attempts = area.attempts ?? 16;

    for (let i = 0; i < attempts; i++) {
        const angle    = Math.random() * Math.PI * 2;
        const distance = randomInt(1, radius);
        const x        = Math.floor(anchor.location.x + Math.cos(angle) * distance);
        const z        = Math.floor(anchor.location.z + Math.sin(angle) * distance);
        const location = findSafeY(anchor.dimension, x, Math.floor(anchor.location.y), z, area);

        if (location) return location;
    }

    return undefined;
}

function findEntityByTag(tag) {
    for (const dimensionName of DIMENSION_NAMES) {
        try {
            const dimension = world.getDimension(dimensionName);
            const entities  = dimension.getEntities({ tags: [tag] });
            const entity    = entities.find(isValidEntity);
            if (entity) return entity;
        } catch {
            // Dimension may not be available yet
        }
    }

    return undefined;
}

function getSpawnLocation(config, player) {
    const area = config.spawnArea;

    if (!area || area.mode === "around_player") {
        return {
            x: Math.floor(player.location.x + randomInt(area?.x?.min ?? -4, area?.x?.max ?? 4)),
            y: Math.floor(player.location.y + randomInt(area?.y?.min ?? 0,  area?.y?.max ?? 0)),
            z: Math.floor(player.location.z + randomInt(area?.z?.min ?? -4, area?.z?.max ?? 4))
        };
    }

    if (area.mode === "around_player_safe") {
        return getAroundPlayerSafeLocation(player, area);
    }

    if (area.mode === "near_entity") {
        return getNearEntityLocation(area);
    }

    if (area.mode === "box") {
        return {
            x: randomInt(area.min.x, area.max.x),
            y: randomInt(area.min.y, area.max.y),
            z: randomInt(area.min.z, area.max.z)
        };
    }

    throw new Error(`Unknown spawn area mode: ${area.mode}`);
}

function findSpawnedEntity(config) {
    for (const dimensionName of DIMENSION_NAMES) {
        try {
            const dimension = world.getDimension(dimensionName);
            const entities  = dimension.getEntities({ type: config.entityTypeId });
            const entity    = entities.find((candidate) => candidate.hasTag(config.tag) && isValidEntity(candidate));
            if (entity) return entity;
        } catch {
            // Dimension may not be available while scripts are starting.
        }
    }

    return undefined;
}

function configureSpawnedEntity(entity, config) {
    entity.addTag(config.tag);
    entity.addTag(`mysrpg_spawner:${config.id}`);

    for (const tag of config.extraTags ?? []) entity.addTag(tag);
    if (config.nameTag) entity.nameTag = config.nameTag;
}

function tryPlaceCampfire(dimension, spawnLocation) {
    for (const offset of CAMPFIRE_OFFSETS) {
        const location = {
            x: spawnLocation.x + offset.x,
            y: spawnLocation.y,
            z: spawnLocation.z + offset.z
        };
        const block = getBlock(dimension, location);
        const floor = getBlock(dimension, { x: location.x, y: location.y - 1, z: location.z });

        if (!block || !floor) continue;
        if (!isOpenFeetBlock(block.typeId) || !isSafeFloor(floor.typeId)) continue;

        try {
            block.setType("minecraft:campfire");
            return location;
        } catch {
            // Try another nearby position.
        }
    }

    return undefined;
}

function extinguishCampfire(dimension, location) {
    if (!dimension || !location) return;

    try {
        const block = getBlock(dimension, location);
        if (block?.typeId === "minecraft:campfire") {
            try {
                block.setPermutation(block.permutation.withState("extinguished_bit", true));
                return;
            } catch {}

            try {
                block.setPermutation(BlockPermutation.resolve("minecraft:campfire", {
                    extinguished_bit: true
                }));
            } catch {}
        }
    } catch {}
}

function cleanupDisabledSpawnerEntities() {
    for (const dimensionName of DIMENSION_NAMES) {
        try {
            const dimension = world.getDimension(dimensionName);

            for (const type of DISABLED_SPAWNER_ENTITY_TYPES) {
                for (const entity of dimension.getEntities({ type })) {
                    removeEntity(entity);
                }
            }
        } catch {}
    }
}

function notifySpawn(config, player, location) {
    const x       = Math.floor(location.x);
    const y       = Math.floor(location.y);
    const z       = Math.floor(location.z);
    const message = `\u00a76${config.spawnMessage ?? config.nameTag ?? config.id} \u00a7eat X:${x} Y:${y} Z:${z}`;

    for (const target of world.getAllPlayers()) {
        if (target.dimension.id !== player.dimension.id) continue;
        target.sendMessage(message);

        try {
            target.playSound("random.levelup");
        } catch {
            // Sound support differs between Script API versions.
        }
    }
}

function removeEntity(entity) {
    try {
        if (isValidEntity(entity)) entity.remove();
    } catch {
        // Entity may already be gone.
    }
}

function choosePlayer(config) {
    const players = world.getAllPlayers().filter((player) => isDimensionAllowed(config, player.dimension));
    if (players.length === 0) return undefined;

    return players[randomInt(0, players.length - 1)];
}

function spawnNpc(config, state, tick) {
    clearStoredCampfire(state);

    // For near_entity mode we don't need a player reference; pass a dummy for notifySpawn
    let player = null;

    if (config.spawnArea?.mode !== "near_entity") {
        player = choosePlayer(config);
        if (!player) return;
    }

    const location = getSpawnLocation(config, player);

    if (!location) {
        state.nextSpawnTick = tick + RETRY_TICKS;
        return;
    }

    // For near_entity, determine which dimension the anchor is in
    const dimension = config.spawnArea?.mode === "near_entity"
        ? findEntityByTag(config.spawnArea.anchorTag)?.dimension
        : player.dimension;

    if (!dimension) {
        state.nextSpawnTick = tick + RETRY_TICKS;
        return;
    }

    try {
        const entity = dimension.spawnEntity(config.entityTypeId, location);
        configureSpawnedEntity(entity, config);
        if (!isValidEntity(entity)) throw new Error("Spawned entity is not valid");

        state.despawnTick    = tick + config.aliveTicks;
        state.nextSpawnTick  = state.despawnTick + config.respawnTicks;

        if (config.placeCampfire) {
            state.campfireLocation = tryPlaceCampfire(dimension, location);
        }

        // notifySpawn needs a player from the same dimension for filtering
        const notifyPlayer = player ?? world.getAllPlayers().find(
            (p) => p.dimension.id === dimension.id
        );
        if (notifyPlayer) notifySpawn(config, notifyPlayer, location);
    } catch (error) {
        console.warn(`[SpawnerSystem] Failed to spawn ${config.id} (${config.entityTypeId}): ${error}`);
        state.nextSpawnTick = tick + RETRY_TICKS;
    }
}

function clearStoredCampfire(state) {
    if (!state.campfireLocation) return;

    for (const dimensionName of DIMENSION_NAMES) {
        try {
            extinguishCampfire(
                world.getDimension(dimensionName),
                state.campfireLocation
            );
        } catch {}
    }

    state.campfireLocation = undefined;
}

function updateSpawner(config, tick) {
    const state  = getState(config);
    const entity = findSpawnedEntity(config);

    if (entity) {
        const currentLocation = {
            x: Math.floor(entity.location.x),
            y: Math.floor(entity.location.y),
            z: Math.floor(entity.location.z)
        };

        if (!isSafeSpawnLocation(entity.dimension, currentLocation)) {
            extinguishCampfire(entity.dimension, state.campfireLocation);
            state.campfireLocation = undefined;
            removeEntity(entity);
            state.despawnTick = 0;
            state.nextSpawnTick = tick + RETRY_TICKS;
            return;
        }

        // Permanent NPCs stay forever — never despawn
        if (config.permanent) return;

        if (tick < state.despawnTick) return;

        removeEntity(entity);
        extinguishCampfire(entity.dimension, state.campfireLocation);
        state.campfireLocation = undefined;
        state.nextSpawnTick = tick + config.respawnTicks;
        return;
    }

    clearStoredCampfire(state);

    if (tick < state.nextSpawnTick) return;
    if (!isSpawnTimeAllowed(config)) return;

    // For near_entity mode, wait until the anchor NPC is alive before spawning
    if (config.spawnArea?.mode === "near_entity") {
        const anchor = findEntityByTag(config.spawnArea.anchorTag);
        if (!anchor || !isValidEntity(anchor)) return;
    }

    spawnNpc(config, state, tick);
}

system.runTimeout(() => cleanupDisabledSpawnerEntities(), 20);

system.runInterval(() => {
    const tick = getTick();

    cleanupDisabledSpawnerEntities();

    for (const config of SPAWNER_LIST) {
        updateSpawner(config, tick);
    }
}, CHECK_INTERVAL_TICKS);

console.warn("Spawner system loaded");
