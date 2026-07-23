import { system, world } from "@minecraft/server";
import { getScore, setScore } from "../data/class_utils.js";
import { showDownedUI } from "../interaction/downed_ui.js";

const AUTO_RECOVER_TICKS            = 20 * 60 * 2;   // 2 min auto-recover
const SKY_HOLD_TICKS                = 20 * 3;
const SKY_HOLD_MIN_Y                = 220;
const SKY_HOLD_OFFSET_Y             = 120;
const DOWNED_EFFECT_DURATION_TICKS  = 20 * 60 * 60;
const REVIVE_HP_RATE                = 0.25;
const RELEASE_RESPAWN_TAG           = "mysrpg_release_respawn";
const RELEASE_RESPAWN_GRACE_TICKS   = 20 * 30;
const RELEASE_RESPAWN_RESTORE_TICKS = [20, 60, 100, 160];
const RELEASE_RESPAWN_CLEAR_TICKS   = 180;

const DOWNED_REMOVED_EFFECTS = [
    "poison", "wither", "fatal_poison", "hunger"
];

const DANGEROUS_BLOCK_TYPES = new Set([
    "minecraft:lava", "minecraft:flowing_lava",
    "minecraft:fire", "minecraft:soul_fire",
    "minecraft:campfire", "minecraft:soul_campfire",
    "minecraft:magma", "minecraft:magma_block",
    "minecraft:cactus", "minecraft:sweet_berry_bush"
]);

const PASSABLE_BLOCK_TYPES = new Set([
    "minecraft:air", "minecraft:cave_air", "minecraft:void_air",
    "minecraft:snow_layer", "minecraft:tall_grass", "minecraft:short_grass",
    "minecraft:fern", "minecraft:large_fern", "minecraft:deadbush",
    "minecraft:red_flower", "minecraft:yellow_flower",
    "minecraft:brown_mushroom", "minecraft:red_mushroom",
    "minecraft:torch", "minecraft:soul_torch"
]);

const downedPlayers    = new Map();
const releasedRespawns = new Set();
const releaseGuards    = new Map();

// ── Release-respawn tracking ──────────────────────────────────

export function markReleaseRespawn(player) {
    releasedRespawns.add(player.name);
    releaseGuards.set(player.name, system.currentTick + RELEASE_RESPAWN_GRACE_TICKS);
    try { player.addTag(RELEASE_RESPAWN_TAG); } catch {}
}

export function isReleaseRespawn(player) {
    const guardedUntil = releaseGuards.get(player.name) ?? 0;
    return releasedRespawns.has(player.name)
        || guardedUntil >= system.currentTick
        || player.hasTag(RELEASE_RESPAWN_TAG);
}

function clearReleaseRespawn(player) {
    releasedRespawns.delete(player.name);
    releaseGuards.delete(player.name);
    try { player.removeTag(RELEASE_RESPAWN_TAG); } catch {}
}

// ── Utilities ─────────────────────────────────────────────────

function clearScheduledRun(runId) {
    if (typeof runId !== "number") return;
    try { system.clearRun(runId); } catch {}
}

async function runCommand(player, command) {
    try {
        if (typeof player.runCommandAsync === "function") {
            await player.runCommandAsync(command);
        } else {
            player.runCommand(command);
        }
        return true;
    } catch { return false; }
}

function setNativeHealth(player, value) {
    try {
        const health = player.getComponent("minecraft:health");
        if (health && typeof health.setCurrentValue === "function") {
            health.setCurrentValue(
                Math.max(1, Math.min(value, health.effectiveMax ?? value))
            );
        }
    } catch {}
}

function fillNativeHealth(player) {
    try {
        const health = player.getComponent("minecraft:health");
        if (health && typeof health.setCurrentValue === "function") {
            health.setCurrentValue(health.effectiveMax ?? health.defaultValue ?? 20);
        }
    } catch {}
}

function clearDownedDamageOverTime(player) {
    for (const effectId of DOWNED_REMOVED_EFFECTS) {
        try { player.removeEffect(effectId); } catch {}
    }
    try { player.extinguishFire(); } catch {}
}

function teleportUpOneBlock(player) {
    try {
        player.teleport(
            { x: player.location.x, y: player.location.y + 1, z: player.location.z },
            { dimension: player.dimension }
        );
    } catch {}
}

function getSkyHoldLocation(player) {
    return {
        x: player.location.x,
        y: Math.min(315, Math.max(SKY_HOLD_MIN_Y, player.location.y + SKY_HOLD_OFFSET_Y)),
        z: player.location.z
    };
}

function teleportToSkyHold(player, state) {
    state.returnLocation = {
        x: player.location.x,
        y: player.location.y,
        z: player.location.z
    };

    try {
        player.teleport(getSkyHoldLocation(player), { dimension: player.dimension });
        return true;
    } catch {
        return false;
    }
}

function returnFromSkyHold(player, state) {
    if (!state.returnLocation) return;

    try {
        player.teleport(state.returnLocation, { dimension: player.dimension });
    } catch {}
}

