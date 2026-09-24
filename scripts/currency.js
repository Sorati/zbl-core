const ZBL_CURRENCIES = {
  yas: {
    label: "ZBL.Currency.yas",
    abbreviation: "ЯС",
    conversion: 100,
    fractionalDigits: 2,
    icon: "modules/zbl-core/assets/icons/currency/yas.webp"
  },

  hanas: {
    label: "ZBL.Currency.hanas",
    abbreviation: "ХН",
    conversion: 10,
    icon: "modules/zbl-core/assets/icons/currency/hanas.webp"
  },

  naka: {
    label: "ZBL.Currency.naka",
    abbreviation: "НК",
    conversion: 1,
    icon: "modules/zbl-core/assets/icons/currency/naka.webp"
  }
};

const ZBL_ALLOWED_CURRENCIES = new Set([
  "yas",
  "hanas",
  "naka"
]);

Hooks.once("init", () => {
  for (const [key, currency] of Object.entries(ZBL_CURRENCIES)) {
    CONFIG.DND5E.currencies[key] = {
      ...currency,
      label: game.i18n.localize(currency.label)
    };
  }
});

Hooks.on("preCreateItem", (item, data) => {
  if (!item.system?.price) return;

  // Предмет из компендиума обрабатывается migration.js.
  if (
    data?._stats?.compendiumSource ||
    data?.flags?.core?.sourceId
  ) {
    return;
  }

  // Для обычного нового предмета ЯС используется по умолчанию.
  item.updateSource({
    "system.price.denomination": "yas"
  });
});

Hooks.on("renderItemSheet5e", (app, element) => {
  const select = element.querySelector(
    'select[name="system.price.denomination"]'
  );

  if (!select) return;

  for (const option of [...select.options]) {
    if (!ZBL_ALLOWED_CURRENCIES.has(option.value)) {
      option.remove();
    }
  }
});

Hooks.once("ready", () => {
  const CurrencyManager = dnd5e.applications?.CurrencyManager;

  if (!CurrencyManager) {
    console.error("ZBL-Core | CurrencyManager не найден.");
    return;
  }

  CurrencyManager.convertCurrency = async function (doc) {
    const currency = foundry.utils.deepClone(
      doc.system.currency
    );

    const yas = Math.floor(Number(currency.yas ?? 0));
    const hanas = Math.floor(Number(currency.hanas ?? 0));
    const naka = Math.floor(Number(currency.naka ?? 0));

    // Переводим всё в Наки.
    let totalNaka =
      yas * 100 +
      hanas * 10 +
      naka;

    // Собираем максимально крупные целые номиналы.
    const newYas = Math.floor(totalNaka / 100);
    totalNaka %= 100;

    const newHanas = Math.floor(totalNaka / 10);
    totalNaka %= 10;

    const newNaka = totalNaka;

    return doc.update({
      "system.currency.yas": newYas,
      "system.currency.hanas": newHanas,
      "system.currency.naka": newNaka
    });
  };

  console.log("ZBL-Core | Конвертация валюты настроена.");
});