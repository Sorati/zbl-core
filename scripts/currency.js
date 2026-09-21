Hooks.once('init', () => {
  CONFIG.DND5E.currencies.yas = {
    label: 'Яс',
    abbreviation: 'ЯС',
    conversion: 0.01,
    fractionalDigits: 2,
    icon: 'modules/zbl/assets/icons/currency/yas.webp',
  }

  CONFIG.DND5E.currencies.hanas = {
    label: 'Ханас',
    abbreviation: 'ХН',
    conversion: 0.1,
    icon: 'modules/zbl/assets/icons/currency/hanas.webp',
  }

  CONFIG.DND5E.currencies.naka = {
    label: 'Нака',
    abbreviation: 'НК',
    conversion: 1,
    icon: 'modules/zbl/assets/icons/currency/naka.webp',
  }
})

Hooks.on("preCreateItem", (item, data, options, userId) => {
    if (!item.system?.price) return;

    item.updateSource({
        "system.price.denomination": "yas"
    });
});

Hooks.on("renderItemSheet5e", (app, element) => {

    const select = element.querySelector(
        'select[name="system.price.denomination"]'
    );

    if (!select) return;

    const allowedCurrencies = new Set([
        "yas",
        "hanas",
        "naka"
    ]);

    for (const option of [...select.options]) {
        if (!allowedCurrencies.has(option.value)) {
            option.remove();
        }
    }
});

Hooks.once("ready", () => {

    const CurrencyManager = dnd5e.applications?.CurrencyManager;

    if (!CurrencyManager) {
        console.error(
            "ZBL | CurrencyManager не найден."
        );
        return;
    }

    CurrencyManager.convertCurrency = async function (doc) {

        const currency = foundry.utils.deepClone(
            doc.system.currency
        );

        // Стоимость в Наках:
        //
        // 1 ЯС = 100 НК
        // 1 ХН = 10 НК
        // 1 НК = 1 НК

        const yas = Math.floor(Number(currency.yas ?? 0));
        const hanas = Math.floor(Number(currency.hanas ?? 0));
        const naka = Math.floor(Number(currency.naka ?? 0));

        let totalNaka =
            yas * 100 +
            hanas * 10 +
            naka;

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

    console.log(
        "ZBL | Конвертация валюты настроена."
    );

});
