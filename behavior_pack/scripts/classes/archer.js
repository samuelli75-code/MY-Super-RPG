function getClassBonusRate(level) {
    return 0.20 + level * 0.04;
}

export const ARCHER_RULES = {
    key: "archer",
    getMovementMultiplier({ armorWeight }) {
        return armorWeight === "heavy" ? 0.75 : 1;
    },
    getSpellMpMultiplier() {
        return 1.25;
    },
    getSpellCooldownMultiplier() {
        return 1;
    },
    getHealingMultiplier() {
        return 1;
    },
    getProjectileDamageMultiplier({ level }) {
        return 1 + getClassBonusRate(level);
    },
    modifyIncomingCombatDamage(context) {
        return context;
    }
};
