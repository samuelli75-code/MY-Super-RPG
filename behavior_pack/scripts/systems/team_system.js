import { system, world } from "@minecraft/server";
import { getScore, setScore } from "../data/class_utils.js";

const DEFAULT_TEAM = 1;
const TEAM_TAG_PREFIX = "mysrpg_team:";
const PET_TYPES = [
    "minecraft:wolf",
    "minecraft:cat",
    "minecraft:parrot",
    "minecraft:horse",
    "minecraft:donkey",
    "minecraft:mule",
    "minecraft:llama",
    "minecraft:trader_llama"
];
const DIMENSION_NAMES = ["overworld", "nether", "the_end"];
const PET_SCAN_INTERVAL_TICKS = 10;
let petScanIndex = 0;

function getTeamTag(team) {
    return `${TEAM_TAG_PREFIX}${team}`;
}

function clearTeamTags(entity) {
    try {
        for (const tag of entity.getTags()) {
            if (tag.startsWith(TEAM_TAG_PREFIX)) entity.removeTag(tag);
        }
    } catch {}
}

export function getEntityTeam(entity) {
    if (!entity) return 0;

    if (entity.typeId === "minecraft:player") {
        return getScore(entity, "team");
    }

    try {
        const tag = entity.getTags().find((value) => value.startsWith(TEAM_TAG_PREFIX));
        if (!tag) return 0;
        return Number(tag.slice(TEAM_TAG_PREFIX.length)) || 0;
    } catch {
        return 0;
    }
}

export function setEntityTeam(entity, team) {
    const safeTeam = Math.max(0, Math.floor(team));

    if (entity.typeId === "minecraft:player") {
        setScore(entity, "team", safeTeam);
        return;
    }

    clearTeamTags(entity);
    if (safeTeam > 0) {
        try {
            entity.addTag(getTeamTag(safeTeam));
        } catch {}
    }
}

export function areFriendly(first, second) {
    const firstTeam = getEntityTeam(first);
    return firstTeam > 0 && firstTeam === getEntityTeam(second);
}

function getPetOwner(tameable) {
    try {
        return tameable.tamedToPlayer ?? tameable.owner;
    } catch {
        return undefined;
    }
}

function getPetOwnerId(tameable) {
    try {
        return tameable.tamedToPlayerId ?? tameable.ownerId;
    } catch {
        return undefined;
    }
}

function findOwnerById(ownerId) {
    if (!ownerId) return undefined;
    return world.getAllPlayers().find((player) => player.id === ownerId);
}

function syncPetTeam(entity) {
    let tameable;

    try {
        tameable = entity.getComponent("minecraft:tameable");
    } catch {}

    let isTamed = false;
    try {
        isTamed = Boolean(
            entity.getComponent("minecraft:is_tamed") ||
            entity.hasComponent?.("minecraft:is_tamed")
        );
    } catch {}

    if (!tameable && !isTamed) return;

    const owner = tameable
        ? getPetOwner(tameable) ?? findOwnerById(getPetOwnerId(tameable))
        : undefined;
    if (!owner && !isTamed) return;

    const ownerTeam = owner ? getEntityTeam(owner) : DEFAULT_TEAM;

    if (ownerTeam > 0 && getEntityTeam(entity) !== ownerTeam) {
        setEntityTeam(entity, ownerTeam);
    }
}

function initializePlayerTeam(player) {
    if (getEntityTeam(player) !== DEFAULT_TEAM) {
        setEntityTeam(player, DEFAULT_TEAM);
    }
}

world.afterEvents.playerSpawn.subscribe((event) => {
    system.runTimeout(() => initializePlayerTeam(event.player), 45);
});

system.runInterval(() => {
    for (const player of world.getAllPlayers()) initializePlayerTeam(player);

    const dimensionIndex =
        Math.floor(petScanIndex / PET_TYPES.length) % DIMENSION_NAMES.length;
    const typeIndex = petScanIndex % PET_TYPES.length;
    petScanIndex =
        (petScanIndex + 1) % (DIMENSION_NAMES.length * PET_TYPES.length);

    try {
        const dimension = world.getDimension(DIMENSION_NAMES[dimensionIndex]);
        for (const entity of dimension.getEntities({ type: PET_TYPES[typeIndex] })) {
            syncPetTeam(entity);
        }
    } catch {}
}, PET_SCAN_INTERVAL_TICKS);
