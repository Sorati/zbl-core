
const ZBL_MODULE_ID = "zbl-core";
const ZBL_ARTIFACT_PACK_ID = "zbl-core.zbl-core-artifact";
const ZBL_FEATURE_PACK_ID = "zbl-core.zbl-core-artifact-features";

const ZBL_SET_FLAG = "artifactSet";
const ZBL_AUTO_FLAG = "autoGrantedArtifactSet";
const ZBL_SET_TYPE = "zblArtifactSet";

let zblArtifactSetDefinitions = null;

// Не допускаем одновременную синхронизацию одного персонажа.
const zblArtifactSetSyncing = new Set();

// Не допускаем повторной выдачи одной особенности в рамках синхронизации.
const zblArtifactSetPending = new Set();


Hooks.once("init", () => {
    CONFIG.DND5E.featureTypes[ZBL_SET_TYPE] = {
        label: "Особенность набора артефактов"
    };

    console.log(
        "ZBL-Core | Зарегистрирован тип «Особенность набора артефактов»."
    );
});


/* =========================================================
   РЕДАКТОР НАБОРА АРТЕФАКТОВ
   ========================================================= */

async function zblRenderArtifactSetEditor(app, html) {
    const item = app.document ?? app.item;
    if (!item || item.type !== "feat") return;

    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;

    const typeSelect = root.querySelector(
        'select[name="system.type.value"]'
    );

    if (!typeSelect) return;

    if (root.querySelector(".zbl-artifact-set-fields")) return;

    const typeGroup = typeSelect.closest(".form-group");
    if (!typeGroup) return;

    const savedConfig = item.getFlag(
        ZBL_MODULE_ID,
        ZBL_SET_FLAG
    ) ?? {};

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
    dropZone.innerHTML =
        '<i class="fas fa-box-open"></i>' +
        "<span>Перетащи сюда артефакты из компендиума «Артефакты»</span>";

    const container = document.createElement("div");
    container.className = "zbl-artifact-set-container";

    const header = document.createElement("div");
    header.className = "zbl-artifact-set-header";
    header.textContent = "Требуемые артефакты";

    const list = document.createElement("div");
    list.className = "zbl-artifact-set-list";

    container.append(header, list);
    fields.append(dropZone, container);
    section.append(label, fields);

    typeGroup.insertAdjacentElement("afterend", section);


    async function saveItems() {
        await item.setFlag(ZBL_MODULE_ID, ZBL_SET_FLAG, {
            requiredItems
        });
    }


    async function renderList() {
        list.replaceChildren();

        if (requiredItems.length === 0) {
            const empty = document.createElement("div");
            empty.className = "zbl-artifact-set-empty";
            empty.textContent = "Артефакты пока не добавлены.";
            list.append(empty);
            return;
        }

        const TextEditor =
            foundry.applications.ux.TextEditor.implementation;

        for (const artifact of requiredItems) {
            const entry = document.createElement("div");
            entry.className = "zbl-artifact-set-entry";

            const linkArea = document.createElement("div");
            linkArea.className = "zbl-artifact-set-link-area";

            const icon = document.createElement("img");
            icon.className = "zbl-artifact-set-icon";
            icon.src = artifact.img || "icons/svg/item-bag.svg";
            icon.alt = artifact.name;
            icon.title = artifact.name;

            const link = document.createElement("span");
            link.className = "zbl-artifact-set-link";

            const linkMarkup =
                `@UUID[${artifact.uuid}]{«${artifact.name}»}`;

            link.innerHTML = await TextEditor.enrichHTML(
                linkMarkup,
                { async: true }
            );

            const remove = document.createElement("button");
            remove.type = "button";
            remove.className = "zbl-artifact-set-remove";
            remove.innerHTML = '<i class="fas fa-trash"></i>';
            remove.title = `Убрать ${artifact.name} из набора`;
            remove.setAttribute("aria-label", remove.title);

            remove.addEventListener("click", async () => {
                requiredItems = requiredItems.filter(
                    candidate => candidate.uuid !== artifact.uuid
                );

                await saveItems();
                await renderList();
            });

            linkArea.append(icon, link);
            entry.append(linkArea, remove);
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

            const expectedPrefix =
                `Compendium.${ZBL_ARTIFACT_PACK_ID}.Item.`;

            if (!artifact.uuid.startsWith(expectedPrefix)) {
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
                name: artifact.name,
                img: artifact.img
            });

            await saveItems();
            await renderList();

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

    await renderList();
    updateVisibility();
}


Hooks.on("renderItemSheet5e", (app, html) => {
    void zblRenderArtifactSetEditor(app, html);
});


/* =========================================================
   ЗАГРУЗКА ОПРЕДЕЛЕНИЙ ОСОБЕННОСТЕЙ
   ========================================================= */

async function zblGetArtifactSetDefinitions() {
    if (zblArtifactSetDefinitions !== null) {
        return zblArtifactSetDefinitions;
    }

    const pack = game.packs.get(ZBL_FEATURE_PACK_ID);

    if (!pack) {
        console.error(
            `ZBL-Core | Не найден компендиум ${ZBL_FEATURE_PACK_ID}.`
        );

        zblArtifactSetDefinitions = [];
        return zblArtifactSetDefinitions;
    }

    const documents = await pack.getDocuments();

    zblArtifactSetDefinitions = documents.filter(definition => {
        const config = definition.getFlag(
            ZBL_MODULE_ID,
            ZBL_SET_FLAG
        );

        return (
            definition.type === "feat" &&
            definition.system.type?.value === ZBL_SET_TYPE &&
            Array.isArray(config?.requiredItems) &&
            config.requiredItems.length > 0
        );
    });

    return zblArtifactSetDefinitions;
}


/* =========================================================
   ПРОВЕРКА ИСТОЧНИКА ПРЕДМЕТА
   ========================================================= */

function zblGetSourceUuid(item) {
    return (
        item.flags?.core?.sourceId ??
        item._stats?.compendiumSource ??
        null
    );
}


function zblHasRequiredArtifacts(actor, requiredItems) {
    return requiredItems.every(required => {
        return actor.items.some(item => {
            if (item.type !== "equipment") return false;
            if (item.system.attuned !== true) return false;

            return zblGetSourceUuid(item) === required.uuid;
        });
    });
}


/* =========================================================
   РАБОТА С АВТОМАТИЧЕСКИ ВЫДАННЫМИ ОСОБЕННОСТЯМИ
   ========================================================= */

function zblGetAutoGrantedFeatures(actor, featureUuid) {
    return actor.items.filter(item => {
        if (item.type !== "feat") return false;

        const marker = item.getFlag(
            ZBL_MODULE_ID,
            ZBL_AUTO_FLAG
        );

        return marker?.sourceUuid === featureUuid;
    });
}


async function zblSyncArtifactSets(actor) {
    if (!actor || actor.type !== "character") return;

    const lockKey = actor.uuid ?? actor.id;

    if (zblArtifactSetSyncing.has(lockKey)) return;

    zblArtifactSetSyncing.add(lockKey);

    try {
        const definitions = await zblGetArtifactSetDefinitions();

        for (const definition of definitions) {
            const featureUuid = definition.uuid;

            const config = definition.getFlag(
                ZBL_MODULE_ID,
                ZBL_SET_FLAG
            );

            const requiredItems = config?.requiredItems ?? [];

            const qualifies = zblHasRequiredArtifacts(
                actor,
                requiredItems
            );

            let autoGranted = zblGetAutoGrantedFeatures(
                actor,
                featureUuid
            );

            /*
             * Если условия набора больше не выполнены,
             * удаляем только автоматически выданные особенности.
             *
             * Перед удалением заново проверяем, что каждый ID
             * всё ещё принадлежит предмету на листе персонажа.
             */
            if (!qualifies) {
                const idsToDelete = [
                    ...new Set(
                        autoGranted
                            .filter(item => actor.items.has(item.id))
                            .map(item => item.id)
                    )
                ];

                if (idsToDelete.length > 0) {
                    await actor.deleteEmbeddedDocuments(
                        "Item",
                        idsToDelete
                    );
                }

                continue;
            }

            /*
             * Если по ошибке уже существует несколько копий,
             * оставляем одну и удаляем только остальные копии,
             * помеченные нашим флагом.
             */
            if (autoGranted.length > 1) {
                const idsToDelete = autoGranted
                    .slice(1)
                    .filter(item => actor.items.has(item.id))
                    .map(item => item.id);

                if (idsToDelete.length > 0) {
                    await actor.deleteEmbeddedDocuments(
                        "Item",
                        idsToDelete
                    );
                }

                autoGranted = zblGetAutoGrantedFeatures(
                    actor,
                    featureUuid
                );
            }

            // Автоматическая копия уже есть — повторно не выдаём.
            if (autoGranted.length > 0) continue;

            /*
             * Если особенность была добавлена вручную из
             * компендиума, не создаём автоматическую копию.
             */
            const manuallyAdded = actor.items.some(item => {
                if (item.type !== "feat") return false;

                const marker = item.getFlag(
                    ZBL_MODULE_ID,
                    ZBL_AUTO_FLAG
                );

                if (marker?.sourceUuid === featureUuid) {
                    return false;
                }

                return zblGetSourceUuid(item) === featureUuid;
            });

            if (manuallyAdded) continue;

            /*
             * Дополнительный замок для конкретного персонажа
             * и особенности. Не даём создать одну особенность
             * повторно, пока операция создания не завершилась.
             */
            const pendingKey = `${lockKey}:${featureUuid}`;

            if (zblArtifactSetPending.has(pendingKey)) continue;

            zblArtifactSetPending.add(pendingKey);

            try {
                // Повторная проверка непосредственно перед созданием.
                const nowExists = zblGetAutoGrantedFeatures(
                    actor,
                    featureUuid
                ).length > 0;

                if (nowExists) continue;

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

            } finally {
                zblArtifactSetPending.delete(pendingKey);
            }
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


/* =========================================================
   ЗАПУСК СИНХРОНИЗАЦИИ
   ========================================================= */

async function zblSyncAllCharacterArtifactSets() {
    for (const actor of game.actors.contents) {
        if (actor.type === "character") {
            await zblSyncArtifactSets(actor);
        }
    }
}


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
