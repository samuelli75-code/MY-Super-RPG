import { system, world } from "@minecraft/server";
import { getMovementMultiplier } from "../classes/class_registry.js";

const modifiedMovement = new Map();

function setMovementMultiplier(player, multiplier) {
    try {
        const movement = player.getComponent("minecraft:movement");
        if (!movement || typeof movement.setCurrentValue !== "function") {
            return;
        }

        let baseMovement = modifiedMovement.get(player.id);
        if (!baseMovement) {
            baseMovement =
                movement.defaultValue ?? movement.currentValue;
            modifiedMovement.set(player.id, baseMovement);
        }

        movement.setCurrentValue(baseMovement * multiplier);
    } catch {}
}

system.runInterval(() => {
    const onlineIds = new Set();

    for (const player of world.getAllPlayers()) {
        onlineIds.add(player.id);
        setMovementMultiplier(
            player,
            getMovementMultiplier(player)
        );
    }

    for (const playerId of modifiedMovement.keys()) {
        if (!onlineIds.has(playerId)) {
            modifiedMovement.delete(playerId);
        }
    }
}, 10);
