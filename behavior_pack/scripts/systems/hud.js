import { system, world } from "@minecraft/server";
import {
    getClassLevel,
    getPlayerClass,
    getScore,
    getTotalExp
} from "../data/class_utils.js";
import { getMoney } from "./economy_core.js";
import {
    getEntityHealth,
    getRecentDamageFeedback,
    getRecentHealingFeedback
} from "./combat_feedback.js";
import { areFriendly } from "./team_system.js";

const COLOR = "\u00a7";
const DIVIDER = "\u2500".repeat(18);
const FOCUS_RANGE = 32;
const FOCUS_DOT = 0.92;
const ALLY_RANGE = 12;
const MAX_ALLY_LINES = 3;
const FOCUS_MARKER_PREFIX = `${COLOR}c\u25bc${COLOR}r `;
const FOCUS_PARTICLE = "minecraft:endrod";

const CLASS_ICON = {
    warrior: `${COLOR}c\u2694${COLOR}r`,
    mage: `${COLOR}b\u2726${COLOR}r`,
    priest: `${COLOR}e\u271a${COLOR}r`,
    archer: `${COLOR}a\u27b6${COLOR}r`,
    noclass: `${COLOR}7\u25cb${COLOR}r`
};

const IGNORE_TYPES = new Set([
    "minecraft:item",
    "minecraft:xp_orb",
    "minecraft:arrow",
    "minecraft:thrown_trident",
    "minecraft:snowball",
    "minecraft:egg",
    "minecraft:ender_pearl",
    "minecraft:fishing_hook",
    "minecraft:armor_stand",
    "minecraft:painting",
    "minecraft:item_frame",
    "minecraft:glow_item_frame",
    "minecraft:lightning_bolt",
    "minecraft:tnt",
    "mysrpg:camp_merchant",
    "mysrpg:class_master",
    "mysrpg:firebolt_projectile",
    "mysrpg:flameburst_projectile",
    "mysrpg:frostball_projectile",
    "mysrpg:icebolt_projectile",
    "mysrpg:lightningstrike_projectile"
]);

/** @type {Map<string, { entity: any, originalNameTag: string }>} */
const playerFocusMarkers = new Map();

function bar(current, maximum, length = 10, color = "a") {
    const ratio = Math.min(1, Math.max(0, current / Math.max(1, maximum)));
    const filled = Math.round(ratio * length);
    return (
        `${COLOR}${color}${"\u2588".repeat(filled)}` +
        `${COLOR}8${"\u2591".repeat(length - filled)}${COLOR}r`
    );
}

function isEntityValid(entity) {
    try {
        return Boolean(entity && entity.isValid !== false && entity.location);
    } catch {
        return false;
    }
}

function getDisplayName(entity) {
    try {
        const tagged = entity.nameTag?.trim();
        if (tagged) {
            return tagged.startsWith(FOCUS_MARKER_PREFIX)
                ? tagged.slice(FOCUS_MARKER_PREFIX.length)
                : tagged;
        }
    } catch {}

    try {
        if (entity.name) return entity.name;
    } catch {}

    return entity.typeId.replace("minecraft:", "").replace("mysrpg:", "");
}

function canFocusEntity(player, entity) {
    if (!isEntityValid(entity) || entity.id === player.id) return false;
    if (IGNORE_TYPES.has(entity.typeId)) return false;
    if (areFriendly(player, entity)) return false;
    return Boolean(getEntityHealth(entity));
}

function getLookEnemy(player) {
    const direction = player.getViewDirection();
    let best;
    let bestScore = FOCUS_DOT;

    try {
        const candidates = player.dimension.getEntities({
            location: player.location,
            maxDistance: FOCUS_RANGE
        });

        for (const entity of candidates) {
            if (!canFocusEntity(player, entity)) continue;

            const dx = entity.location.x - player.location.x;
            const dy = entity.location.y + 1 - (player.location.y + 1.6);
            const dz = entity.location.z - player.location.z;
            const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (distance <= 0 || distance > FOCUS_RANGE) continue;

            const score = (
                direction.x * dx +
                direction.y * dy +
                direction.z * dz
            ) / distance;

            if (score > bestScore) {
                bestScore = score;
                best = entity;
            }
        }
    } catch {}

    return best;
}

