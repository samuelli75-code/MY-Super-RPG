// Armor classification used by class_registry and combat_system.
// Add new armor types here — all armor logic reads from these tables.

export const ARMOR_SLOTS = ["Head", "Chest", "Legs", "Feet"];

export const LIGHT_ARMOR_MATERIALS = ["leather", "chainmail", "golden"];

// copper added per v4 balance decision
export const HEAVY_ARMOR_MATERIALS = ["copper", "iron", "diamond", "netherite"];

export const HEAVY_ARMOR_HELMETS = ["minecraft:turtle_helmet"];

export const ARMOR_DEFENSE_MULTIPLIER = {
    none:  1.00,
    light: 0.90,
    heavy: 0.75
};
