
const ZBL_MODULE_ID = "zbl-core";
const ZBL_ARTIFACT_PACK_ID = "zbl-core.zbl-core-artifact";
const ZBL_FEATURE_PACK_ID = "zbl-core.zbl-core-artifact-features";

const ZBL_SET_FLAG = "artifactSet";
const ZBL_AUTO_FLAG = "autoGrantedArtifactSet";
const ZBL_SET_TYPE = "zblArtifactSet";

let zblArtifactSetDefinitions = null;
const zblArtifactSetSyncing = new Set();

/**
 * Регистрируем новый тип особенности в стандартном списке D&D5e.
 */
Hooks.once("init", () => {
    CONFIG.DND5E.featureTypes[ZBL_SET_TYPE] = {
        label: "Особенность набора артефактов"
    };

    console.log(
        "ZBL-Core | Зарегистрирован тип «Особенность набора артефактов»."
    );
});

/**
 * Интерфейс настройки набора артефактов в листе особенности.
 */
async function zblRenderArtifactSetEditor(app, html) {
    const item = app.document ?? app.item;

    if (!item || item.type !== "feat") return;

    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    const typeSelect = root.querySelector(
        'select[name="system.type.value"]'
    );

    if (!typeSelect) return;

    // Не создаём интерфейс повторно при перерисовке листа.
    if (root.querySelector(".zbl-artifact-set-fields")) return;

    const typeGroup = typeSelect.closest(".form-group");
    if (!typeGroup) return;

    const savedConfig =
        item.getFlag(ZBL_MODULE_ID, ZBL_SET_FLAG) ?? {};

    let requiredItems = Array.isArray(savedConfig.requiredItems)
        ? structuredClone(savedConfig.requiredItems)
        : [];

    const section = document.createElement("div");
    section.className = "form-group zbl-artifact-set-fields";

    const label = document.createElement("label");
    label.textContent = "Требуемые артефакты";

    const fields = document.createElement("div");
    fields.className = "form-fields";
    fields.style.display = "block";

    const dropZone = document.createElement("div");
    dropZone.className = "zbl-artifact-drop-zone";
    dropZone.textContent =
        "Перетащи сюда артефакты из компендиума «Артефакты»";

    const list = document.createElement("ol");
    list.className = "zbl-artifact-set-list";

    fields.append(dropZone, list);
    section.append(label, fields);

    // Вставляем сразу после стандартного поля «Тип».
    typeGroup.insertAdjacentElement("afterend", section);

    async function saveItems() {
        await item.setFlag(ZBL_MODULE_ID, ZBL_SET_FLAG, {
            requiredItems
        });
    }

    function renderList() {
        list.replaceChildren();

        if (requiredItems.length === 0) {
            const empty = document.createElement("li");
            empty.className = "zbl-artifact-set-empty";
            empty.textContent = "Артефакты пока не добавлены.";
            list.append(empty);
            return;
        }

        for (const artifact of requiredItems) {
            const entry = document.createElement("li");
            entry.className = "zbl-artifact-set-entry";

            const name = document.createElement("span");
            name.textContent = artifact.name;

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "zbl-artifact-set-remove";
            remove.textContent = "Удалить";
            remove.title = `Убрать ${artifact.name} из набора`;

            remove.addEventListener("click", async () => {
                requiredItems = requiredItems.filter(
                    candidate => candidate.uuid !== artifact.uuid
                );

                await saveItems();
                renderList();
            });

            entry.append(name, remove);
            list.append(entry);
        }
    }

    function updateVisibility() {
        section.hidden = typeSelect.value !== ZBL_SET_TYPE;
    }

    typeSelect.addEventListener("change", updateVisibility);

    dropZone.addEventListener("dragover", event => {
        event.preventDefault();
        dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", async event => {
        event.preventDefault();
        dropZone.classList.remove("drag-over");

        try {
            const raw = event.dataTransfer?.getData("text/plain");
            if (!raw) {
                ui.notifications.warn(
                    "Не удалось прочитать перетаскиваемый предмет."
                );
                return;
            }

            const data = JSON.parse(raw);

            if (data.type !== "Item" || !data.uuid) {
                ui.notifications.warn(
                    "Перетащи сюда предмет из компендиума."
                );
                return;
            }

            const artifact = await fromUuid(data.uuid);

            if (!artifact || artifact.type !== "equipment") {
                ui.notifications.warn(
                    "Добавлять можно только предметы экипировки."
                );
                return;
            }

            if (!artifact.uuid.startsWith(
                `Compendium.${ZBL_ARTIFACT_PACK_ID}.Item.`
            )) {
                ui.notifications.warn(
                    "Выбирай предметы из компендиума ZBL-Core → Артефакты."
                );
                return;
            }

            if (requiredItems.some(
                entry => entry.uuid === artifact.uuid
            )) {
                ui.notifications.info(
                    "Этот артефакт уже добавлен."
                );
                return;
            }

            requiredItems.push({
                uuid: artifact.uuid,
                name: artifact.name
            });

            await saveItems();
            renderList();

        } catch (error) {
            console.error(
                "ZBL-Core | Ошибка добавления артефакта:",
                error
            );

            ui.notifications.error(
                "Не удалось добавить артефакт."
            );
        }
    });

    renderList();
    updateVisibility();
}

