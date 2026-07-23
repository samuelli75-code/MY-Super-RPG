import { system, world } from "@minecraft/server";
import { getScore, setScore } from "../data/class_utils.js";
import { FOOD_HUNGER } from "../data/food_data.js";
import { isPlayerDowned } from "./death_system.js";
import { syncPlayerHealth } from "./stats_system.js";

const HUNGER_DECAY_INTERVAL = 720;
const MIN_REGEN_INTERVAL_TICKS = 80;
const MAX_REGEN_INTERVAL_TICKS = 400;
const STARVATION_DAMAGE_INTERVAL_TICKS = 200;
const INITIALIZED_TAG = "mysrpg_initialized";
const VANILLA_HUNGER_READY = 17;
const VANILLA_SYNC_INTERVAL_TICKS = 10;
const regenProgress = new Map();
const UPDATE_INTERVAL_TICKS = 5;

const VANILLA_HUNGER_COMPONENT = "minecraft:player.hunger";
const VANILLA_SATURATION_COMPONENT = "minecraft:player.saturation";
const VANILLA_EXHAUSTION_COMPONENT = "minecraft:player.exhaustion";

function setPlayerAttribute(player, componentId, value) {
    try {
        const component = player.getComponent(componentId);
        if (!component || typeof component.setCurrentValue !== "function") {
            return false;
        }

        component.setCurrentValue(value);
        return true;
    } catch {
        return false;
    }
}

function suppressVanillaHungerMechanics(player) {
    setPlayerAttribute(player, VANILLA_SATURATION_COMPONENT, 0);
    setPlayerAttribute(player, VANILLA_EXHAUSTION_COMPONENT, 0);

    try {
        const hunger = player.getComponent(VANILLA_HUNGER_COMPONENT);
        if (!hunger || typeof hunger.setCurrentValue !== "function") {
            return;
        }

        if (hunger.currentValue >= 20 || hunger.currentValue < 1) {
            hunger.setCurrentValue(VANILLA_HUNGER_READY);
        }
    } catch {}
}

function primeVanillaForEating(player) {
    setPlayerAttribute(player, VANILLA_SATURATION_COMPONENT, 0);
    setPlayerAttribute(player, VANILLA_EXHAUSTION_COMPONENT, 0);
    setPlayerAttribute(player, VANILLA_HUNGER_COMPONENT, VANILLA_HUNGER_READY);
}

function restoreHunger(player, itemTypeId) {
    const amount = FOOD_HUNGER[itemTypeId] ?? 0;
    if (amount <= 0) return;

    const hunger = getScore(player, "hunger");
    const nextHunger = Math.min(100, hunger + amount);
    setScore(player, "hunger", nextHunger);
    player.sendMessage(`\u00a7eHunger +${nextHunger - hunger} (${nextHunger}/100)`);
}

function getRegenIntervalTicks(hunger) {
    if (hunger <= 0) return Infinity;

    const normalized = (hunger - 1) / 99;
    return Math.round(
        MAX_REGEN_INTERVAL_TICKS -
        normalized * (MAX_REGEN_INTERVAL_TICKS - MIN_REGEN_INTERVAL_TICKS)
    );
}

function isTrackedFood(itemTypeId) {
    return Object.prototype.hasOwnProperty.call(FOOD_HUNGER, itemTypeId);
}

const itemUseBefore = world.beforeEvents.itemUse;
if (itemUseBefore) {
    itemUseBefore.subscribe((event) => {
        const player = event.source;
        const itemTypeId = event.itemStack?.typeId;
        if (player.typeId !== "minecraft:player") return;
        if (!player.hasTag(INITIALIZED_TAG) || isPlayerDowned(player)) return;
        if (!isTrackedFood(itemTypeId)) return;

        if (getScore(player, "hunger") >= 100) {
            event.cancel = true;
            player.sendMessage("\u00a7cYou are already full.");
            return;
        }

        primeVanillaForEating(player);
    });
}

const completeUseSignal = world.afterEvents.itemCompleteUse;
if (completeUseSignal) {
    completeUseSignal.subscribe((event) => {
        const itemTypeId = event.itemStack?.typeId;
        if (!isTrackedFood(itemTypeId)) return;

        restoreHunger(event.source, itemTypeId);
        system.runTimeout(() => suppressVanillaHungerMechanics(event.source), 1);
    });
}

world.afterEvents.playerSpawn.subscribe((event) => {
    system.runTimeout(() => suppressVanillaHungerMechanics(event.player), 40);
});

system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (!player.hasTag(INITIALIZED_TAG) || isPlayerDowned(player)) continue;

        const hunger = getScore(player, "hunger");
        if (hunger <= 0) {
            const progress =
                (regenProgress.get(player.id) ?? 0) + UPDATE_INTERVAL_TICKS;
            if (progress >= STARVATION_DAMAGE_INTERVAL_TICKS) {
                setScore(
                    player,
                    "hp",
                    Math.max(0, getScore(player, "hp") - 1)
                );
                syncPlayerHealth(player);
                regenProgress.set(player.id, 0);
            } else {
                regenProgress.set(player.id, progress);
            }
            continue;
        }

        const hp = getScore(player, "hp");
        const maxHp = getScore(player, "max_hp");
        if (hp >= maxHp) {
            regenProgress.set(player.id, 0);
            continue;
        }

        const requiredTicks = getRegenIntervalTicks(hunger);
        const progress =
            (regenProgress.get(player.id) ?? 0) + UPDATE_INTERVAL_TICKS;
        if (progress >= requiredTicks) {
            setScore(player, "hp", Math.min(maxHp, hp + 1));
            syncPlayerHealth(player);
            regenProgress.set(player.id, 0);
        } else {
            regenProgress.set(player.id, progress);
        }
    }
}, UPDATE_INTERVAL_TICKS);

system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (!player.hasTag(INITIALIZED_TAG) || isPlayerDowned(player)) continue;
        setScore(player, "hunger", Math.max(0, getScore(player, "hunger") - 1));
    }
}, HUNGER_DECAY_INTERVAL);

system.runInterval(() => {
    for (const player of world.getAllPlayers()) {
        if (!player.hasTag(INITIALIZED_TAG) || isPlayerDowned(player)) continue;
        suppressVanillaHungerMechanics(player);
    }
}, VANILLA_SYNC_INTERVAL_TICKS);