function getBlock(dimension, x, y, z) {
    try {
        return dimension.getBlock({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) });
    } catch { return undefined; }
}

function isDangerousBlock(block) {
    return !block || DANGEROUS_BLOCK_TYPES.has(block.typeId);
}

function isPassableBlock(block) {
    if (!block) return false;
    if (block.isAir) return true;
    return PASSABLE_BLOCK_TYPES.has(block.typeId);
}

function isSafeSupportBlock(dimension, x, y, z) {
    const ground = getBlock(dimension, x, y - 1, z);
    if (isDangerousBlock(ground)) return false;
    if (ground?.typeId === "minecraft:snow_layer") {
        const belowSnow = getBlock(dimension, x, y - 2, z);
        return !isPassableBlock(belowSnow) && !isDangerousBlock(belowSnow);
    }
    return !isPassableBlock(ground);
}

function isSafeStandLocation(dimension, x, y, z) {
    const feet = getBlock(dimension, x, y,     z);
    const head = getBlock(dimension, x, y + 1, z);
    return isPassableBlock(feet)
        && isPassableBlock(head)
        && isSafeSupportBlock(dimension, x, y, z)
        && !isDangerousBlock(feet)
        && !isDangerousBlock(head);
}

function findNearestSafeLocation(player) {
    const base = {
        x: Math.floor(player.location.x),
        y: Math.floor(player.location.y),
        z: Math.floor(player.location.z)
    };

    for (let radius = 0; radius <= 12; radius++) {
        for (let yOffset = -6; yOffset <= 8; yOffset++) {
            for (let xOffset = -radius; xOffset <= radius; xOffset++) {
                for (let zOffset = -radius; zOffset <= radius; zOffset++) {
                    if (Math.max(Math.abs(xOffset), Math.abs(zOffset)) !== radius) continue;
                    const x = base.x + xOffset;
                    const y = base.y + yOffset;
                    const z = base.z + zOffset;
                    const feet = getBlock(player.dimension, x, y, z);
                    if (!feet) continue;
                    if (isSafeStandLocation(player.dimension, x, y, z)) {
                        return { x: x + 0.5, y, z: z + 0.5 };
                    }
                }
            }
        }
    }

    return { x: player.location.x, y: player.location.y + 2, z: player.location.z };
}

// ── Lock / unlock ─────────────────────────────────────────────

async function lockPlayer(player) {
    await runCommand(player, "inputpermission set @s movement disabled");
    try {
        player.addEffect("resistance",   DOWNED_EFFECT_DURATION_TICKS, { amplifier: 255, showParticles: false });
        player.addEffect("slowness",     DOWNED_EFFECT_DURATION_TICKS, { amplifier: 255, showParticles: false });
        player.addEffect("weakness",     DOWNED_EFFECT_DURATION_TICKS, { amplifier: 255, showParticles: false });
        player.addEffect("invisibility", DOWNED_EFFECT_DURATION_TICKS, { amplifier: 0,   showParticles: false });
        player.addEffect("slow_falling", DOWNED_EFFECT_DURATION_TICKS, { amplifier: 0,   showParticles: false });
    } catch {}
}

async function unlockPlayer(player) {
    await runCommand(player, "inputpermission set @s movement enabled");
    try {
        player.removeEffect("resistance");
        player.removeEffect("slowness");
        player.removeEffect("weakness");
        player.removeEffect("invisibility");
        player.removeEffect("slow_falling");
        player.removeEffect("darkness");
    } catch {}
}

// ── Recovery paths ────────────────────────────────────────────

async function releasePlayer(player, state) {
    if (state.resolved || !downedPlayers.has(player.id)) return;

    state.resolved = true;
    state.released = true;
    markReleaseRespawn(player);
    clearScheduledRun(state.recoverRun);
    downedPlayers.delete(player.id);

    const maxHp = Math.max(1, getScore(player, "max_hp"));
    const maxMp = Math.max(0, getScore(player, "max_mp"));
    setScore(player, "hp",      maxHp);
    setScore(player, "mp",      maxMp);
    setScore(player, "hunger",  100);
    setScore(player, "restless",100);
    setNativeHealth(player, maxHp);

    {
        clearDownedDamageOverTime(player);
        await unlockPlayer(player);
        setNativeHealth(player, maxHp);
        if (state.deathLocation) {
            player.sendMessage(
                `§7Your body was left at X:${Math.floor(state.deathLocation.x)} ` +
                `Y:${Math.floor(state.deathLocation.y)} ` +
                `Z:${Math.floor(state.deathLocation.z)}.`
            );
        }
        await runCommand(player, "kill @s");
    }
}

function restoreReleaseRespawnVitals(player) {
    const maxHp = Math.max(1, getScore(player, "max_hp"));
    const maxMp = Math.max(0, getScore(player, "max_mp"));
    setScore(player, "hp",      maxHp);
    setScore(player, "mp",      maxMp);
    setScore(player, "hunger",  100);
    setScore(player, "restless",100);
    fillNativeHealth(player);
}

