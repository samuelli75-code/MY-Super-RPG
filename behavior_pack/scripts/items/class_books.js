import { system, world } from "@minecraft/server";
import { openClassUI } from "../interaction/class_ui.js";

const CLASS_BOOK = "mysrpg:class_book";

world.afterEvents.itemUse.subscribe((event) => {
    const player = event.source;
    if (!player || event.itemStack?.typeId !== CLASS_BOOK) return;
    system.run(() => openClassUI(player));
});
