const BASE_BLOCK_CHANCE = 0.10;
const BLOCK_CHANCE_PER_LEVEL = 0.04;

export const WARRIOR_RULES = {
    key: "warrior",
    getMovementMultiplier() {
        return 1;
    },
    getSpellMpMultiplier() {
        return 1.50;
    },
    getSpellCooldownMultiplier() {
        return 1;
    },
    getHealingMultiplier() {
        return 1;
    },
    getProjectileDamageMultiplier() {
        return 1;
    },
    modifyIncomingCombatDamage(context) {
        const blockChance =
            BASE_BLOCK_CHANCE + context.level * BLOCK_CHANCE_PER_LEVEL;

        if (Math.random() >= blockChance) return context;

        return {
            ...context,
            damage: Math.max(1, Math.ceil(context.damage / 2)),
            blocked: true
        };
    }
};
