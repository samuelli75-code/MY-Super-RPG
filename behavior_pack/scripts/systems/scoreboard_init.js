import { system, world } from "@minecraft/server";
import { CLASSES } from "../data/class_data.js";
import { setScore } from "../data/class_utils.js";

const INITIALIZED_TAG = "mysrpg_initialized";

const BASE_OBJECTIVES = [
    "hp", "max_hp", "mp", "max_mp",
    "weapon_damage", "melee_damage",
    "stamina", "hunger", "restless",
    "money", "exp", "class", "team"
];

const SKILL_OBJECTIVES = ["mine", "kills", "farming", "feeding"];
const LEGACY_OBJECTIVES = [
    "speed_bonus", "jump_bonus", "melee_bonus", "shot_bonus",
    "magic_accelerate", "healing_bonus", "defense_bonus", "dodge",
    "str", "con", "dec", "int", "wis"
];

const PLAYER_DEFAULTS = {
    hp: 20,
    max_hp: 20,
    mp: 10,
    max_mp: 10,
    weapon_damage: 0,
    melee_damage: 3,
    stamina: 100,
    hunger: 100,
    restless: 100,
    money: 0,
    exp: 0,
    class: 0,
    team: 0
};

function createObjective(name) {
    if (!world.scoreboard.getObjective(name)) {
        world.scoreboard.addObjective(name, name);
    }
}

function initWorld() {
    for (const name of BASE_OBJECTIVES) createObjective(name);
    for (const name of LEGACY_OBJECTIVES) {
        if (world.scoreboard.getObjective(name)) {
            world.scoreboard.removeObjective(name);
        }
    }

    for (const skill of SKILL_OBJECTIVES) {
        createObjective(`${skill}_exp`);
        createObjective(`${skill}_lv`);
    }

    for (const classKey in CLASSES) {
        const legacyExp = `${classKey}_exp`;
        if (world.scoreboard.getObjective(legacyExp)) {
            world.scoreboard.removeObjective(legacyExp);
        }

        createObjective(`${classKey}_lv`);
        createObjective(`${classKey}_sp`);
    }
}

async function runCmd(player, command) {
    try {
        if (typeof player.runCommandAsync === "function") {
            await player.runCommandAsync(command);
        } else {
            player.runCommand(command);
        }
    } catch (error) {
        console.warn(`[INIT] Command failed: ${command} / ${error}`);
    }
}

async function setIfMissing(player, objectiveName, defaultValue) {
    const objective = world.scoreboard.getObjective(objectiveName);
    if (!objective) return;

    if (player.scoreboardIdentity) {
        try {
            const score = objective.getScore(player.scoreboardIdentity);
            if (typeof score === "number") return;
        } catch {}
    }

    await runCmd(player, `scoreboard players set @s ${objectiveName} ${defaultValue}`);
}

export async function initPlayer(player) {
    const firstInitialization = !player.hasTag(INITIALIZED_TAG);

    for (const [name, value] of Object.entries(PLAYER_DEFAULTS)) {
        await setIfMissing(player, name, value);
    }

    for (const skill of SKILL_OBJECTIVES) {
        await setIfMissing(player, `${skill}_exp`, 0);
        await setIfMissing(player, `${skill}_lv`, 0);
    }

    for (const classKey in CLASSES) {
        await setIfMissing(player, `${classKey}_lv`, 1);
        await setIfMissing(player, `${classKey}_sp`, 0);
    }

    if (firstInitialization) {
        const maxHp = 20;
        const maxMp = 10;

        setScore(player, "max_hp", maxHp);
        setScore(player, "hp", maxHp);
        setScore(player, "max_mp", maxMp);
        setScore(player, "mp", maxMp);
        setScore(player, "hunger", 100);
        setScore(player, "restless", 100);
        player.addTag(INITIALIZED_TAG);
    }
}

initWorld();

world.afterEvents.playerSpawn.subscribe((event) => {
    system.runTimeout(() => initPlayer(event.player), 40);
});
