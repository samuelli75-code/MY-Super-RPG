import { ItemStack, world } from "@minecraft/server";
import { addTotalExp } from "../data/class_utils.js";
import { CURRENCIES } from "../data/currency_data.js";
import { MOB_REWARDS } from "../data/mob_rewards.js";
import { consumeCombatCreditPlayers } from "./combat_credit.js";

const CURRENCY_DENOMINATIONS = Object.entries(CURRENCIES)
    .map(([id, data]) => ({ id, value: data.value }))
    .sort((first, second) => second.value - first.value);

function getCurrencyDrops(money) {
    let remaining = Math.max(0, Math.floor(Number(money) || 0));
    const drops = [];

    for (const currency of CURRENCY_DENOMINATIONS) {
        if (remaining < currency.value) continue;

        const amount = Math.floor(remaining / currency.value);
        remaining -= amount * currency.value;
        drops.push({ id: currency.id, amount });
    }

    return drops;
}

function spawnDrop(dimension, id, amount, location) {
    let remaining = Math.max(0, Math.floor(Number(amount) || 0));

    while (remaining > 0) {
        const stackAmount = Math.min(64, remaining);
        remaining -= stackAmount;

        try {
            dimension.spawnItem(new ItemStack(id, stackAmount), location);
        } catch {
            console.warn(`Cannot drop item: ${id}`);
            return;
        }
    }
}

world.afterEvents.entityDie.subscribe((event) => {
    const dead = event.deadEntity;
    const killer = event.damageSource?.damagingEntity;
    const players = consumeCombatCreditPlayers(dead, killer);

    if (
        players.length === 0 ||
        dead.typeId === "minecraft:player"
    ) {
        return;
    }

    const reward = MOB_REWARDS[dead.typeId];
    if (!reward) return;

    for (const player of players) {
        addTotalExp(player, reward.exp);
        player.sendMessage(`\u00a7a+${reward.exp} Total EXP`);
    }

    const drops = [
        ...getCurrencyDrops(reward.money),
        ...(reward.drops ?? [])
    ];

    for (const drop of drops) {
        spawnDrop(dead.dimension, drop.id, drop.amount, dead.location);
    }
});
