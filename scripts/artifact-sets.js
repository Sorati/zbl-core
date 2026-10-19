const ZBL_MODULE_ID = "zbl-core";
const ZBL_SET_FLAG = "artifactSet";
const ZBL_AUTO_FLAG = "autoGrantedArtifactSet";
const ZBL_SET_TYPE = "zblArtifactSet";

let zblArtifactSetDefinitions = null;
let zblArtifactSetDefinitionsPromise = null;

// Защита от повторной синхронизации одного персонажа.
const zblArtifactSetSyncing = new Set();

// Если событие произошло во время синхронизации,
// повторяем её после завершения текущего прохода.
const zblArtifactSetRerun = new Set();

// Защита от повторного создания одной особенности.
const zblArtifactSetPending = new Set();


Hooks.once("init", () => {
    CONFIG.DND5E.featureTypes[ZBL_SET_TYPE] = {
        label: "Особенность набора артефактов"
    };

    console.log("ZBL-Core | Универсальные наборы артефактов загружены.");
});


/* =========================================================
   РЕДАКТОР НАБОРА АРТЕФАКТОВ
   ========================================================= */

async function zblRenderArtifactSetEditor(app, html) {
    const item = app.document ?? app.item;
    if (!item || item.type !== "feat") return;

    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    const typeSelect = root.querySelector('select[name="system.type.value"]');
    if (!typeSelect || root.querySelector(".zbl-artifact-set-fields")) return;

    const typeGroup = typeSelect.closest(".form-group");
    if (!typeGroup) return;

    const savedConfig = item.getFlag(ZBL_MODULE_ID, ZBL_SET_FLAG) ?? {};

    let requiredItems = Array.isArray(savedConfig.requiredItems)
        ? structuredClone(savedConfig.requiredItems)
        : [];

    let draggedUuid = null;
    let rendering = false;
    let renderAgain = false;

    const section = document.createElement("div");
    section.className = "form-group zbl-artifact-set-fields";

    const label = document.createElement("label");
    label.textContent = "Требуемые предметы";

    const fields = document.createElement("div");
    fields.className = "form-fields";
    fields.style.display = "block";

    const dropZone = document.createElement("div");
    dropZone.className = "zbl-artifact-drop-zone";
    dropZone.innerHTML =
        '<i class="fas fa-box-open"></i>' +
        "<span>Перетащи сюда предмет из любого компендиума или с листа предмета</span>";

    const container = document.createElement("div");
    container.className = "zbl-artifact-set-container";

    const header = document.createElement("div");
    header.className = "zbl-artifact-set-header";
    header.textContent = "Требуемые предметы";

    const list = document.createElement("div");
    list.className = "zbl-artifact-set-list";

    container.append(header, list);
    fields.append(dropZone, container);
    section.append(label, fields);
    typeGroup.insertAdjacentElement("afterend", section);


    function isEditing() {
    const form = root.matches("form")
        ? root
        : root.querySelector("form");

    // Сначала проверяем явное состояние блокировки окна.
    if (
        root.classList.contains("locked") ||
        form?.classList.contains("locked")
    ) {
        return false;
    }

    // Затем проверяем явное состояние режима редактирования.
    if (
        root.classList.contains("editable") ||
        form?.classList.contains("editable")
    ) {
        return true;
    }

    // Запасная проверка: может ли пользователь редактировать документ.
    // Это не гарантирует, что режим редактирования сейчас включён.
    return false;
}


    function updateVisibility() {
        const correctType = typeSelect.value === ZBL_SET_TYPE;
        const editing = isEditing();

        section.hidden = !correctType;
        dropZone.hidden = !editing;

        container.classList.toggle("is-editing", editing);
        container.classList.toggle("is-viewing", !editing);
    }


    async function saveItems() {
        await item.setFlag(ZBL_MODULE_ID, ZBL_SET_FLAG, {
            requiredItems
        });

        // После изменения состава набора определения перечитываются.
        zblArtifactSetDefinitions = null;
        zblArtifactSetDefinitionsPromise = null;

        // Если набор изменили во время синхронизации,
        // повторный проход будет запрошен следующими событиями.
    }


    async function moveArtifact(fromUuid, toUuid) {
        if (isEditing() || !fromUuid || !toUuid || fromUuid === toUuid) return;

        const fromIndex = requiredItems.findIndex(x => x.uuid === fromUuid);
        const toIndex = requiredItems.findIndex(x => x.uuid === toUuid);

        if (fromIndex < 0 || toIndex < 0) return;

        [requiredItems[fromIndex], requiredItems[toIndex]] =
            [requiredItems[toIndex], requiredItems[fromIndex]];

        await saveItems();
        await renderList();
    }


    async function renderList() {
        if (rendering) {
            renderAgain = true;
            return;
        }

        rendering = true;

        try {
            do {
                renderAgain = false;
                list.replaceChildren();
                updateVisibility();

                if (!requiredItems.length) {
                    const empty = document.createElement("div");
                    empty.className = "zbl-artifact-set-empty";
                    empty.textContent = "Предметы пока не добавлены.";
                    list.append(empty);
                    continue;
                }

                const TextEditor = foundry.applications.ux.TextEditor.implementation;
                const editing = isEditing();

                for (const artifact of requiredItems) {
                    const entry = document.createElement("div");
                    entry.className = "zbl-artifact-set-entry";
                    entry.dataset.uuid = artifact.uuid;

                    const linkArea = document.createElement("div");
                    linkArea.className = "zbl-artifact-set-link-area";

                    const icon = document.createElement("img");
                    icon.className = "zbl-artifact-set-icon";
                    icon.src = artifact.img || "icons/svg/item-bag.svg";
                    icon.alt = artifact.name;
                    icon.title = artifact.name;
                    icon.draggable = false;

                    const link = document.createElement("span");
                    link.className = "zbl-artifact-set-link";
                    link.innerHTML = await TextEditor.enrichHTML(
                        `@UUID[${artifact.uuid}]{«${artifact.name}»}`,
                        { async: true }
                    );

                    linkArea.append(icon, link);

                    const remove = document.createElement("button");
                    remove.type = "button";
                    remove.className = "zbl-artifact-set-remove";
                    remove.innerHTML = '<i class="fas fa-trash"></i>';
                    remove.title = `Удалить ${artifact.name} из набора`;
                    remove.setAttribute("aria-label", remove.title);
                    remove.hidden = !editing;

                    remove.addEventListener("click", async event => {
                        event.preventDefault();
                        event.stopPropagation();

                        if (!isEditing()) return;

                        requiredItems = requiredItems.filter(
                            x => x.uuid !== artifact.uuid
                        );

                        try {
                            await saveItems();
                            await renderList();
                        } catch (error) {
                            console.error(
                                "ZBL-Core | Ошибка удаления предмета:",
                                error
                            );
                            ui.notifications.error("Не удалось сохранить набор.");
                        }
                    });

                    const reorder = document.createElement("button");
                    reorder.type = "button";
                    reorder.className = "zbl-artifact-set-reorder";
                    reorder.innerHTML = '<i class="fas fa-up-down-left-right"></i>';
                    reorder.title = "Перетащи, чтобы изменить порядок";
                    reorder.setAttribute("aria-label", reorder.title);
                    reorder.draggable = !editing;
                    reorder.hidden = editing;

                    reorder.addEventListener("dragstart", event => {
                        if (isEditing()) {
                            event.preventDefault();
                            return;
                        }

                        draggedUuid = artifact.uuid;
                        entry.classList.add("dragging");

                        event.dataTransfer?.setData("text/plain", artifact.uuid);

                        if (event.dataTransfer) {
                            event.dataTransfer.effectAllowed = "move";
                        }
                    });

                    reorder.addEventListener("dragend", () => {
                        draggedUuid = null;

                        list.querySelectorAll(".dragging, .drag-target").forEach(el => {
                            el.classList.remove("dragging", "drag-target");
                        });
                    });

                    entry.addEventListener("dragover", event => {
                        if (isEditing() || !draggedUuid) return;

                        event.preventDefault();

                        if (event.dataTransfer) {
                            event.dataTransfer.dropEffect = "move";
                        }

                        entry.classList.add("drag-target");
                    });

                    entry.addEventListener("dragleave", event => {
                        if (!entry.contains(event.relatedTarget)) {
                            entry.classList.remove("drag-target");
                        }
                    });

                    entry.addEventListener("drop", async event => {
                        if (isEditing()) return;

                        event.preventDefault();
                        event.stopPropagation();

                        const fromUuid =
                            event.dataTransfer?.getData("text/plain") || draggedUuid;

                        entry.classList.remove("drag-target");

                        try {
                            await moveArtifact(fromUuid, artifact.uuid);
                        } catch (error) {
                            console.error(
                                "ZBL-Core | Ошибка перестановки:",
                                error
                            );
                            ui.notifications.error(
                                "Не удалось изменить порядок предметов."
                            );
                        }

                        draggedUuid = null;
                    });

                    entry.append(linkArea, remove, reorder);
                    list.append(entry);
                }

                updateVisibility();
            } while (renderAgain);
        } finally {
            rendering = false;
        }
    }


    /* Приём предметов из любых компендиумов и с листов предметов. */
    dropZone.addEventListener("dragover", event => {
        if (!isEditing()) return;

        event.preventDefault();
        dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("drag-over");
    });

    dropZone.addEventListener("drop", async event => {
        if (!isEditing()) return;

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
                ui.notifications.warn("Перетащи сюда предмет Foundry.");
                return;
            }

            const document = await fromUuid(data.uuid);

            if (!document || document.documentName !== "Item") {
                ui.notifications.warn("Не удалось найти этот предмет.");
                return;
            }

            if (requiredItems.some(x => x.uuid === document.uuid)) {
                ui.notifications.info("Этот предмет уже добавлен.");
                return;
            }

            requiredItems.push({
                uuid: document.uuid,
                name: document.name,
                img: document.img
            });

            await saveItems();
            await renderList();
        } catch (error) {
            console.error("ZBL-Core | Ошибка добавления предмета:", error);
            ui.notifications.error("Не удалось добавить предмет.");
        }
    });


    typeSelect.addEventListener("change", () => {
        updateVisibility();
        void renderList();
    });

    const observer = new MutationObserver(() => {
        updateVisibility();
        void renderList();
    });

    observer.observe(root, {
        attributes: true,
        attributeFilter: ["class"]
    });

    const form = root.matches("form") ? root : root.querySelector("form");

    if (form && form !== root) {
        observer.observe(form, {
            attributes: true,
            attributeFilter: ["class"]
        });
    }

    await renderList();
    updateVisibility();
}


