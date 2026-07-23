import { world } from "@minecraft/server";
import { CURRENCIES } from "../data/currency_data.js";

const MONEY_OBJ = "money";

function ensureMoney() {
    let objective = world.scoreboard.getObjective(MONEY_OBJ);
    if (!objective) objective = world.scoreboard.addObjective(MONEY_OBJ, "Money");
    return objective;
}

function getParticipants(player) {
    const participants = [];

    if (player.scoreboardIdentity) participants.push(player.scoreboardIdentity);
    participants.push(player);
    if (player.name) participants.push(player.name);

    return participants;
}

async function runPlayerCommand(player, command) {
    if (typeof player.runCommandAsync === "function") {
        await player.runCommandAsync(command);
        return true;
    }

    if (typeof player.runCommand === "function") {
        player.runCommand(command);
        return true;
    }

    return false;
}

function readScore(objective, player) {
    for (const participant of getParticipants(player)) {
        try {
            const score = objective.getScore(participant);
            if (typeof score === "number") return score;
        } catch {
            // Try the next supported participant type.
        }
    }

    return 0;
}

function writeScoreWithApi(objective, player, value) {
    for (const participant of getParticipants(player)) {
        try {
            objective.setScore(participant, value);
            return true;
        } catch {
            // Try the next supported participant type.
        }
    }

    return false;
}

export function getMoney(player) {
    return readScore(ensureMoney(), player);
}

export async function setMoney(player, value) {
    ensureMoney();
    const safeValue = Math.max(0, Math.floor(value));
    const objective = ensureMoney();

    if (writeScoreWithApi(objective, player, safeValue)) {
        return true;
    }

    try {
        await runPlayerCommand(player, `scoreboard players set @s ${MONEY_OBJ} ${safeValue}`);
        return true;
    } catch (error) {
        console.warn(`[Economy] Failed to set money for ${player.name}: ${error}`);
        return false;
    }
}

export async function addMoney(player, amount) {
    return setMoney(player, getMoney(player) + amount);
}

export async function removeMoney(player, amount) {
    return setMoney(player, getMoney(player) - amount);
}

export async function convertCoinToMoney(player, itemId, amount) {
    const data = CURRENCIES[itemId];
    if (!data) return false;

    return addMoney(player, data.value * amount);
}
