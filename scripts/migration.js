const ZBL_OLD_CURRENCIES = new Set([
  "pp",
  "gp",
  "ep",
  "sp",
  "cp"
]);

const ZBL_NEW_CURRENCIES = new Set([
  "yas",
  "hanas",
  "naka"
]);

const ZBL_TO_GP = {
  pp: 10,
  gp: 1,
  ep: 0.5,
  sp: 0.1,
  cp: 0.01
};

function zblConvertPrice(value, denomination) {
  value = Number(value) || 0;

  if (value <= 0) return null;

  if (!Object.hasOwn(ZBL_TO_GP, denomination)) {
    return null;
  }

  const gpValue = value * ZBL_TO_GP[denomination];

  // Всё дешевле 1 зм становится 1 НК.
  if (gpValue < 1) {
    return {
      value: 1,
      denomination: "naka"
    };
  }

  // 100 зм = 1 ЯС.
  if (
    gpValue >= 100 &&
    gpValue % 100 === 0
  ) {
    return {
      value: gpValue / 100,
      denomination: "yas"
    };
  }

  // 10 зм = 1 ХН.
  if (
    gpValue >= 10 &&
    gpValue % 10 === 0
  ) {
    return {
      value: gpValue / 10,
      denomination: "hanas"
    };
  }

  // Остальное = НК.
  return {
    value: Math.round(gpValue),
    denomination: "naka"
  };
}

function zblIsCompendiumItem(data) {
  return Boolean(
    data?._stats?.compendiumSource ||
    data?.flags?.core?.sourceId
  );
}

Hooks.on("preCreateItem", (item, data) => {
  if (!zblIsCompendiumItem(data)) return;

  const price = data.system?.price;

  if (!price) return;

  const value = Number(price.value);
  const denomination = price.denomination;

  if (
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return;
  }

  // Уже наша валюта — ничего не меняем.
  if (ZBL_NEW_CURRENCIES.has(denomination)) {
    return;
  }

  // Не стандартная валюта D&D — ничего не меняем.
  if (!ZBL_OLD_CURRENCIES.has(denomination)) {
    return;
  }

  const newPrice = zblConvertPrice(
    value,
    denomination
  );

  if (!newPrice) return;

  item.updateSource({
    "system.price.value": newPrice.value,
    "system.price.denomination": newPrice.denomination
  });

  console.log(
    `ZBL-Core | ${data.name}: ` +
    `${value} ${denomination} → ` +
    `${newPrice.value} ${newPrice.denomination}`
  );
});