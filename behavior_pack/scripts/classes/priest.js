function getClassBonusRate(level) {
    return 0.20 + level * 0.04;
}

export const PRIEST_RULES = {
    key: "priest",
    getMovementMultiplier({ armorWeight }) {
        return armorWeight === "heavy" ? 0.75 : 1;
    },
    getSpellMpMultiplier() {
        return 1;
    },
    getSpellCooldownMultiplier() {
        return 1;
    },
    getHealingMultiplier({ level }) {
        return 1 + getClassBonusRate(level);
    },
    getBlessingDurationMultiplier({ level }) {
        return 1 + getClassBonusRate(level);
    },
    getProjectileDamageMultiplier() {
        return 1;
    },
    modifyIncomingCombatDamage(context) {
        return context;
    }
};
