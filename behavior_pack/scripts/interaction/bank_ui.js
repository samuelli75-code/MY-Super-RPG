import { ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { CURRENCIES } from "../data/currency_data.js";
import { addMoney, getMoney, removeMoney } from "../systems/economy_core.js";

const COIN_STACK_SIZE = 64;
const STORE_ICON = "textures/items/piggy_bank";

const WITHDRAW_OPTIONS = [
    { label: "\u00a78Nickel Coin",   item: "mysrpg:coin",          icon: "textures/items/coin" },
    { label: "\u00a7cCopper Coin",   item: "mysrpg:coin_copper",   icon: "textures/items/coin_copper" },
    { label: "\u00a7fSilver Coin",   item: "mysrpg:coin_silver",   icon: "textures/items/coin_silver" },
    { label: "\u00a76Gold Coin",     item: "mysrpg:coin_gold",     icon: "textures/items/coin_gold" },
    { label: "\u00a7bPlatinum Coin", item: "mysrpg:coin_platinum", icon: "textures/items/coin_platinum" },
    { label: "\u00a7aBill",          item: "mysrpg:bill",          icon: "textures/items/bill" }
];

function getInventory(player) {
    return player.getComponent("minecraft:inventory")?.container;
}

function canFitItem(inventory, itemTypeId, amount, stackSize = COIN_STACK_SIZE) {
    let capacity = 0;

    for (let slot = 0; slot < inventory.size; slot++) {
        const item = inventory.getItem(slot);

        if (!item) capacity += stackSize;
        else if (item.typeId === itemTypeId) capacity += Math.max(0, stackSize - item.amount);

        if (capacity >= amount) return true;
    }

    return false;
}

function clearSlot(inventory, slot) {
    inventory.setItem(slot);
}

// Returns true on success, false on failure/nothing-to-store
async function storeAllCurrencies(player) {
    const inventory = getInventory(player);
    if (!inventory) {
        player.sendMessage("\u00a7cInventory not found");
        return false;
    }

    const currencySlots = [];
    let storedMoney = 0;
    let storedItems = 0;

    for (let slot = 0; slot < inventory.size; slot++) {
        const item = inventory.getItem(slot);
        if (!item) continue;

        const currency = CURRENCIES[item.typeId];
        if (!currency) continue;

        currencySlots.push(slot);
        storedMoney += currency.value * item.amount;
        storedItems += item.amount;
    }

    if (storedMoney <= 0) {
        player.sendMessage("\u00a7eNo coins to store.");
        return false;
    }

    const stored = await addMoney(player, storedMoney);

    if (!stored) {
        player.sendMessage("\u00a7cFailed to store coins. Your coins were not removed.");
        return false;
    }

    for (const slot of currencySlots) {
        clearSlot(inventory, slot);
    }

    player.sendMessage(
        `\u00a7aStored ${storedItems} coins for ${storedMoney} money. Total: ${getMoney(player)}`
    );
    return true;
}

// Returns true on success, false on failure
async function withdrawCurrency(player, itemTypeId) {
    const inventory = getInventory(player);
    if (!inventory) {
        player.sendMessage("\u00a7cInventory not found");
        return false;
    }

    const currency = CURRENCIES[itemTypeId];

    if (!currency) {
        player.sendMessage("\u00a7cCurrency not found");
        return false;
    }

    if (getMoney(player) < currency.value) {
        player.sendMessage("\u00a7cPiggy Bank does not have enough money");
        return false;
    }

    if (!canFitItem(inventory, itemTypeId, 1)) {
        player.sendMessage("\u00a7cNot enough inventory space");
        return false;
    }

    const removed = await removeMoney(player, currency.value);

    if (!removed) {
        player.sendMessage("\u00a7cWithdraw failed");
        return false;
    }

    const leftover = inventory.addItem(new ItemStack(itemTypeId, 1));

    if (leftover) {
        await addMoney(player, currency.value);
        player.sendMessage("\u00a7cWithdraw failed");
        return false;
    }

    player.sendMessage(`\u00a7aTook 1 ${itemTypeId.replace("mysrpg:", "")} from Piggy Bank`);
    return true;
}

export function openPiggyBankUI(player) {
    const form = new ActionFormData()
        .title("Piggy Bank")
        .body(`Stored Money: ${getMoney(player)}`);

    form.button("Store all coins\nMove inventory coins into Piggy Bank", STORE_ICON);

    for (const option of WITHDRAW_OPTIONS) {
        const value = CURRENCIES[option.item]?.value ?? 0;
        form.button(`${option.label}\n\u00a7rWithdraw 1 - Value: ${value}`, option.icon);
    }

    form.show(player).then(async (response) => {
        if (response.canceled) return;

        if (response.selection === 0) {
            const success = await storeAllCurrencies(player);
            // Success — close UI. Failure (no coins / error) — reopen so they can read the message
            if (!success) openPiggyBankUI(player);
            return;
        }

        const option = WITHDRAW_OPTIONS[response.selection - 1];
        if (option) {
            const success = await withdrawCurrency(player, option.item);
            // Success — close UI. Failure — reopen so they can see the error
            if (!success) openPiggyBankUI(player);
        }
    });
}
