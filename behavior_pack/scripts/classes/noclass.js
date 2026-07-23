export const NO_CLASS_RULES = {
    key: "noclass",
    getMovementMultiplier() {
        return 1;
    },
    getSpellMpMultiplier() {
        return 1;
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
        return context;
    }
};
