import { system, world } from "@minecraft/server";
import { getScore, setScore } from "../data/class_utils.js";
import { isPlayerDowned } from "./death_system.js";

const RESTLESS_DECAY_INTERVAL = 720;
const MIN_REGEN_INTERVAL_TICKS = 20;
const MAX_REGEN_INTERVAL_TICKS = 200;
const UPDATE_INTERVAL_TICKS = 5;

const regenProgress = new Map();
const sleepingPlayers = new Set();

function getRegenIntervalTicks(restless) {
    if (restless <= 0) return Infinity;

    const normalized = (restless - 1) / 99;
    return Math.round(
        MAX_REGEN_INTERVAL_TICKS -
        normalized * (MAX_REGEN_INTERVAL_TICKS - MIN_REGEN_INTERVAL_TICKS)
    );
}

function isSleeping(player) {
    try {
        if (typeof player.isSleeping === "boolean") return player.isSleeping;
        return Boolean(
            player.getComponent("minecraft:is_sleeping") ||
            player.hasComponent?.("minecraft:is_sleeping")
        );
    } catch {
        return false;
    }
}

function updateSleepState(player) {
    const sleeping = isSleeping(player);

    if (sleeping) {
        sleepingPlayers.add(player.id);
        return;
    }

    if (!sleepingPlayers.delete(player.id)) return;

    setScore(player, "restless", 100);
    regenProgress.set(player.id, 0);
    player.sendMessage("\u00a7bYou feel fully rested. Restless: 100/100");
}

function regenerateMp(player) {
    if (isPlayerDowned(player)) return;

    const restless = getScore(player, "restless");
    const requiredTicks = getRegenIntervalTicks(restless);
    if (!Number.isFinite(requiredTicks)) {
        regenProgress.set(player.id, 0);
        return;
    }

    const mp = getScore(player, "mp");
    const maxMp = getScore(player, "max_mp");
    if (mp >= maxMp) {
        regenProgress.set(player.id, 0);
        return;
    }

    const progress =
        (regenProgress.get(player.id) ?? 0) + UPDATE_INTERVAL_TICKS;
    if (progress < requiredTicks) {
        regenProgress.set(player.id, progress);
        return;
    }

    setScore(player, "mp", Math.min(maxMp, mp + 1));
    regenProgress.set(player.id, 0);
}

system.runInterval(() => {
    const onlineIds = new Set();

    for (const player of world.getAllPlayers()) {
        onlineIds.add(player.id);
        updateSleepState(player);
        regenerateMp(player);
    }

    for (const playerId of regenProgress.keys()) {
        if (!onlineIds.has(playerId)) regenProgress.delete(playerId);
    }
    for (const playerId of sleepingPlayers) {
        if (!onlineIds.has(playerId)) sleepingPlayers.delete(playerId);
    }
}, UPDATE_INTERVAL_TICKS);

system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (isPlayerDowned(player) || isSleeping(player)) continue;
        setScore(
            player,
            "restless",
            Math.max(0, getScore(player, "restless") - 1)
        );
    }
}, RESTLESS_DECAY_INTERVAL);
