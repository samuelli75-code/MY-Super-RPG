import { world } from "@minecraft/server";
import { CLASSES } from "../data/class_data.js";

export const MAX_CLASS_LEVEL = 20;

export function getObjective(name) {
    return world.scoreboard.getObjective(name);
}

export function ensureObjective(name, displayName = name) {
    let objective = world.scoreboard.getObjective(name);
    if (!objective) objective = world.scoreboard.addObjective(name, displayName);
    return objective;
}

export function getScore(player, objectiveName) {
    const objective = getObjective(objectiveName);
    if (!objective || !player.scoreboardIdentity) return 0;
    try {
        return objective.getScore(player.scoreboardIdentity) ?? 0;
    } catch {
        return 0;
    }
}

export function setScore(player, objectiveName, value) {
    if (!player.scoreboardIdentity) return;
    ensureObjective(objectiveName).setScore(
        player.scoreboardIdentity,
        Math.max(0, Math.floor(value))
    );
}

export function addScore(player, objectiveName, amount) {
    setScore(player, objectiveName, getScore(player, objectiveName) + amount);
}

export function getClassById(id) {
    for (const key in CLASSES) {
        if (CLASSES[key].id === id) return CLASSES[key];
    }
    return CLASSES.noclass;
}

export function getClassByKey(key) {
    return CLASSES[key] ?? CLASSES.noclass;
}

export function getPlayerClassId(player) {
    return getScore(player, "class");
}

export function getPlayerClassKey(player) {
    return getClassById(getPlayerClassId(player)).key;
}

export function getPlayerClass(player) {
    return getClassById(getPlayerClassId(player));
}

export function isPlayerClass(player, classKey) {
    return getPlayerClassKey(player) === classKey;
}

export function setPlayerClass(player, classKey) {
    setScore(player, "class", getClassByKey(classKey).id);
}

export function getClassLevel(player, classKey) {
    return Math.min(
        MAX_CLASS_LEVEL,
        Math.max(1, getScore(player, `${classKey}_lv`))
    );
}

export function setClassLevel(player, classKey, level) {
    setScore(
        player,
        `${classKey}_lv`,
        Math.min(MAX_CLASS_LEVEL, Math.max(1, level))
    );
}

export function getTotalExp(player) {
    return getScore(player, "exp");
}

export function addTotalExp(player, amount) {
    addScore(player, "exp", amount);
}

export function getRequiredClassExp(level, classKey = "") {
    const base = classKey === "noclass" ? 15 : 20;
    return Math.ceil(base * ((1 + 0.5 * level) ** 2));
}

export function getSkillPoints(player, classKey) {
    return getScore(player, `${classKey}_sp`);
}
