Hooks.once("init", () => {

    const zblLang = {
        children: {
            avargo: "Аварго",
            bakiysky: "Бакийский",
            vadhisky: "Вадхийский",
            vairakhsky: "Вайрахский",
            erg: "Ерг",
            mokay: "Мокай",
            oirkhonsky: "Ойрхонский",
            alt: "Алт"
        },
        label: "Языки Вад-Хидека",
        selectable: false
    };

    CONFIG.DND5E.languages.zblLang = zblLang;
});