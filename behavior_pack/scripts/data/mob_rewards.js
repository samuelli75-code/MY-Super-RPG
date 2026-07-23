function reward(exp, money, extraDrops = []) {
    return {
        exp,
        money,
        drops: extraDrops
    };
}

export const MOB_REWARDS = {
    // Overworld hostile mobs
    "minecraft:spider": reward(3, 2),
    "minecraft:cave_spider": reward(4, 3),
    "minecraft:zombie": reward(3, 2),
    "minecraft:zombie_villager": reward(4, 3),
    "minecraft:husk": reward(4, 3),
    "minecraft:drowned": reward(5, 3),
    "minecraft:skeleton": reward(4, 3),
    "minecraft:stray": reward(5, 4),
    "minecraft:bogged": reward(6, 4),
    "minecraft:parched": reward(6, 4),
    "minecraft:creeper": reward(5, 3),
    "minecraft:slime": reward(3, 2),
    "minecraft:silverfish": reward(2, 1),
    "minecraft:endermite": reward(3, 2),
    "minecraft:phantom": reward(5, 4),
    "minecraft:witch": reward(6, 4),
    "minecraft:breeze": reward(8, 5),
    "minecraft:creaking": reward(9, 5),
    "minecraft:warden": reward(25, 10),

    // Ocean hostile mobs
    "minecraft:guardian": reward(7, 5),
    "minecraft:elder_guardian": reward(15, 10),
    "minecraft:zombie_nautilus": reward(6, 4),

    // Raid mobs. Both old and current Bedrock identifiers are supported.
    "minecraft:pillager": reward(5, 3),
    "minecraft:vindicator": reward(6, 4),
    "minecraft:vindication_illager": reward(6, 4),
    "minecraft:evoker": reward(12, 7),
    "minecraft:evocation_illager": reward(12, 7),
    "minecraft:vex": reward(7, 5),
    "minecraft:ravager": reward(12, 6),

    // Nether hostile and retaliating mobs
    "minecraft:magma_cube": reward(4, 3),
    "minecraft:blaze": reward(7, 4),
    "minecraft:ghast": reward(9, 5),
    "minecraft:wither_skeleton": reward(8, 5),
    "minecraft:hoglin": reward(7, 5),
    "minecraft:zoglin": reward(8, 5),
    "minecraft:piglin": reward(5, 3),
    "minecraft:piglin_brute": reward(10, 6),
    "minecraft:zombified_piglin": reward(6, 4),
    "minecraft:zombie_pigman": reward(6, 4),

    // End hostile and retaliating mobs
    "minecraft:enderman": reward(8, 5),
    "minecraft:shulker": reward(8, 6),

    // Neutral mobs that fight back when attacked
    "minecraft:bee": reward(2, 1),
    "minecraft:wolf": reward(3, 2),
    "minecraft:polar_bear": reward(6, 4),
    "minecraft:panda": reward(4, 2),
    "minecraft:goat": reward(4, 2),
    "minecraft:dolphin": reward(4, 2),
    "minecraft:llama": reward(3, 2),
    "minecraft:trader_llama": reward(3, 2),
    "minecraft:iron_golem": reward(12, 7),

    // Bosses
    "minecraft:wither": reward(80, 40, [
        { id: "minecraft:nether_star", amount: 1 }
    ]),
    "minecraft:ender_dragon": reward(100, 50, [
        { id: "minecraft:dragon_breath", amount: 1 }
    ])
};
