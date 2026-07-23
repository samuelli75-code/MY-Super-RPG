import { system, world } from "@minecraft/server";
import { castWithCostAndCooldown } from "../spells/spell_casting.js";
import {
    launchSpellProjectile,
    SPELL_HIT_MODES
} from "../spells/spell_projectile.js";
import { getSpellByRune } from "../spells/spell_registry.js";
import { damageHeldItem } from "./item_durability.js";

const WAND_ID = "mysrpg:wand";
const STAFF_ID = "mysrpg:staff";
const SCEPTER_ID = "mysrpg:scepter";
const STAFF_MAX_CHARGE_TICKS = 20;
const staffChargeStartTick = new Map();
const CAST_ANIMATIONS = [
    "animation.player.attack.positions",
    "animation.player.attack.rotations",
    "animation.player.bow_and_arrow"
];
const CAST_ANIMATION_COMMANDS = [
    "playanimation @s animation.player.attack.positions default 0.05 query.any_animation_finished controller.animation.mysrpg_cast_positions",
    "playanimation @s animation.player.attack.rotations default 0.05 query.any_animation_finished controller.animation.mysrpg_cast_rotations"
];

function getEquipment(player, slot) {
    try {
        return player.getComponent("minecraft:equippable")?.getEquipment(slot);
    } catch {
        return undefined;
    }
}

function getMainhandId(player) {
    return getEquipment(player, "Mainhand")?.typeId;
}

function getRuneSpell(player) {
    const offhand = getEquipment(player, "Offhand");
    return getSpellByRune(offhand?.typeId);
}

function getStaffCharge(player) {
    const startedTick = staffChargeStartTick.get(player.id);
    staffChargeStartTick.delete(player.id);
    if (typeof startedTick !== "number") return 0.35;

    const ticks = Math.max(1, system.currentTick - startedTick);
    return Math.min(1, ticks / STAFF_MAX_CHARGE_TICKS);
}

function buildProjectileSpell(spell, overrides) {
    return {
        name: spell.name,
        ...spell.projectile,
        ...overrides
    };
}

function playCastAnimation(player) {
    let playedCommand = false;
    for (const command of CAST_ANIMATION_COMMANDS) {
        try {
            player.runCommand(command);
            playedCommand = true;
        } catch {}
    }
    if (playedCommand) return;

    for (const animationId of CAST_ANIMATIONS) {
        try {
            player.playAnimation(animationId, {
                blendOutTime: 0.15,
                controller: `controller.animation.mysrpg_cast_${animationId.replace(/\./g, "_")}`,
                nextState: "default",
                stopExpression: "query.any_animation_finished"
            });
            return;
        } catch {}
    }
}

function castProjectileWithCost(player, spell, projectileOverrides) {
    if (!spell?.projectile?.onHitEntity) {
        player.sendMessage("\u00a7cThis rune needs a different caster.");
        return false;
    }

    return castWithCostAndCooldown(player, {
        id: spell.id,
        name: spell.name,
        mpCost: spell.mpCost,
        cooldownTicks: spell.cooldownTicks,
        onCast: (caster) => launchSpellProjectile(
            caster,
            buildProjectileSpell(spell, projectileOverrides)
        )
    });
}

function castWand(player) {
    const spell = getRuneSpell(player);
    if (!spell) {
        player.sendMessage("\u00a7ePut a spell rune in your offhand.");
        return false;
    }

    const success = castProjectileWithCost(player, spell, {
        hitMode: SPELL_HIT_MODES.ENTITY_ONLY,
        speed: 1.2,
        onHitBlock: undefined,
        onExpireExplode: false
    });
    if (success) {
        playCastAnimation(player);
        damageHeldItem(player, WAND_ID);
    }
    return success;
}

function castStaff(player, charge = 0.35) {
    const spell = getRuneSpell(player);
    if (!spell) {
        player.sendMessage("\u00a7ePut a spell rune in your offhand.");
        return false;
    }

    const power = Math.max(0.25, Math.min(1, charge));
    const success = castProjectileWithCost(player, spell, {
        hitMode: SPELL_HIT_MODES.ENTITY_OR_BLOCK,
        speed: 0.7 + power * 0.8,
        maxLifeTicks: 40 + Math.round(power * 80)
    });
    if (success) {
        playCastAnimation(player);
        damageHeldItem(player, STAFF_ID);
    }
    return success;
}

function castScepter(player) {
    const spell = getRuneSpell(player);
    if (!spell) {
        player.sendMessage("\u00a7ePut a spell rune in your offhand.");
        return false;
    }

    if (typeof spell.castDirect !== "function") {
        player.sendMessage("\u00a7cThis rune needs a wand or staff.");
        return false;
    }

    const success = spell.castDirect(player);
    if (success) {
        playCastAnimation(player);
        damageHeldItem(player, SCEPTER_ID);
    }
    return success;
}

world.afterEvents.itemStartUse?.subscribe((event) => {
    const player = event.source;
    if (!player || event.itemStack?.typeId !== STAFF_ID) return;
    staffChargeStartTick.set(player.id, system.currentTick);
});

world.afterEvents.itemStopUse?.subscribe((event) => {
    const player = event.source;
    if (!player || getMainhandId(player) !== STAFF_ID) return;
    system.run(() => castStaff(player, getStaffCharge(player)));
});

world.afterEvents.itemUse.subscribe((event) => {
    const player = event.source;
    if (!player) return;

    const itemTypeId = event.itemStack?.typeId;
    system.run(() => {
        if (itemTypeId === WAND_ID) castWand(player);
        if (itemTypeId === SCEPTER_ID) castScepter(player);
        if (itemTypeId === STAFF_ID && !world.afterEvents.itemStopUse) {
            castStaff(player, 0.35);
        }
    });
});
