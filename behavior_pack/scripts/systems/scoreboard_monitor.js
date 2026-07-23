import { system, world } from "@minecraft/server";
import {
    getScore,
    MAX_CLASS_LEVEL,
    setScore
} from "../data/class_utils.js";
import { CLASSES } from "../data/class_data.js";
import { initPlayer } from "./scoreboard_init.js";
import { refreshDerivedStats } from "./stats_system.js";

const MONITOR_INTERVAL = 20 * 5;
const REINIT_INTERVAL = 20 * 30;

const CLAMP_RULES = [
    { stat: "hp", min: 0, maxStat: "max_hp" },
    { stat: "mp", min: 0, maxStat: "max_mp" },
    { stat: "stamina", min: 0, max: 100 },
    { stat: "hunger", min: 0, max: 100 },
    { stat: "restless", min: 0, max: 100 },
    { stat: "money", min: 0, max: null },
    { stat: "exp", min: 0, max: null }
];

function clampPlayerStats(player) {
    if (!player.scoreboardIdentity) return;

    for (const rule of CLAMP_RULES) {
        const value = getScore(player, rule.stat);
        const maximum = rule.maxStat ? getScore(player, rule.maxStat) : rule.max;
        const clamped = Math.max(
            rule.min,
            maximum == null ? value : Math.min(value, maximum)
        );

        if (clamped !== value) setScore(player, rule.stat, clamped);
    }

    for (const classKey in CLASSES) {
        const objectiveName = `${classKey}_lv`;
        const level = getScore(player, objectiveName);
        const clampedLevel = Math.min(MAX_CLASS_LEVEL, Math.max(1, level));

        if (clampedLevel !== level) {
            setScore(player, objectiveName, clampedLevel);
        }
    }

    refreshDerivedStats(player);
}

system.runInterval(() => {
    for (const player of world.getAllPlayers()) clampPlayerStats(player);
}, MONITOR_INTERVAL);

system.runInterval(() => {
    for (const player of world.getAllPlayers()) initPlayer(player);
}, REINIT_INTERVAL);
