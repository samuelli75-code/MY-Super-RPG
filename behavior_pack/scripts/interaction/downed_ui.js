import { ActionFormData } from "@minecraft/server-ui";
import { getScore } from "../data/class_utils.js";

export function showDownedUI(player, onWaitUntilDawn, onRelease) {
    const maxHp = Math.max(1, getScore(player, "max_hp"));
    const mp = Math.max(0, getScore(player, "mp"));
    const maxMp = Math.max(0, getScore(player, "max_mp"));

    new ActionFormData()
        .title("Downed")
        .body(
            `HP: 0/${maxHp}   MP: ${mp}/${maxMp}\n\n` +
            "Your body has fallen. Choose how you return."
        )
        .button("Wait Until Dawn")
        .button("Release Your Soul")
        .show(player)
        .then((response) => {
            if (response.canceled) return;
            if (response.selection === 0) onWaitUntilDawn();
            if (response.selection === 1) onRelease();
        })
        .catch(() => {});
}