async function recoverAtDawn(player, state) {
    if (state.resolved || state.released || isReleaseRespawn(player) || !downedPlayers.has(player.id)) return;

    state.resolved = true;
    clearScheduledRun(state.recoverRun);
    downedPlayers.delete(player.id);

    const maxHp        = Math.max(1, getScore(player, "max_hp"));
    const recoveredHp  = Math.max(1, Math.ceil(maxHp * REVIVE_HP_RATE));
    const safeLocation = findNearestSafeLocation(player);

    try { player.teleport(safeLocation, { dimension: player.dimension }); } catch {}

    setScore(player, "hp",      recoveredHp);
    setScore(player, "hunger",  Math.max(25, getScore(player, "hunger")));
    setScore(player, "restless",Math.max(25, getScore(player, "restless")));
    setNativeHealth(player, recoveredHp);
    await runCommand(player, "time set sunrise");
    clearDownedDamageOverTime(player);
    await unlockPlayer(player);

    player.sendMessage(`§aYou wake at dawn with ${recoveredHp}/${maxHp} HP.`);
}

// ── UI loop ───────────────────────────────────────────────────

function showDownedChoice(player, state) {
    if (state.resolved || !downedPlayers.has(player.id)) return;

    showDownedUI(
        player,
        () => recoverAtDawn(player, state),
        () => releasePlayer(player, state)
    );

    system.runTimeout(() => {
        if (state.resolved || !downedPlayers.has(player.id)) return;
        showDownedChoice(player, state);
    }, 60);
}

// ── Public API ────────────────────────────────────────────────

export function isPlayerDowned(player) {
    return downedPlayers.has(player.id);
}

export async function reviveDownedPlayer(player, healer) {
    const state = downedPlayers.get(player.id);
    if (!state || state.resolved) return false;

    const hp = Math.max(0, getScore(player, "hp"));
    if (hp <= 0) return false;

    state.resolved = true;
    clearScheduledRun(state.recoverRun);
    downedPlayers.delete(player.id);

    clearDownedDamageOverTime(player);
    setNativeHealth(player, hp);
    await unlockPlayer(player);

    try {
        player.onScreenDisplay.setActionBar("§aYou are back on your feet.");
    } catch {}

    if (healer && healer.id !== player.id) {
        player.sendMessage(`§a${healer.name} helped you stand back up.`);
        healer.sendMessage(`§aYou helped ${player.name} stand back up.`);
    } else {
        player.sendMessage("§aYou are back on your feet.");
    }

    return true;
}

export function enterDownedState(player) {
    if (isPlayerDowned(player)) return false;

    const state = {
        resolved:      false,
        released:      false,
        startedTick:   system.currentTick,
        recoverRun:    undefined,
        deathLocation: { ...player.location },
        returnLocation: undefined
    };
    downedPlayers.set(player.id, state);

    setScore(player, "hp", 0);
    setNativeHealth(player, 1);
    clearDownedDamageOverTime(player);
    lockPlayer(player);
    teleportToSkyHold(player, state);

    try {
        player.addEffect("darkness", SKY_HOLD_TICKS + 40, {
            amplifier: 0,
            showParticles: false
        });
    } catch {}

    // Briefly vanish from nearby enemies, then return and show UI.
    system.runTimeout(() => {
        if (state.resolved || !downedPlayers.has(player.id)) return;
        returnFromSkyHold(player, state);
        showDownedChoice(player, state);
    }, SKY_HOLD_TICKS);

    // Auto-recover at dawn if no choice is made — prevents permanent stuck state
    state.recoverRun = system.runTimeout(() => {
        recoverAtDawn(player, state);
    }, AUTO_RECOVER_TICKS);

    return true;
}

// ── Event listeners ───────────────────────────────────────────

world.afterEvents.playerSpawn.subscribe((event) => {
    const player = event.player;

    if (isReleaseRespawn(player)) {
        restoreReleaseRespawnVitals(player);

        for (const delay of RELEASE_RESPAWN_RESTORE_TICKS) {
            system.runTimeout(() => restoreReleaseRespawnVitals(player), delay);
        }
        system.runTimeout(() => {
            restoreReleaseRespawnVitals(player);
            unlockPlayer(player);
            clearReleaseRespawn(player);
        }, RELEASE_RESPAWN_CLEAR_TICKS);
        return;
    }

    const state = downedPlayers.get(player.id);
    if (!state) return;

    state.resolved = true;
    clearScheduledRun(state.recoverRun);
    downedPlayers.delete(player.id);
    unlockPlayer(player);
});

// ── Maintenance interval ──────────────────────────────────────

system.runInterval(() => {
    for (const [name, guardedUntil] of releaseGuards) {
        if (guardedUntil < system.currentTick) releaseGuards.delete(name);
    }

    for (const player of world.getAllPlayers()) {
        const state = downedPlayers.get(player.id);
        if (!state || state.released) continue;

        setNativeHealth(player, 1);
        clearDownedDamageOverTime(player);

        try {
            player.onScreenDisplay.setActionBar(
                "§cDowned §7| §fChoose your return from the menu."
            );
            player.addEffect("invisibility", 40, { amplifier: 0, showParticles: false });
        } catch {}
    }
}, 20);
