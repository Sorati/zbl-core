/**
 * ZBL — Миграция валюты
 *
 * Переводит стандартную валюту D&D5e:
 *
 * pp / gp / ep / sp / cp
 *
 * в валюту сеттинга:
 *
 * yas / hanas / naka
 */


// ============================================================
// НАСТРОЙКИ
// ============================================================

const ZBL_OLD_CURRENCIES = [
    "pp",
    "gp",
    "ep",
    "sp",
    "cp"
];

const ZBL_NEW_CURRENCIES = [
    "yas",
    "hanas",
    "naka"
];


// ============================================================
// ПЕРЕВОД СТАРОЙ ВАЛЮТЫ В ЗОЛОТО
// ============================================================

const ZBL_TO_GP = {
    pp: 10,
    gp: 1,
    ep: 0.5,
    sp: 0.1,
    cp: 0.01
};


// ============================================================
// КОНВЕРТАЦИЯ ЦЕНЫ
// ============================================================

function zblConvertPrice(value, denomination) {

    value = Number(value) || 0;

    // Нулевая или отрицательная цена.
    if (value <= 0) {
        return null;
    }

    // Если неизвестная валюта — ничего не делаем.
    if (!ZBL_TO_GP.hasOwnProperty(denomination)) {
        return null;
    }

    // Переводим исходную стоимость в зм.
    const gpValue = value * ZBL_TO_GP[denomination];


    // --------------------------------------------------------
    // Всё дешевле 1 зм → 1 НК
    // --------------------------------------------------------

    if (gpValue < 1) {

        return {
            value: 1,
            denomination: "naka"
        };
    }


    // --------------------------------------------------------
    // 100 зм → ЯС
    //
    // Используем ЯС только если сумма делится на 100.
    // --------------------------------------------------------

    if (
        gpValue >= 100 &&
        gpValue % 100 === 0
    ) {

        return {
            value: gpValue / 100,
            denomination: "yas"
        };
    }


    // --------------------------------------------------------
    // 10 зм → ХН
    //
    // Используем ХН только если сумма делится на 10.
    // --------------------------------------------------------

    if (
        gpValue >= 10 &&
        gpValue % 10 === 0
    ) {

        return {
            value: gpValue / 10,
            denomination: "hanas"
        };
    }


    // --------------------------------------------------------
    // Остальное → НК
    // --------------------------------------------------------

    return {
        value: Math.round(gpValue),
        denomination: "naka"
    };
}


// ============================================================
// МИГРАЦИЯ ОДНОГО ПРЕДМЕТА
// ============================================================

async function zblMigrateItem(item) {

    const price = item.system?.price;

    // У предмета нет цены.
    if (!price) {
        return {
            status: "skipped"
        };
    }


    const value = Number(price.value);
    const denomination = price.denomination;


    // Нет нормальной стоимости.
    if (
        !Number.isFinite(value) ||
        value <= 0
    ) {

        return {
            status: "skipped"
        };
    }


    // --------------------------------------------------------
    // Предмет уже использует валюту сеттинга.
    // --------------------------------------------------------

    if (ZBL_NEW_CURRENCIES.includes(denomination)) {

        return {
            status: "skipped"
        };
    }


    // --------------------------------------------------------
    // Это не старая валюта D&D.
    // --------------------------------------------------------

    if (!ZBL_OLD_CURRENCIES.includes(denomination)) {

        return {
            status: "skipped"
        };
    }


    // --------------------------------------------------------
    // Рассчитываем новую цену.
    // --------------------------------------------------------

    const newPrice = zblConvertPrice(
        value,
        denomination
    );


    if (!newPrice) {

        return {
            status: "skipped"
        };
    }


    // --------------------------------------------------------
    // Обновляем предмет.
    // --------------------------------------------------------

    await item.update({
        "system.price.value": newPrice.value,
        "system.price.denomination": newPrice.denomination
    });


    console.log(
        `ZBL | ${item.name}: ` +
        `${value} ${denomination} → ` +
        `${newPrice.value} ${newPrice.denomination}`
    );


    return {
        status: "migrated",
        oldValue: value,
        oldDenomination: denomination,
        newValue: newPrice.value,
        newDenomination: newPrice.denomination
    };
}


// ============================================================
// СОБИРАЕМ ВСЕ ПРЕДМЕТЫ
// ============================================================

function zblCollectItems() {

    const items = [];


    // --------------------------------------------------------
    // Предметы мира
    // --------------------------------------------------------

    for (const item of game.items) {

        items.push({
            item,
            source: "world"
        });
    }


    // --------------------------------------------------------
    // Предметы актёров
    // --------------------------------------------------------

    for (const actor of game.actors) {

        for (const item of actor.items) {

            items.push({
                item,
                source: "actor"
            });
        }
    }


    return items;
}


// ============================================================
// ЗАДЕРЖКА ДЛЯ ОБНОВЛЕНИЯ ИНТЕРФЕЙСА
// ============================================================

function zblYield() {

    return new Promise(resolve => {

        requestAnimationFrame(() => {

            resolve();

        });

    });
}


// ============================================================
// ЗАПУСК МИГРАЦИИ
// ============================================================

