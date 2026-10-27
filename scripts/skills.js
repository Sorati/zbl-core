Hooks.once('init', () => {
  CONFIG.DND5E.skills.anm = {
    label: game.i18n.localize("ZBL.Skill.Animism"),
    ability: 'wis',
    fullKey: 'animism',
    icon: "icons/magic/nature/leaf-glow-green.webp"

    // Добавим после создания страницы правил:
    // reference: "Compendium.zbl.rules.JournalEntry.<ID>.JournalEntryPage.<ID>"
  }
})