import { ItemStack } from "@minecraft/server";
import { ActionFormData } from "@minecraft/server-ui";
import { TRADE_ITEMS } from "../data/trade_items.js";
import { addMoney, getMoney, removeMoney } from "../systems/economy_core.js";

const DEFAULT_STACK_SIZE = 64;
const COLOR = "\u00a7";

function getTradeStacks(tradeItem) {
    if (tradeItem.items) return tradeItem.items;
    return [{
        item: tradeItem.item,
        amount: tradeItem.amount ?? 1,
        maxStackSize: tradeItem.maxStackSize
    }];
}

function getStackSize(stack) {
    return stack.maxStackSize ?? DEFAULT_STACK_SIZE;
}

function canFitTradeItems(inventory, tradeItem) {
    let emptySlots = 0;
    const remainingCapacityByItem = new Map();

    for (let slot = 0; slot < inventory.size; slot++) {
        const current = inventory.getItem(slot);
        if (!current) {
            emptySlots++;
            continue;
        }

        const capacity = DEFAULT_STACK_SIZE - current.amount;
        if (capacity <= 0) continue;

        remainingCapacityByItem.set(
            current.typeId,
            (remainingCapacityByItem.get(current.typeId) ?? 0) + capacity
        );
    }

    for (const stack of getTradeStacks(tradeItem)) {
        const existingCapacity =
            remainingCapacityByItem.get(stack.item) ?? 0;
        const amountNeedingSlots = Math.max(
            0,
            (stack.amount ?? 1) - existingCapacity
        );
        const neededSlots = Math.ceil(
            amountNeedingSlots / getStackSize(stack)
        );

        emptySlots -= neededSlots;
        if (emptySlots < 0) return false;
    }

    return true;
}

function giveTradeItems(inventory, tradeItem) {
    for (const stack of getTradeStacks(tradeItem)) {
        let remaining = stack.amount ?? 1;
        const stackSize = getStackSize(stack);

        while (remaining > 0) {
            const amount = Math.min(remaining, stackSize);
            if (inventory.addItem(new ItemStack(stack.item, amount))) {
                return false;
            }
            remaining -= amount;
        }
    }

    return true;
}

function buttonLabel(item, affordable) {
    const color = affordable ? `${COLOR}2` : `${COLOR}c`;
    return `${color}${item.name}\n${COLOR}6$${item.price}`;
}

export function openTradeUI(player, shopType) {
    const shopItems = TRADE_ITEMS[shopType];
    if (!shopItems) {
        player.sendMessage(`${COLOR}cShop not found`);
        return;
    }

    const money = getMoney(player);
    const form = new ActionFormData()
        .title("Shop")
        .body(`${COLOR}6$${money} available`);

    for (const item of shopItems) {
        form.button(buttonLabel(item, money >= item.price), item.icon);
    }

    form.show(player).then(async (response) => {
        if (response.canceled) return;

        const selected = shopItems[response.selection];
        const currentMoney = getMoney(player);

        if (currentMoney < selected.price) {
            player.sendMessage(`${COLOR}cNot enough money`);
            openTradeUI(player, shopType);
            return;
        }

        const inventory =
            player.getComponent("minecraft:inventory")?.container;
        if (!inventory) {
            player.sendMessage(`${COLOR}cInventory not found`);
            return;
        }

        if (!canFitTradeItems(inventory, selected)) {
            player.sendMessage(`${COLOR}cNot enough inventory space`);
            openTradeUI(player, shopType);
            return;
        }

        let deducted = false;
        try {
            const paid = await removeMoney(player, selected.price);
            if (!paid) {
                player.sendMessage(`${COLOR}cPurchase failed`);
                openTradeUI(player, shopType);
                return;
            }
            deducted = true;

            if (!giveTradeItems(inventory, selected)) {
                const refunded = await addMoney(player, selected.price);
                player.sendMessage(
                    refunded
                        ? `${COLOR}cPurchase failed — money refunded`
                        : `${COLOR}cPurchase failed — refund failed, contact admin`
                );
                if (!refunded) {
                    console.warn(
                        `[TradeUI] Refund failed for ${selected.name} ($${selected.price})`
                    );
                }
                openTradeUI(player, shopType);
                return;
            }

            player.sendMessage(
                `${COLOR}aPurchased ${selected.name}`
            );
        } catch (error) {
            if (deducted) {
                const refunded = await addMoney(player, selected.price);
                if (!refunded) {
                    console.warn(
                        `[TradeUI] Refund failed after error for ${selected.name} ($${selected.price}): ${error}`
                    );
                }
            }
            player.sendMessage(`${COLOR}cPurchase failed`);
            console.warn(`[TradeUI] ${selected.name}: ${error}`);
            openTradeUI(player, shopType);
        }
    });
}
