function getClassBonusRate(level) {
    return 0.20 + level * 0.03;
}

export const MAGE_RULES = {
    key: "mage",
    getMovementMultiplier({ armorWeight }) {
        if (armorWeight === "heavy") return 0.50;
        if (armorWeight === "light") return 0.75;
        return 1;
    },
    getSpellMpMultiplier() {
        return 1;
    },
    getSpellCooldownMultiplier({ level }) {
        return 1 - getClassBonusRate(level);
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
