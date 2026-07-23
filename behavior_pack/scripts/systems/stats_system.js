import { system, world } from "@minecraft/server";
import {
    getClassLevel,
    getPlayerClassKey,
    getScore,
    setScore
} from "../data/class_utils.js";
import { WEAPON_DAMAGE } from "../data/weapon_data.js";
import { enterDownedState, isPlayerDowned, isReleaseRespawn } from "./death_system.js";

const INITIALIZED_TAG = "mysrpg_initialized";

function getHeldItem(player) {
    return player.getComponent("minecraft:equippable")
        ?.getEquipment("Mainhand");
}

export function getHeldItemId(player) {
    return getHeldItem(player)?.typeId;
}

export function getWeaponDamage(player) {
    return WEAPON_DAMAGE[getHeldItemId(player)] ?? 0;
}

function getCurrentClassLevel(player) {
    return getClassLevel(player, getPlayerClassKey(player));
}

function getCurrentClassLevelOffset(player) {
    return Math.max(0, getCurrentClassLevel(player) - 1);
}

export function getMeleeDamage(player) {
    const weaponDamage = getWeaponDamage(player);
    return Math.max(1, Math.round(weaponDamage + getCurrentClassLevel(player)));
}

export function getVanillaMeleeReferenceDamage(player) {
    if (getHeldItemId(player)?.startsWith("mysrpg:")) return 1;
    return Math.max(1, getWeaponDamage(player) + 1);
}

export function getMaxHp(player) {
    const levelMultiplier = 1 + 0.2 * getCurrentClassLevelOffset(player);
    return Math.ceil(20 * (levelMultiplier ** 2));
}

export function getMaxMp(player) {
    const levelMultiplier = 1 + 0.2 * getCurrentClassLevelOffset(player);
    return Math.ceil(10 * (levelMultiplier ** 2));
}

function getHealthBoostAmplifier(maxHp) {
    const extraHealth = Math.max(0, maxHp - 20);
    return Math.max(0, Math.ceil(extraHealth / 4) - 1);
}

export function fillNativeHealth(entity) {
    try {
        const health = entity.getComponent("minecraft:health");
        if (health && typeof health.setCurrentValue === "function") {
            health.setCurrentValue(
                health.effectiveMax ?? health.defaultValue ?? 20
            );
        }
    } catch {}
}

export function syncPlayerHealth(player) {
    // Never interfere with a downed player — death_system owns their state
    if (isPlayerDowned(player)) return;
    if (isReleaseRespawn(player)) return;

    const hp = Math.max(
        0,
        Math.min(getScore(player, "hp"), getScore(player, "max_hp"))
    );

    if (hp <= 0) {
        enterDownedState(player);
        return;
    }

    try {
        const maxHp = getScore(player, "max_hp");
        player.addEffect("health_boost", 60, {
            amplifier: getHealthBoostAmplifier(maxHp),
            showParticles: false
        });
        fillNativeHealth(player);
        system.runTimeout(() => fillNativeHealth(player), 1);
        system.runTimeout(() => fillNativeHealth(player), 5);
    } catch {}
}

export function refreshDerivedStats(player, restoreIncrease = false) {
    // Never touch a downed player's HP — death_system owns it
    if (isPlayerDowned(player)) return;
    if (isReleaseRespawn(player)) return;

    const oldMaxHp = getScore(player, "max_hp");
    const oldMaxMp = getScore(player, "max_mp");
    const maxHp = getMaxHp(player);
    const maxMp = getMaxMp(player);

    setScore(player, "max_hp", maxHp);
    setScore(player, "max_mp", maxMp);

    const hpIncrease = restoreIncrease ? Math.max(0, maxHp - oldMaxHp) : 0;
    const mpIncrease = restoreIncrease ? Math.max(0, maxMp - oldMaxMp) : 0;

    setScore(player, "hp", Math.min(maxHp, getScore(player, "hp") + hpIncrease));
    setScore(player, "mp", Math.min(maxMp, getScore(player, "mp") + mpIncrease));
    syncPlayerHealth(player);
}

world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;

    // Release-respawn is fully handled by death_system — don't touch this player
    if (isReleaseRespawn(player)) return;

    const restoreSpawnVitals = (attempt = 0) => {
        if (!player.hasTag(INITIALIZED_TAG)) {
            if (attempt < 10) {
                system.runTimeout(() => restoreSpawnVitals(attempt + 1), 10);
            }
            return;
        }

        if (isPlayerDowned(player)) return;

        refreshDerivedStats(player);
        setScore(player, "hp", getScore(player, "max_hp"));
        setScore(player, "mp", getScore(player, "max_mp"));
        setScore(player, "hunger", 100);
        setScore(player, "restless", 100);
        syncPlayerHealth(player);
    };

    system.runTimeout(() => restoreSpawnVitals(), 50);
});

system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (!player.hasTag(INITIALIZED_TAG)) continue;
        // Skip downed players — death_system is authoritative over their HP
        if (isPlayerDowned(player)) continue;
        if (isReleaseRespawn(player)) continue;
        refreshDerivedStats(player);
        syncPlayerHealth(player);
    }
}, 20);
