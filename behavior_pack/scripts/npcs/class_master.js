import { system, world } from "@minecraft/server";
import { openClassUI } from "../interaction/class_ui.js";

const CLASS_MASTER_ENTITY = "mysrpg:class_master";

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    if (event.target.typeId !== CLASS_MASTER_ENTITY) return;
    system.run(() => openClassUI(event.player));
});
