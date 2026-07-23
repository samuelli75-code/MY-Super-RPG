import { ActionFormData } from "@minecraft/server-ui";
import { CLASS_DATA } from "../data/class_data.js";
import {
    addScore,
    getClassLevel,
    getPlayerClass,
    getRequiredClassExp,
    getTotalExp,
    MAX_CLASS_LEVEL,
    setClassLevel,
    setPlayerClass,
    setScore
} from "../data/class_utils.js";
import { refreshDerivedStats } from "../systems/stats_system.js";

function upgradeClass(player, classKey) {
    const classData = CLASS_DATA[classKey];
    const level = getClassLevel(player, classKey);

    if (level >= MAX_CLASS_LEVEL) {
        player.sendMessage(`\u00a7e${classData.name} is already at Lv.${MAX_CLASS_LEVEL}.`);
        return false;
    }

    const requiredExp = getRequiredClassExp(level, classKey);
    const totalExp = getTotalExp(player);

    if (totalExp < requiredExp) {
        player.sendMessage(
            `\u00a7cNot enough EXP. ${classData.name} needs ${requiredExp} EXP.`
        );
        return false;
    }

    setScore(player, "exp", totalExp - requiredExp);
    setClassLevel(player, classKey, level + 1);
    addScore(player, `${classKey}_sp`, 1);

    refreshDerivedStats(player, true);
    player.sendMessage(
        `\u00a76${classData.name} Level Up! \u00a7eLv.${level + 1}`
    );
    player.playSound("random.levelup");
    return true;
}

function openClassChangePage(player) {
    const classKeys = Object.keys(CLASS_DATA);
    const currentClass = getPlayerClass(player);
    const form = new ActionFormData()
        .title("Change Class")
        .body(`Current Class: ${currentClass.name}`);

    for (const classKey of classKeys) {
        const classData = CLASS_DATA[classKey];
        form.button(`${classData.name}\n${classData.description}`, classData.icon);
    }
    form.button("Back");

    form.show(player).then((response) => {
        if (response.canceled) return;
        if (response.selection === classKeys.length) {
            openClassUI(player);
            return;
        }

        const classKey = classKeys[response.selection];
        const classData = CLASS_DATA[classKey];
        if (!classData) return;

        setPlayerClass(player, classKey);
        refreshDerivedStats(player);
        player.sendMessage(`\u00a7aYou are now ${classData.name}.`);
    });
}

export function openClassUI(player) {
    const classKeys = Object.keys(CLASS_DATA);
    const currentClass = getPlayerClass(player);
    const totalExp = getTotalExp(player);
    const form = new ActionFormData()
        .title("Class")
        .body(`Current Class: ${currentClass.name}\nTotal EXP: ${totalExp}`);

    for (const classKey of classKeys) {
        const classData = CLASS_DATA[classKey];
        const level = getClassLevel(player, classKey);

        if (level >= MAX_CLASS_LEVEL) {
            form.button(
                `\u00a76${classData.name}: Lv.${MAX_CLASS_LEVEL}\n\u00a7eMAX LEVEL`,
                classData.icon
            );
            continue;
        }

        const requiredExp = getRequiredClassExp(level, classKey);
        const color = totalExp >= requiredExp ? "\u00a7a" : "\u00a7c";

        form.button(
            `${color}${classData.name}: Lv.${level} -> Lv.${level + 1}\n` +
            `\u00a7rCost: ${requiredExp} EXP`,
            classData.icon
        );
    }
    form.button("Change Class");

    form.show(player).then((response) => {
        if (response.canceled) return;
        if (response.selection === classKeys.length) {
            openClassChangePage(player);
            return;
        }

        const classKey = classKeys[response.selection];
        if (!CLASS_DATA[classKey]) return;
        if (!upgradeClass(player, classKey)) openClassUI(player);
    });
}
