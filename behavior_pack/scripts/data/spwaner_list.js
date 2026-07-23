export const SPAWNER_LIST = [
    {
        id: "camp_merchant",
        entityTypeId: "mysrpg:camp_merchant",
        tag: "mysrpg_spawner_camp_merchant",
        nameTag: "Camp Merchant",
        spawnMessage: "Camp Merchant has appeared nearby",
        dimensionIds: ["minecraft:overworld"],
        minAbsoluteTime: 24000,
        daylightOnly: true,
        spawnArea: {
            mode: "around_player_safe",
            radius: 200,
            preferredRadius: 48,
            minDistance: 16,
            attempts: 48,
            ySearchUp: 32,
            ySearchDown: 96
        },
        maxDistanceFromSpawn: 240,
        permanent: true,
        placeCampfire: true,
        extraTags: ["shop:camp_shop"]
    },
    {
        id: "purple_golem",
        entityTypeId: "mysrpg:purple_golem",
        tag: "mysrpg_spawner_purple_golem",
        nameTag: "Purple Golem",
        spawnMessage: "A Purple Golem boss has appeared nearby!",
        dimensionIds: ["minecraft:overworld"],
        minAbsoluteTime: 48000,
        daylightOnly: false,
        spawnArea: {
            mode: "around_player_safe",
            radius: 160,
            preferredRadius: 56,
            minDistance: 28,
            attempts: 40,
            ySearchUp: 24,
            ySearchDown: 64
        },
        maxDistanceFromSpawn: 200,
        aliveTicks: 12000,
        respawnTicks: 18000,
        permanent: false,
        placeCampfire: false,
        extraTags: ["mysrpg_boss"]
    }
];