Hooks.on("renderItemSheet5e", (app, html) => {
    void zblRenderArtifactSetEditor(app, html);
});


/* =========================================================
   ПОИСК ОПРЕДЕЛЕНИЙ ВО ВСЕХ КОМПЕНДИУМАХ
   ========================================================= */

async function zblGetArtifactSetDefinitions() {
    if (zblArtifactSetDefinitions !== null) {
        return zblArtifactSetDefinitions;
    }

    if (zblArtifactSetDefinitionsPromise) {
        return zblArtifactSetDefinitionsPromise;
    }

    zblArtifactSetDefinitionsPromise = (async () => {
        const definitions = [];

        // Особенности, находящиеся непосредственно в мире.
        for (const item of game.items.contents) {
            const config = item.getFlag(ZBL_MODULE_ID, ZBL_SET_FLAG);

            if (
                item.type === "feat" &&
                item.system.type?.value === ZBL_SET_TYPE &&
                Array.isArray(config?.requiredItems) &&
                config.requiredItems.length
            ) {
                definitions.push(item);
            }
        }

        // Ищем определения во всех доступных компендиумах.
        for (const pack of game.packs.contents) {
            if (pack.documentName !== "Item") continue;

            try {
                const documents = await pack.getDocuments();

                for (const item of documents) {
                    const config = item.getFlag(ZBL_MODULE_ID, ZBL_SET_FLAG);

                    if (
                        item.type === "feat" &&
                        item.system.type?.value === ZBL_SET_TYPE &&
                        Array.isArray(config?.requiredItems) &&
                        config.requiredItems.length
                    ) {
                        definitions.push(item);
                    }
                }
            } catch (error) {
                console.warn(
                    `ZBL-Core | Не удалось прочитать компендиум ${pack.collection}:`,
                    error
                );
            }
        }

        // Убираем повторы по UUID.
        const unique = new Map();

        for (const definition of definitions) {
            unique.set(definition.uuid, definition);
        }

        zblArtifactSetDefinitions = [...unique.values()];

        return zblArtifactSetDefinitions;
    })();

    try {
        return await zblArtifactSetDefinitionsPromise;
    } finally {
        zblArtifactSetDefinitionsPromise = null;
    }
}


