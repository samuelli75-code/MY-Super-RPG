import { system, world } from "@minecraft/server";
import { getEntityTeam } from "./team_system.js";

const CREDIT_TTL_TICKS = 20 * 30;
const FALLBACK_TEAM_RADIUS = 64;
const creditsByEntityId = new Map();

function getPlayerById(id) {
    return world.getAllPlayers().find((player) => player.id === id);
}

function getOwnerPlayer(entity) {
    if (!entity) return undefined;
    if (entity.typeId === "minecraft:player") return entity;

    try {
        const tameable = entity.getComponent("minecraft:tameable");
        const owner = tameable?.tamedToPlayer ?? tameable?.owner;
        if (owner?.typeId === "minecraft:player") return owner;

        const ownerId = tameable?.tamedToPlayerId ?? tameable?.ownerId;
        if (ownerId) return getPlayerById(ownerId);
    } catch {}

    return undefined;
}

function pruneCreditMap(map) {
    const oldestTick = system.currentTick - CREDIT_TTL_TICKS;
    for (const [playerId, credit] of map) {
        if (credit.tick < oldestTick || !getPlayerById(playerId)) {
            map.delete(playerId);
        }
    }
}

function distanceSquared(first, second) {
    const dx = first.x - second.x;
    const dy = first.y - second.y;
    const dz = first.z - second.z;
    return dx * dx + dy * dy + dz * dz;
}

export function recordCombatCredit(target, attacker) {
    if (!target || target.typeId === "minecraft:player") return;

    const player = getOwnerPlayer(attacker);
    if (!player) return;

    let map = creditsByEntityId.get(target.id);
    if (!map) {
        map = new Map();
        creditsByEntityId.set(target.id, map);
    }

    map.set(player.id, {
        tick: system.currentTick,
        team: getEntityTeam(player)
    });
}

export function consumeCombatCreditPlayers(dead, fallbackKiller) {
    const players = [];
    const seen = new Set();
    const map = creditsByEntityId.get(dead.id);

    if (map) {
        pruneCreditMap(map);
        for (const playerId of map.keys()) {
            const player = getPlayerById(playerId);
            if (!player || seen.has(player.id)) continue;
            players.push(player);
            seen.add(player.id);
        }
        creditsByEntityId.delete(dead.id);
    }

    if (players.length > 0) return players;

    const fallbackPlayer = getOwnerPlayer(fallbackKiller);
    if (fallbackPlayer) return [fallbackPlayer];

    const killerTeam = getEntityTeam(fallbackKiller);
    if (killerTeam <= 0) return [];

    for (const player of world.getAllPlayers()) {
        if (player.dimension.id !== dead.dimension.id) continue;
        if (getEntityTeam(player) !== killerTeam) continue;
        if (distanceSquared(player.location, dead.location) > FALLBACK_TEAM_RADIUS * FALLBACK_TEAM_RADIUS) continue;
        players.push(player);
    }

    return players;
}

system.runInterval(() => {
    for (const [entityId, map] of creditsByEntityId) {
        pruneCreditMap(map);
        if (map.size === 0) creditsByEntityId.delete(entityId);
    }
}, 20 * 10);