Hooks.on("renderItemSheet5e", (app, html) => {
    void zblRenderArtifactSetEditor(app, html);
});

/**
 * Загружаем определения особенностей наборов из компендиума.
 */
async function zblGetArtifactSetDefinitions() {
    if (zblArtifactSetDefinitions) {
        return zblArtifactSetDefinitions;
    }

    const pack = game.packs.get(ZBL_FEATURE_PACK_ID);

    if (!pack) {
        console.error(
            `ZBL-Core | Не найден компендиум ${ZBL_FEATURE_PACK_ID}.`
        );

        return [];
    }

    const documents = await pack.getDocuments();

    zblArtifactSetDefinitions = documents.filter(item => {
        const config = item.getFlag(
            ZBL_MODULE_ID,
            ZBL_SET_FLAG
        );

        return (
            item.type === "feat" &&
            item.system.type?.value === ZBL_SET_TYPE &&
            Array.isArray(config?.requiredItems) &&
            config.requiredItems.length > 0
        );
    });

    return zblArtifactSetDefinitions;
}

/**
 * Возвращает UUID исходного предмета из компендиума.
 */
function zblGetSourceUuid(item) {
    return (
        item.flags?.core?.sourceId ??
        item._stats?.compendiumSource ??
        null
    );
}

/**
 * Проверяем, есть ли у персонажа все нужные настроенные артефакты.
 */
function zblHasRequiredArtifacts(actor, requiredItems) {
    return requiredItems.every(required => {
        return actor.items.some(item => {
            if (item.type !== "equipment") return false;
            if (item.system.attuned !== true) return false;

            return zblGetSourceUuid(item) === required.uuid;
        });
    });
}

/**
 * Синхронизируем автоматически выдаваемые особенности.
 */
async function zblSyncArtifactSets(actor) {
    if (!actor || actor.type !== "character") return;

    const lockKey = actor.uuid ?? actor.id;
    if (zblArtifactSetSyncing.has(lockKey)) return;

    zblArtifactSetSyncing.add(lockKey);

    try {
        const definitions = await zblGetArtifactSetDefinitions();

        for (const definition of definitions) {
            const config = definition.getFlag(
                ZBL_MODULE_ID,
                ZBL_SET_FLAG
            );

            const requiredItems = config?.requiredItems ?? [];
            const featureUuid = definition.uuid;

            const qualifies = zblHasRequiredArtifacts(
                actor,
                requiredItems
            );

            // Ищем особенности, которые этот скрипт выдал автоматически.
            const autoGranted = actor.items.filter(item => {
                return (
                    item.type === "feat" &&
                    item.getFlag(ZBL_MODULE_ID, ZBL_AUTO_FLAG)
                        ?.sourceUuid === featureUuid
                );
            });

            // Если условия больше не выполнены, удаляем только
            // особенности, помеченные как автоматически выданные.
            if (!qualifies) {
                if (autoGranted.length > 0) {
                    await actor.deleteEmbeddedDocuments(
                        "Item",
                        autoGranted.map(item => item.id)
                    );
                }

                continue;
            }

            // Если особенность уже есть у персонажа вручную,
            // второй экземпляр не создаём.
            const alreadyHasFeature = actor.items.some(item => {
                if (item.type !== "feat") return false;

                if (
                    item.getFlag(ZBL_MODULE_ID, ZBL_AUTO_FLAG)
                        ?.sourceUuid === featureUuid
                ) {
                    return true;
                }

                return zblGetSourceUuid(item) === featureUuid;
            });

            if (alreadyHasFeature) continue;

            // Создаём копию особенности из компендиума.
            const featureData = definition.toObject();

            delete featureData._id;

            foundry.utils.setProperty(
                featureData,
                `flags.${ZBL_MODULE_ID}.${ZBL_AUTO_FLAG}`,
                { sourceUuid: featureUuid }
            );

            await actor.createEmbeddedDocuments(
                "Item",
                [featureData]
            );
        }
    } catch (error) {
        console.error(
            `ZBL-Core | Ошибка синхронизации наборов артефактов персонажа ${actor.name}:`,
            error
        );
    } finally {
        zblArtifactSetSyncing.delete(lockKey);
    }
}

/**
 * Запускаем синхронизацию для персонажей.
 */
async function zblSyncAllCharacterArtifactSets() {
    for (const actor of game.actors.contents) {
        if (actor.type === "character") {
            await zblSyncArtifactSets(actor);
        }
    }
}

/**
 * Первичная проверка после загрузки мира.
 */
Hooks.once("ready", () => {
    void zblSyncAllCharacterArtifactSets();
});

/**
 * Повторная проверка при изменении экипировки.
 */
Hooks.on("createItem", item => {
    if (item.parent?.type === "character") {
        void zblSyncArtifactSets(item.parent);
    }
});

Hooks.on("updateItem", item => {
    if (item.parent?.type === "character") {
        void zblSyncArtifactSets(item.parent);
    }
});

Hooks.on("deleteItem", item => {
    if (item.parent?.type === "character") {
        void zblSyncArtifactSets(item.parent);
    }
});