/* =========================================================
   ИДЕНТИФИКАЦИЯ И ПРОВЕРКА ТРЕБУЕМЫХ ПРЕДМЕТОВ
   ========================================================= */

function zblGetSourceUuid(item) {
    return (
        item.flags?.core?.sourceId ??
        item._stats?.compendiumSource ??
        null
    );
}


function zblItemMatchesRequired(actorItem, required) {
    const sourceUuid = zblGetSourceUuid(actorItem);

    // 1. Точное совпадение UUID.
    if (actorItem.uuid === required.uuid) {
        return true;
    }

    // 2. Совпадение по стандартному UUID источника Foundry.
    if (sourceUuid === required.uuid) {
        return true;
    }

    // 3. Совпадение по собственному флагу ZBL-Core.
    const zblSourceUuid = actorItem.getFlag(
        ZBL_MODULE_ID,
        "artifactSourceUuid"
    );

    if (zblSourceUuid === required.uuid) {
        return true;
    }

    return false;
}


async function zblRestoreArtifactSourceUuids(actor, definitions) {
    if (!game.user?.isGM) return;

    for (const definition of definitions) {
        const config = definition.getFlag(
            ZBL_MODULE_ID,
            ZBL_SET_FLAG
        );

        const requiredItems = config?.requiredItems ?? [];

        for (const required of requiredItems) {
            // Если исходный предмет доступен, используем его
            // для проверки корректности связи.
            const sourceItem = await fromUuid(required.uuid);

            if (!sourceItem || sourceItem.documentName !== "Item") {
                continue;
            }

            // Ищем предметы персонажа с точным совпадением имени.
            const candidates = actor.items.filter(item =>
                item.type === sourceItem.type &&
                item.name === sourceItem.name
            );

            // Не назначаем источник, если название неоднозначно.
            if (candidates.length !== 1) continue;

            const actorItem = candidates[0];

            // Уже есть другая подтверждённая связь — не перезаписываем.
            const existingSource = actorItem.getFlag(
                ZBL_MODULE_ID,
                "artifactSourceUuid"
            );

            if (
                existingSource &&
                existingSource !== required.uuid
            ) {
                continue;
            }

            // Стандартный источник Foundry указывает на другой предмет.
            const coreSource = zblGetSourceUuid(actorItem);

            if (coreSource && coreSource !== required.uuid) {
                continue;
            }

            if (existingSource !== required.uuid) {
                await actorItem.setFlag(
                    ZBL_MODULE_ID,
                    "artifactSourceUuid",
                    required.uuid
                );
            }
        }
    }
}


