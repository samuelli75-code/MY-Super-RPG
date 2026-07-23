import { system, world } from "@minecraft/server";
import { openPiggyBankUI } from "../interaction/bank_ui.js";

const PIGGY_BANK = "mysrpg:piggy_bank";

world.afterEvents.itemUse.subscribe((event) => {
    const player = event.source;
    if (!player || event.itemStack?.typeId !== PIGGY_BANK) return;

    system.run(() => openPiggyBankUI(player));
});