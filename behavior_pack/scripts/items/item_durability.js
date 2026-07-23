export function damageHeldItem(player, expectedTypeId, amount = 1) {
    try {
        const equippable = player.getComponent("minecraft:equippable");
        const item = equippable?.getEquipment("Mainhand");
        if (!item || item.typeId !== expectedTypeId) return;

        const durability = item.getComponent("minecraft:durability");
        if (!durability) return;

        const nextDamage = durability.damage + Math.max(1, amount);
        if (nextDamage >= durability.maxDurability) {
            equippable.setEquipment("Mainhand", undefined);
            player.playSound("random.break", { pitch: 1, volume: 1 });
            return;
        }

        durability.damage = nextDamage;
        equippable.setEquipment("Mainhand", item);
    } catch {}
}