async function zblRunCurrencyMigration(updateProgress) {

    const entries = zblCollectItems();

    const total = entries.length;

    let checked = 0;
    let migrated = 0;
    let skipped = 0;


    console.log(
        `ZBL | Начинаем миграцию. ` +
        `Всего предметов: ${total}`
    );


    // --------------------------------------------------------
    // Если вообще нет предметов.
    // --------------------------------------------------------

    if (total === 0) {

        if (updateProgress) {

            updateProgress({
                checked: 0,
                total: 0,
                migrated: 0,
                skipped: 0,
                percent: 100
            });
        }


        return {
            total: 0,
            checked: 0,
            migrated: 0,
            skipped: 0
        };
    }


    // --------------------------------------------------------
    // Проверяем каждый предмет.
    // --------------------------------------------------------

    for (const entry of entries) {

        try {

            const result =
                await zblMigrateItem(entry.item);


            if (result.status === "migrated") {

                migrated++;

            }
            else {

                skipped++;
            }

        }
        catch (error) {

            console.error(
                `ZBL | Ошибка при миграции предмета "${entry.item.name}"`,
                error
            );

            skipped++;
        }


        checked++;


        // ----------------------------------------------------
        // Рассчитываем прогресс.
        // ----------------------------------------------------

        const percent =
            Math.round(
                (checked / total) * 100
            );


        // ----------------------------------------------------
        // Передаём прогресс интерфейсу.
        // ----------------------------------------------------

        if (updateProgress) {

            updateProgress({
                checked,
                total,
                migrated,
                skipped,
                percent
            });
        }


        // ----------------------------------------------------
        // Даём браузеру обновить интерфейс.
        //
        // Особенно важно при большом количестве предметов.
        // ----------------------------------------------------

        if (
            checked % 5 === 0 ||
            checked === total
        ) {

            await zblYield();
        }
    }


    console.log(
        `ZBL | Миграция завершена. ` +
        `Проверено: ${checked}, ` +
        `изменено: ${migrated}, ` +
        `пропущено: ${skipped}`
    );


    return {
        total,
        checked,
        migrated,
        skipped
    };
}


// ============================================================
// ОКНО МИГРАЦИИ
// ============================================================

class ZBLCurrencyMigrationMenu extends FormApplication {


    static get defaultOptions() {

        return foundry.utils.mergeObject(
            super.defaultOptions,
            {
                id: "zbl-currency-migration",
                title: "Миграция валюты",
                width: 500,
                height: "auto",
                closeOnSubmit: false,
                submitOnChange: false
            }
        );
    }


    get template() {

        return "modules/zbl/templates/currency-migration.html";
    }


    getData() {

        return {
            running: false
        };
    }


    activateListeners(html) {

        super.activateListeners(html);


        html.find(
            ".zbl-start-migration"
        ).on(
            "click",
            () => this._startMigration()
        );
    }


    async _startMigration() {

        // Не допускаем повторного запуска
        // одновременно.

        if (this._migrationRunning) {
            return;
        }


        this._migrationRunning = true;


        const button =
            this.element.find(
                ".zbl-start-migration"
            );


        button.prop(
            "disabled",
            true
        );


        // Показываем блок прогресса.

        const progress =
            this.element.find(
                ".zbl-migration-progress"
            );


        progress.show();


        // Скрываем начальный текст.

        this.element.find(
            ".zbl-migration-description"
        ).hide();


        try {

            const result =
                await zblRunCurrencyMigration(
                    data => this._updateProgress(data)
                );


            this._showResults(result);

        }
        catch (error) {

            console.error(
                "ZBL | Критическая ошибка миграции.",
                error
            );


            this._showError(error);

        }
        finally {

            this._migrationRunning = false;
        }
    }


    _updateProgress(data) {

        const root = this.element;

        if (!root?.length) {
            return;
        }


        // ----------------------------------------------------
        // Progress bar
        // ----------------------------------------------------

        root.find(
            ".zbl-progress-bar"
        ).css(
            "width",
            `${data.percent}%`
        );


        // ----------------------------------------------------
        // Процент
        // ----------------------------------------------------

        root.find(
            ".zbl-progress-percent"
        ).text(
            `${data.percent}%`
        );


        // ----------------------------------------------------
        // Счётчик
        // ----------------------------------------------------

        root.find(
            ".zbl-progress-count"
        ).text(
            `${data.checked} / ${data.total}`
        );


        // ----------------------------------------------------
        // Изменено
        // ----------------------------------------------------

        root.find(
            ".zbl-migrated-count"
        ).text(
            data.migrated
        );


        // ----------------------------------------------------
        // Пропущено
        // ----------------------------------------------------

        root.find(
            ".zbl-skipped-count"
        ).text(
            data.skipped
        );
    }


    _showResults(result) {

        const root = this.element;


        root.find(
            ".zbl-migration-progress"
        ).hide();


        root.find(
            ".zbl-migration-results"
        ).show();


        root.find(
            ".zbl-result-total"
        ).text(
            result.total
        );


        root.find(
            ".zbl-result-migrated"
        ).text(
            result.migrated
        );


        root.find(
            ".zbl-result-skipped"
        ).text(
            result.skipped
        );


        root.find(
            ".zbl-start-migration"
        ).hide();


        root.find(
            ".zbl-close-migration"
        ).show();
    }


    _showError(error) {

        const root = this.element;


        root.find(
            ".zbl-migration-progress"
        ).hide();


        root.find(
            ".zbl-migration-error"
        ).show();


        root.find(
            ".zbl-error-message"
        ).text(
            error?.message ?? String(error)
        );


        root.find(
            ".zbl-close-migration"
        ).show();


        root.find(
            ".zbl-start-migration"
        ).hide();
    }
}


// ============================================================
// РЕГИСТРАЦИЯ МЕНЮ В НАСТРОЙКАХ
// ============================================================

Hooks.once(
    "init",
    () => {

        game.settings.registerMenu(
            "zbl",
            "currencyMigration",
            {
                name: "Миграция валюты",

                label: "Запустить миграцию",

                hint:
                    "Проверить предметы мира и " +
                    "перевести их цены на валюту сеттинга.",

                icon: "fas fa-coins",

                type:
                    ZBLCurrencyMigrationMenu,

                restricted: true
            }
        );


        console.log(
            "ZBL | Меню миграции валюты зарегистрировано."
        );
    }
);