function zblHasRequiredArtifacts(actor, requiredItems) {
    if (!Array.isArray(requiredItems) || requiredItems.length === 0) {
        return false;
    }

    return requiredItems.every(required => {
        const matchingItem = actor.items.find(item =>
            zblItemMatchesRequired(item, required)
        );

        if (!matchingItem) return false;

        const item = matchingItem;
        const attunement = item.system?.attunement;
        const attuned = item.system?.attuned;

        const requiresAttunement =
            attunement === true ||
            attunement === "required" ||
            attunement === 2;

        if (!requiresAttunement) return true;

        // Поддерживаем булево, числовое и строковое
        // представление состояния настройки.
        return (
            attuned === true ||
            attuned === 1 ||
            attuned === "attuned"
        );
    });
}


function zblGetAutoGrantedFeatures(actor, featureUuid) {
    return actor.items.filter(item => {
        if (item.type !== "feat") return false;

        const marker = item.getFlag(ZBL_MODULE_ID, ZBL_AUTO_FLAG);

        return marker?.sourceUuid === featureUuid;
    });
}


/* =========================================================
   УДАЛЕНИЕ АВТОМАТИЧЕСКИХ ОСОБЕННОСТЕЙ
   ========================================================= */

async function zblDeleteAutoGrantedFeatures(actor, features) {
    if (!actor || !features?.length) return;

    // Сохраняем только уникальные ID существующих особенностей.
    const idsToDelete = [
        ...new Set(
            features
                .map(item => item.id)
                .filter(id => id && actor.items.has(id))
        )
    ];

    if (!idsToDelete.length) return;

    try {
        await actor.deleteEmbeddedDocuments("Item", idsToDelete);
    } catch (error) {
        // После ошибки проверяем, остались ли эти документы.
        const remainingIds = idsToDelete.filter(id =>
            actor.items.has(id)
        );

        // Если все документы уже исчезли, повторное удаление
        // не требуется.
        if (!remainingIds.length) return;

        console.error(
            `ZBL-Core | Не удалось удалить автоматические особенности персонажа ${actor.name}:`,
            error
        );
    }
}



/* =========================================================
   ОДИН ПРОХОД СИНХРОНИЗАЦИИ
   ========================================================= */

