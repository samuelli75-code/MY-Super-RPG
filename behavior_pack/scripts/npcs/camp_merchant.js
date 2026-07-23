import { world, system } from "@minecraft/server";
import { openTradeUI } from "../interaction/trade_ui.js";

const CAMP_MERCHANT_ENTITY = "mysrpg:camp_merchant";
const SHOP_TAG_PREFIX = "shop:";

function getShopType(entity) {
    const shopTag = entity.getTags().find((tag) => tag.startsWith(SHOP_TAG_PREFIX));
    return shopTag?.slice(SHOP_TAG_PREFIX.length) ?? "camp_shop";
}

world.beforeEvents.playerInteractWithEntity.subscribe((event) => {
    const player = event.player;
    const entity = event.target;

    if (entity.typeId !== CAMP_MERCHANT_ENTITY) return;

    system.run(() => {
        openTradeUI(player, getShopType(entity));
    });
});
