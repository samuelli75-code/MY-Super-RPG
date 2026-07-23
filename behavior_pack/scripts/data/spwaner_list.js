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
    }
];