async function zblSyncArtifactSetsOnce(actor) {
    const definitions = await zblGetArtifactSetDefinitions();
    
    await zblRestoreArtifactSourceUuids(actor, definitions);

    for (const definition of definitions) {
        const featureUuid = definition.uuid;
        const config = definition.getFlag(ZBL_MODULE_ID, ZBL_SET_FLAG);
        const requiredItems = config?.requiredItems ?? [];

        // Пустой или неправильно настроенный набор не выдаёт особенность.
        const qualifies =
            requiredItems.length > 0 &&
            zblHasRequiredArtifacts(actor, requiredItems);

        console.log("ZBL-Core | Проверка набора:", {
            feature: definition.name,
            requiredCount: requiredItems.length,
            qualifies,
            requiredItems: requiredItems.map(required => ({
                name: required.name,
                uuid: required.uuid,
                found: actor.items.some(item =>
                    zblItemMatchesRequired(item, required)
                )
            }))}
        );

        let autoGranted = zblGetAutoGrantedFeatures(actor, featureUuid);

        if (!qualifies) {
            await zblDeleteAutoGrantedFeatures(actor, autoGranted);
            continue;
        }

        // Убираем только лишние автоматически выданные копии.
        if (autoGranted.length > 1) {
            await zblDeleteAutoGrantedFeatures(actor, autoGranted.slice(1));

            // Получаем актуальный список после удаления.
            autoGranted = zblGetAutoGrantedFeatures(actor, featureUuid);
        }

        // Особенность уже есть — повторно её не создаём.
        if (autoGranted.length) continue;

        // Если игрок уже добавил эту особенность вручную,
        // автоматическую копию не создаём.
        const manuallyAdded = actor.items.some(item => {
            if (item.type !== "feat") return false;

            const marker = item.getFlag(ZBL_MODULE_ID, ZBL_AUTO_FLAG);

            if (marker?.sourceUuid === featureUuid) return false;

            return zblGetSourceUuid(item) === featureUuid;
        });

        if (manuallyAdded) continue;

        const pendingKey = `${actor.uuid ?? actor.id}:${featureUuid}`;

        if (zblArtifactSetPending.has(pendingKey)) continue;

        zblArtifactSetPending.add(pendingKey);

        try {
            // Дополнительная проверка непосредственно перед созданием.
            // Это защищает от дубликатов после повторных событий Foundry.
            if (zblGetAutoGrantedFeatures(actor, featureUuid).length) {
                continue;
            }

            // Убедимся, что предметы всё ещё соответствуют набору.
            const latestConfig = definition.getFlag(
                ZBL_MODULE_ID,
                ZBL_SET_FLAG
            );

            const latestRequiredItems = latestConfig?.requiredItems ?? [];

            if (
                !latestRequiredItems.length ||
                !zblHasRequiredArtifacts(actor, latestRequiredItems)
            ) {
                continue;
            }

            const featureData = definition.toObject();

            delete featureData._id;

            foundry.utils.setProperty(
                featureData,
                `flags.${ZBL_MODULE_ID}.${ZBL_AUTO_FLAG}`,
                { sourceUuid: featureUuid }
            );

            await actor.createEmbeddedDocuments("Item", [featureData]);
        } finally {
            zblArtifactSetPending.delete(pendingKey);
        }
    }
}


/* =========================================================
   ПОСЛЕДОВАТЕЛЬНАЯ СИНХРОНИЗАЦИЯ
   ========================================================= */


async function zblSyncArtifactSets(actor) {
    // Изменять предметы и особенности может только Мастер.
    // Иначе каждый подключённый клиент будет запускать
    // собственную синхронизацию и создавать дубликаты.
    if (!game.user?.isGM) return;

    if (!actor || actor.type !== "character") return;

    const lockKey = actor.uuid ?? actor.id;

    // Если синхронизация уже выполняется, запрашиваем
    // повторную проверку после завершения текущего прохода.
    if (zblArtifactSetSyncing.has(lockKey)) {
        zblArtifactSetRerun.add(lockKey);
        return;
    }

    zblArtifactSetSyncing.add(lockKey);

    try {
        do {
            zblArtifactSetRerun.delete(lockKey);

            try {
                await zblSyncArtifactSetsOnce(actor);
            } catch (error) {
                console.error(
                    `ZBL-Core | Ошибка синхронизации наборов артефактов персонажа ${actor.name}:`,
                    error
                );
            }
        } while (zblArtifactSetRerun.has(lockKey));
    } finally {
        zblArtifactSetSyncing.delete(lockKey);

        if (zblArtifactSetRerun.has(lockKey)) {
            zblArtifactSetRerun.delete(lockKey);
            void zblSyncArtifactSets(actor);
        }
    }
}


async function zblSyncAllCharacterArtifactSets() {
    // Только Мастер выполняет первоначальную синхронизацию.
    if (!game.user?.isGM) return;

    for (const actor of game.actors.contents) {
        if (actor.type === "character") {
            await zblSyncArtifactSets(actor);
        }
    }
}


/* =========================================================
   СОБЫТИЯ FOUNDRY
   ========================================================= */

Hooks.once("ready", () => {
    void zblSyncAllCharacterArtifactSets();
});


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