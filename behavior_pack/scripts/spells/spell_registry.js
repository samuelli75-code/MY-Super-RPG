import { FIREBOLT_SPELL } from "./firebolt.js";
import { ICEBOLT_SPELL } from "./icebolt.js";
import { FLAMEBURST_SPELL } from "./flameburst.js";
import { FROSTBALL_SPELL } from "./frostball.js";
import { FREEZEBREATH_SPELL } from "./freezebreath.js";
import { HEALING_SPELL } from "./healing.js";
import { SANCTUARY_SPELL } from "./sanctuary.js";
import { LIGHTNINGSTRIKE_SPELL } from "./lightningstrike.js";

export const SPELLS = {
    firebolt: FIREBOLT_SPELL,
    icebolt: ICEBOLT_SPELL,
    flameburst: FLAMEBURST_SPELL,
    frostball: FROSTBALL_SPELL,
    freezebreath: FREEZEBREATH_SPELL,
    healing: HEALING_SPELL,
    sanctuary: SANCTUARY_SPELL,
    lightningstrike: LIGHTNINGSTRIKE_SPELL
};

export const RUNE_SPELLS = {
    "mysrpg:firebolt_rune": "firebolt",
    "mysrpg:icebolt_rune": "icebolt",
    "mysrpg:flameburst_rune": "flameburst",
    "mysrpg:frostball_rune": "frostball",
    "mysrpg:freezebreath_rune": "freezebreath",
    "mysrpg:healing_rune": "healing",
    "mysrpg:sanctuary_rune": "sanctuary",
    "mysrpg:lightningstrike_rune": "lightningstrike"
};

export function getSpellByRune(itemTypeId) {
    return SPELLS[RUNE_SPELLS[itemTypeId]];
}