function getFocusEnemy(player) {
    const damageFeedback = getRecentDamageFeedback(player);
    const feedbackTarget = damageFeedback?.target;

    if (feedbackTarget && canFocusEntity(player, feedbackTarget)) {
        return feedbackTarget;
    }

    return getLookEnemy(player);
}

function clearFocusMarker(playerId) {
    const previous = playerFocusMarkers.get(playerId);
    if (!previous) return;

    try {
        if (isEntityValid(previous.entity)) {
            previous.entity.nameTag = previous.originalNameTag;
        }
    } catch {}

    playerFocusMarkers.delete(playerId);
}

function spawnFocusMarkerParticle(entity) {
    try {
        entity.dimension.spawnParticle(FOCUS_PARTICLE, {
            x: entity.location.x,
            y: entity.location.y + 2.15,
            z: entity.location.z
        });
    } catch {}
}

function updateFocusMarker(player, target) {
    const previous = playerFocusMarkers.get(player.id);

    if (!target) {
        clearFocusMarker(player.id);
        return;
    }

    if (previous && previous.entity.id === target.id && isEntityValid(previous.entity)) {
        spawnFocusMarkerParticle(target);
        return;
    }

    clearFocusMarker(player.id);

    let originalNameTag = "";
    try {
        originalNameTag = target.nameTag ?? "";
        if (originalNameTag.startsWith(FOCUS_MARKER_PREFIX)) {
            originalNameTag = originalNameTag.slice(FOCUS_MARKER_PREFIX.length);
        }
    } catch {
        originalNameTag = "";
    }

    try {
        const label = originalNameTag || getDisplayName(target);
        target.nameTag = `${FOCUS_MARKER_PREFIX}${label}`;
    } catch {}

    playerFocusMarkers.set(player.id, {
        entity: target,
        originalNameTag
    });
    spawnFocusMarkerParticle(target);
}

function getHealTextForEntity(player, entityId) {
    const healing = getRecentHealingFeedback(player);
    if (!healing?.target || healing.target.id !== entityId) return "";
    return `  ${COLOR}a+${healing.healing}`;
}

function buildEnemyBlock(player, focusEnemy) {
    if (!focusEnemy) {
        return (
            `${COLOR}8${DIVIDER}${COLOR}r\n` +
            `${COLOR}8No focus${COLOR}r\n`
        );
    }

    const health = getEntityHealth(focusEnemy);
    if (!health) {
        return (
            `${COLOR}8${DIVIDER}${COLOR}r\n` +
            `${COLOR}8No focus${COLOR}r\n`
        );
    }

    const damageFeedback = getRecentDamageFeedback(player);
    let feedbackText = "";
    if (damageFeedback?.target?.id === focusEnemy.id) {
        feedbackText = `  ${COLOR}c-${damageFeedback.damage}`;
    }

    return (
        `${COLOR}8${DIVIDER}${COLOR}r\n` +
        `${COLOR}c\u25bc ${COLOR}f${getDisplayName(focusEnemy)}${feedbackText}\n` +
        `${COLOR}cHP ${bar(health.current, health.maximum, 14, "c")} ` +
        `${COLOR}f${Math.ceil(health.current)}/${Math.ceil(health.maximum)}\n`
    );
}

function buildSelfBlock(player) {
    const classData = getPlayerClass(player);
    const classKey = classData.key ?? "noclass";
    const level = getClassLevel(player, classKey);
    const icon = CLASS_ICON[classKey] ?? CLASS_ICON.noclass;

    const hp = getScore(player, "hp");
    const maxHp = getScore(player, "max_hp");
    const mp = getScore(player, "mp");
    const maxMp = getScore(player, "max_mp");
    const hunger = getScore(player, "hunger");
    const restless = getScore(player, "restless");
    const healText = getHealTextForEntity(player, player.id);

    return (
        `${COLOR}8${DIVIDER}${COLOR}r\n` +
        `${icon} ${COLOR}f${classData.name} Lv.${level}\n` +
        `${COLOR}cHP__ ${bar(hp, maxHp, 10, "c")} ${COLOR}f${hp}/${maxHp}${healText}\n` +
        `${COLOR}bMP__ ${bar(mp, maxMp, 10, "b")} ${COLOR}f${mp}/${maxMp}\n` +
        `${COLOR}eFOOD ${bar(hunger, 100, 10, "e")} ${COLOR}f${hunger}  ` +
        `${COLOR}dREST ${bar(restless, 100, 6, "d")} ${COLOR}f${restless}\n` +
        `${COLOR}6$${COLOR}f${getMoney(player)}  ` +
        `${COLOR}aEXP ${COLOR}f${getTotalExp(player)}\n`
    );
}

function getNearbyAllies(player) {
    try {
        return player.dimension
            .getPlayers({
                location: player.location,
                maxDistance: ALLY_RANGE
            })
            .filter((ally) => ally.id !== player.id && areFriendly(player, ally))
            .sort((a, b) => {
                const da =
                    (a.location.x - player.location.x) ** 2 +
                    (a.location.y - player.location.y) ** 2 +
                    (a.location.z - player.location.z) ** 2;
                const db =
                    (b.location.x - player.location.x) ** 2 +
                    (b.location.y - player.location.y) ** 2 +
                    (b.location.z - player.location.z) ** 2;
                return da - db;
            });
    } catch {
        return [];
    }
}

function buildAllyBlock(player) {
    const allies = getNearbyAllies(player).slice(0, MAX_ALLY_LINES);
    if (!allies.length) return "";

    const lines = allies.map((ally) => {
        const classData = getPlayerClass(ally);
        const icon = CLASS_ICON[classData.key] ?? CLASS_ICON.noclass;
        const hp = getScore(ally, "hp");
        const maxHp = getScore(ally, "max_hp");
        const mp = getScore(ally, "mp");
        const maxMp = getScore(ally, "max_mp");
        const healText = getHealTextForEntity(player, ally.id);

        return (
            `${icon}${COLOR}f${ally.name} ` +
            `${COLOR}c${hp}${COLOR}8/${COLOR}c${maxHp} ` +
            `${COLOR}b${mp}${COLOR}8/${COLOR}b${maxMp}` +
            healText
        );
    });

    return (
        `${COLOR}8${DIVIDER}${COLOR}r\n` +
        `${COLOR}aParty${COLOR}r\n` +
        `${lines.join("\n")}\n`
    );
}

function buildHud(player) {
    const focusEnemy = getFocusEnemy(player);
    updateFocusMarker(player, focusEnemy);

    return (
        buildEnemyBlock(player, focusEnemy) +
        buildSelfBlock(player) +
        buildAllyBlock(player)
    );
}

try {
    world.afterEvents.playerLeave.subscribe((event) => {
        clearFocusMarker(event.playerId ?? event.player?.id);
    });
} catch {}

system.runInterval(() => {
    const activeIds = new Set();

    for (const player of world.getAllPlayers()) {
        activeIds.add(player.id);
        try {
            player.onScreenDisplay.setActionBar(buildHud(player));
        } catch (error) {
            console.warn(`[HUD] Failed for ${player.name}: ${error}`);
        }
    }

    for (const playerId of playerFocusMarkers.keys()) {
        if (!activeIds.has(playerId)) clearFocusMarker(playerId);
    }
}, 10);
