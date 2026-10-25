/**
 * Finnish UI copy (00-deviations R8: the only source of UI strings). Started by MV-041 with
 * the auth layout and the shared form components, extended by MV-042 (registration, verify
 * page, verification email) and MV-044 (login, logout); inline strings elsewhere move here when their page is touched. Keys are grouped by component or page, values are the exact copy
 * from the artboards in docs/design.
 */
export const fi = {
  brand: {
    name: 'Metsävahti',
    homeLink: 'Metsävahti – etusivulle',
  },
  auth: {
    login: {
      title: 'Kirjaudu',
      email: 'Sähköposti',
      password: 'Salasana',
      remember: 'Muista minut',
      forgot: 'Unohditko salasanan?',
      submit: 'Kirjaudu',
      noAccount: 'Ei vielä tiliä?',
      register: 'Luo tili',
      resend: 'Lähetä vahvistuslinkki uudelleen',
      resent: 'Vahvistuslinkki lähetetty uudelleen.',
      passwordReset: 'Salasana vaihdettu. Kirjaudu uudella salasanalla.',
      errors: {
        emailInvalid: 'Anna kelvollinen sähköpostiosoite',
        passwordMissing: 'Salasana puuttuu',
        invalid: 'Kirjautuminen epäonnistui. Tarkista tunnus ja salasana.',
        locked:
          'Tili on lukittu liian monen epäonnistuneen kirjautumisyrityksen vuoksi. Yritä uudelleen 10 minuutin kuluttua.',
        unverified: 'Sähköpostiosoitetta ei ole vielä vahvistettu.',
      },
    },
    logout: {
      title: 'Olet kirjautunut ulos',
      body: 'Vahtialueesi jatkavat seurantaa ja saat sähköpostit normaalisti.',
      back: 'Kirjaudu takaisin',
      home: 'Etusivulle',
    },
    register: {
      title: 'Luo tili',
      email: 'Sähköposti',
      password: 'Salasana',
      confirmPassword: 'Salasana uudelleen',
      termsPrefix: 'Olen lukenut',
      privacyLink: 'tietosuojaselosteen',
      termsMiddle: 'ja hyväksyn',
      termsLink: 'käyttöehdot',
      marketing: 'Saa lähettää palveluun liittyviä uutisia.',
      submit: 'Luo tili',
      hasAccount: 'Onko sinulla jo tili?',
      login: 'Kirjaudu',
      errors: {
        emailInvalid: 'Anna kelvollinen sähköpostiosoite',
        passwordTooShort: 'Salasanan on oltava vähintään 10 merkkiä',
        passwordTooWeak: 'Salasana on liian heikko. Käytä pidempää tai vaihtelevampaa salasanaa.',
        passwordMismatch: 'Salasanat eivät täsmää.',
        termsRequired: 'Hyväksy käyttöehdot ja tietosuojaseloste jatkaaksesi',
      },
    },
    forgotPassword: {
      title: 'Unohtunut salasana',
      body: 'Kirjoita tilisi sähköpostiosoite. Lähetämme linkin uuden salasanan asettamiseen.',
      email: 'Sähköposti',
      submit: 'Lähetä ohjeet',
      sent: 'Jos osoite on rekisteröity, lähetimme ohjeet salasanan vaihtamiseen sähköpostiin.',
      backToLogin: 'Takaisin kirjautumiseen',
      errors: {
        emailInvalid: 'Anna kelvollinen sähköpostiosoite',
      },
    },
    resetPassword: {
      title: 'Aseta uusi salasana',
      password: 'Uusi salasana',
      confirmPassword: 'Salasana uudelleen',
      submit: 'Tallenna ja kirjaudu',
      invalid: {
        title: 'Linkki on vanhentunut tai jo käytetty',
        body: 'Salasanan vaihtolinkki on voimassa tunnin ja toimii vain kerran. Pyydä uusi linkki, niin lähetämme sen sähköpostiisi.',
        request: 'Pyydä uusi linkki',
        login: 'Takaisin kirjautumiseen',
      },
      errors: {
        tokenMissing: 'Linkki on puutteellinen',
        passwordTooShort: 'Salasanan on oltava vähintään 10 merkkiä',
        passwordTooWeak: 'Salasana on liian heikko. Käytä pidempää tai vaihtelevampaa salasanaa.',
        passwordMismatch: 'Salasanat eivät täsmää.',
      },
    },
    verifyEmail: {
      title: 'Vahvista sähköposti',
      sentTo: 'Lähetimme vahvistuslinkin osoitteeseen',
      sentToUnknown: 'Lähetimme vahvistuslinkin sähköpostiisi.',
      validFor: 'Linkki on voimassa 24 tuntia.',
      changeEmail: 'Vaihda sähköpostiosoite',
      resend: 'Lähetä uudelleen',
      resent: 'Vahvistuslinkki lähetetty uudelleen.',
      required: {
        code: 'VAHVISTUS',
        title: 'Vahvista sähköpostiosoitteesi ensin',
        body: 'Lähetimme vahvistuslinkin sähköpostiisi. Vahtialueet avautuvat, kun osoite on vahvistettu.',
        home: 'Etusivulle',
      },
    },
    verify: {
      verified: {
        title: 'Sähköposti vahvistettu',
        body: 'Tilisi on valmis. Seuraavaksi merkitään ensimmäinen paikka kartalle.',
        cta: 'Luo ensimmäinen vahtialue',
      },
      expired: {
        title: 'Vahvistuslinkki on vanhentunut',
        body: 'Linkki oli voimassa 24 tuntia. Lähetämme uuden linkin osoitteeseen',
      },
      used: {
        title: 'Linkki on jo käytetty',
        body: 'Vahvistuslinkki on jo käytetty tai se ei ole kelvollinen. Jos olet jo vahvistanut osoitteesi, voit kirjautua sisään.',
        login: 'Kirjaudu',
        register: 'Luo tili',
      },
    },
  },
  footer: {
    legalNav: 'Oikeudelliset tiedot',
    mapCredit: 'Kartta © OpenStreetMapin tekijät, Maanmittauslaitos.',
    copyright: (year: number) => `© ${year} Metsävahti`,
  },
  /** Landing page `/` (MV-100, docs/design/Landing.dc.html, hero B); the FAQ is `src/content/faq.ts`. */
  landing: {
    meta: {
      title: 'Metsävahti – tiedä, jos naapurimetsääsi ollaan hakkaamassa',
      description:
        'Metsävahti seuraa Suomen metsäkeskuksen metsänkäyttöilmoituksia tonttisi ympärillä ja lähettää sähköpostin, kun lähelle suunnitellaan hakkuuta. Ilmainen.',
    },
    hero: {
      title: 'Tiedä, jos naapurimetsääsi ollaan hakkaamassa',
      lead: 'Metsävahti seuraa virallisia metsänkäyttöilmoituksia tonttisi ympärillä ja lähettää sähköpostin, kun lähelle suunnitellaan hakkuuta.',
      primaryCta: 'Luo vahtialue',
      secondaryCta: 'Miten se toimii',
    },
    mapMock: {
      label: 'Esimerkkikartta',
      description:
        'Kuvitteellinen kartta: katkoviivalla rajattu vahtialue tontin ympärillä ja sen sisään osuvia hakkuuilmoituksia.',
      legend: {
        uudistus: 'Uudistushakkuu',
        harvennus: 'Harvennushakkuu',
        watchArea: 'Vahtialueesi',
      },
      alertTitle: 'Uusi ilmoitus 420 m päässä',
      alertBody: 'Uudistushakkuu · 3,4 ha · 5.9.2026',
    },
    steps: {
      title: 'Miten se toimii',
      items: (minRadiusM: number, maxRadiusKm: number) => [
        {
          title: 'Merkitse tontti kartalle',
          body: 'Hae osoitteella tai napauta karttaa. Voit siirtää merkkiä vapaasti.',
        },
        {
          title: 'Valitse säde',
          body: `Kuinka läheltä haluat tietää: ${minRadiusM} metristä ${maxRadiusKm} kilometriin.`,
        },
        {
          title: 'Saat sähköpostin',
          body: 'Kun uusi metsänkäyttöilmoitus ilmestyy alueelle, kerromme siitä sähköpostilla.',
        },
      ],
    },
    explainer: {
      title: 'Mitä metsänkäyttöilmoitus on?',
      body: 'Metsänomistajan Metsäkeskukselle tekemä ilmoitus suunnitellusta hakkuusta. Se on aikomus, ei takuu siitä että hakkuu toteutuu.',
      points: [
        'Ilmoitus on tehtävä vähintään 10 päivää ennen hakkuun aloittamista.',
        'Ilmoitus on voimassa kolme vuotta.',
        'Pienet kotitarvehakkuut eivät vaadi ilmoitusta, eivätkä näy palvelussa.',
      ],
    },
    trust: {
      label: 'Luotettavuus',
      source: {
        title: 'Tietolähde',
        body: 'Suomen metsäkeskuksen avoin Metsänkäyttöilmoitukset-aineisto. Päivitetään palveluun kaksi kertaa päivässä.',
      },
      privacy: {
        title: 'Yksityisyys',
        body: 'Palvelu ei näytä maanomistajien henkilötietoja. Näet vain hakkuualueen, tyypin ja ajankohdan.',
      },
      price: {
        title: 'Hinta',
        body: (maxWatchAreas: number) =>
          `Ilmainen: enintään ${maxWatchAreas} vahtialuetta ja sähköposti-ilmoitukset. Laajempi taso tulossa myöhemmin.`,
      },
    },
    faqTitle: 'Usein kysyttyä',
    cta: {
      title: 'Merkitse tontti kartalle. Me vahdimme loput.',
      button: 'Luo vahtialue',
    },
  },
  /**
   * `/miten-se-toimii` (MV-101, docs/design/Miten.dc.html). The times are the sync schedule of
   * `01 §2` (Metsäkeskus updates at 9 and 21, the cron runs 30 minutes later), not the artboard's.
   */
  howItWorks: {
    meta: {
      title: 'Miten se toimii',
      description:
        'Metsävahti tarkistaa Suomen metsäkeskuksen metsänkäyttöilmoitukset kaksi kertaa päivässä ja lähettää sähköpostin, kun vahtialueellesi tulee uusi ilmoitus.',
    },
    eyebrow: 'Miten se toimii',
    title: 'Kaksi tarkistusta päivässä, yksi sähköposti kun jotain tapahtuu',
    lead: 'Metsävahti ei kerää mitään uutta tietoa. Se lukee saman avoimen aineiston, jonka Suomen metsäkeskus julkaisee, ja vertaa sitä sinun vahtialueisiisi.',
    cycle: {
      title: 'Tarkistuskierto',
      body: 'Joka aamu klo 9.30 ja joka ilta klo 21.30 haemme Metsäkeskuksen aineistosta uudet ja muuttuneet metsänkäyttöilmoitukset. Jokainen niistä verrataan kaikkiin vahtialueisiin.',
      steps: [
        {
          title: 'Metsäkeskus julkaisee',
          body: 'Uudet metsänkäyttöilmoitukset ilmestyvät avoimeen aineistoon klo 9 ja 21.',
        },
        {
          title: 'Haemme muutokset',
          body: 'Klo 9.30 ja 21.30 luemme uudet ja muuttuneet ilmoitukset.',
        },
        {
          title: 'Vertaamme vahtialueisiin',
          body: 'Jokainen ilmoitettu alue tarkistetaan jokaista vahtialuetta vasten.',
        },
        {
          title: 'Lähetämme sähköpostin',
          body: 'Heti, tai koosteena valitsemallasi tahdilla.',
        },
      ],
      illustration: {
        description:
          'Kaavio vuorokauden tarkistuskierrosta: tarkistus klo 9.30 ja klo 21.30, Metsäkeskus julkaisee aineiston ja sähköposti lähtee sinulle.',
        morning: '9.30 tarkistus',
        evening: '21.30 tarkistus',
        source: 'Metsäkeskus julkaisee',
        email: 'Sähköposti sinulle',
        centreLabel: 'Vahtialueesi',
        centreValue: '24 h',
        centreNote: 'kaksi kierrosta',
      },
    },
    email: {
      title: 'Tällainen sähköposti tulee',
      body: 'Yksi viesti per uusi ilmoitus, tai halutessasi päivittäinen tai viikoittainen kooste. Viestissä on kaikki olennainen ilman kirjautumista: tyyppi, koko ja etäisyys.',
      points: [
        'Hakkuun tyyppi selkokielellä, värillä ja tekstillä',
        'Etäisyys vahtialueen keskipisteestä',
        'Muistutus siitä, että ilmoitus on aikomus, ei velvoite',
      ],
      illustration: {
        label: 'Esimerkkisähköposti',
        sender: 'Metsävahti',
        senderInitial: 'M',
        sentAt: 'tänään 9.34',
        subject: 'Uusi metsänkäyttöilmoitus vahtialueellasi Mökki, Rääkkylä',
        mapDescription: 'Kartta, jossa ilmoitettu hakkuualue vahtialueen sisällä',
        cuttingType: 'Uudistushakkuu',
        area: '3,4 ha',
        distance: '420 m vahtialueen keskipisteestä',
        received: 'Ilmoitus saapunut 5.9.2026',
        cta: 'Näytä kartalla',
      },
    },
    notDoing: {
      title: 'Mitä palvelu ei tee',
      items: [
        {
          title: 'Ei näytä omistajia.',
          body: 'Aineisto ei sisällä henkilötietoja, emmekä yhdistä sitä kiinteistörekisteriin.',
        },
        {
          title: 'Ei lupaa täydellisyyttä.',
          body: 'Kotitarvehakkuut eivät vaadi ilmoitusta, ja aineiston julkaisussa voi olla viivettä.',
        },
        {
          title: 'Ei ota kantaa.',
          body: 'Kerromme, mitä on ilmoitettu. Mitä sillä tiedolla tekee, on sinun asiasi.',
        },
      ],
    },
    cta: {
      title: 'Ensimmäinen vahtialue vie alle minuutin.',
      button: 'Luo vahtialue',
    },
  },
  /** `/hinnoittelu` behind `SHOW_PRICING` (MV-101, docs/design/Hinnoittelu.dc.html). */
  pricing: {
    meta: {
      title: 'Hinnoittelu',
      description:
        'Metsävahdin perustoiminnot ovat ilmaisia: vahtialueet ja sähköposti-ilmoitukset uusista metsänkäyttöilmoituksista.',
    },
    title: 'Hinnoittelu',
    lead: 'Perustoiminnot ovat ilmaisia ja pysyvät sellaisina. Laajempi taso tulee myöhemmin niille, jotka seuraavat useampaa paikkaa.',
    perMonth: '/ kk',
    price: (euros: number) => `${euros} €`,
    free: {
      features: (maxWatchAreas: number, minRadiusM: number, maxRadiusKm: number) => [
        `Enintään ${maxWatchAreas} vahtialuetta`,
        `Säde ${minRadiusM} m – ${maxRadiusKm} km`,
        'Sähköposti-ilmoitukset heti tai koosteena',
        'Tarkistus kaksi kertaa päivässä',
        'Tietojen vienti ja tilin poisto itsepalveluna',
      ],
      cta: 'Luo tili',
    },
    upcoming: {
      eyebrow: 'Tulossa',
      name: 'Laaja',
      features: [
        'Rajaton määrä vahtialueita',
        'Oma kiinteistöraja vahtialueena',
        'Ilmoitushistoria ja vienti taulukkona',
      ],
      cta: 'Ilmoita kun taso julkaistaan',
    },
  },
  consent: {
    banner: {
      label: 'Evästeet',
      body: 'Käytämme välttämättömiä evästeitä palvelun toimintaan ja valinnaisesti analytiikkaevästeitä sen kehittämiseen.',
      cookiesLink: 'Lue lisää evästeistä',
      privacyLink: 'Tietosuojaseloste',
      acceptAll: 'Hyväksy kaikki',
      necessaryOnly: 'Vain välttämättömät',
      customize: 'Mukauta',
    },
    modal: {
      title: 'Evästeasetukset',
      necessary: 'Välttämättömät',
      necessaryBody: 'Kirjautuminen, suostumusvalinnat, tietoturva. Aina käytössä.',
      analytics: 'Analytiikka',
      analyticsBody: 'Anonyymi käyttötilasto palvelun kehittämiseen.',
      save: 'Tallenna valinnat',
      close: 'Sulje',
    },
    saveFailed: 'Valintojen tallennus epäonnistui. Yritä uudelleen.',
  },
  app: {
    nav: {
      label: 'Päävalikko',
      watchAreas: 'Vahtialueet',
      alerts: 'Ilmoitukset',
      account: 'Tili',
      unread: (count: string) => `(${count} lukematonta)`,
    },
    titles: {
      newWatchArea: 'Uusi vahtialue',
      security: 'Turvallisuus',
      notificationSettings: 'Ilmoitusasetukset',
      privacy: 'Tietosuoja ja tiedot',
      deleteAccount: 'Poista tili',
    },
    accountMenu: {
      trigger: 'Tilivalikko',
      account: 'Tili',
      settings: 'Asetukset',
      logout: 'Kirjaudu ulos',
    },
  },
  alerts: {
    /** What each `alerts.changeType` means, for the feed (MV-080); the emails keep their own. */
    changeType: {
      new: {
        label: 'Uusi ilmoitus',
        explanation: 'Metsäkeskuksen aineistoon on lisätty uusi hakkuuaikomus vahtialueellesi.',
      },
      geometry_changed: {
        label: 'Rajaus muuttunut',
        explanation: 'Hakkuualueen rajaus on muuttunut Metsäkeskuksen aineistossa.',
      },
      attributes_changed: {
        label: 'Tiedot muuttuneet',
        explanation:
          'Ilmoituksen tiedot, esimerkiksi hakkuutapa tai pinta-ala, ovat muuttuneet Metsäkeskuksen aineistossa.',
      },
      removed: {
        label: 'Poistunut aineistosta',
        explanation:
          'Ilmoitus ei ole enää Metsäkeskuksen aineistossa. Se on voitu perua tai korvata uudella ilmoituksella.',
      },
    },
    feed: {
      title: 'Ilmoitukset',
      markAllRead: 'Merkitse kaikki luetuiksi',
      markedAllRead: 'Kaikki ilmoitukset merkitty luetuiksi.',
      failed: 'Muutoksen tallennus epäonnistui. Yritä uudelleen.',
      filter: 'Vahtialue',
      allAreas: 'Kaikki vahtialueet',
      emptyTitle: 'Ei uusia ilmoituksia — hyvä merkki.',
      emptyBody: 'Tarkistamme Metsäkeskuksen aineiston kahdesti päivässä, klo 9.30 ja 21.30.',
      emptyArea: 'Tällä vahtialueella ei ole vielä ilmoituksia.',
      unread: 'Lukematon',
      meta: (area: string, ha: string, distance: string, time: string) =>
        `${area} · ${ha} · ${distance} · klo ${time}`,
      showOnMap: 'Näytä kartalla',
      showOnMapLabel: (type: string, area: string) => `Näytä kartalla: ${type}, ${area}`,
      pages: 'Ilmoituslistan sivut',
      older: 'Näytä vanhemmat ilmoitukset',
      newest: 'Uusimpiin ilmoituksiin',
    },
    detail: {
      back: '← Ilmoitukset',
      mapLabel: 'Ilmoituksen kartta',
      title: (ha: string, distance: string, area: string) =>
        `${ha}, ${distance} vahtialueesta ${area}`,
      attributes: {
        received: 'Ilmoitus saapunut',
        cuttingType: 'Hakkuutapa',
        area: 'Pinta-ala',
        distance: 'Etäisyys',
        distanceValue: (distance: string) => `${distance} vahtialueen keskipisteestä`,
        declarationNumber: 'Ilmoitusnumero',
        validUntil: 'Voimassa',
        validUntilValue: (date: string) => `${date} asti (3 vuotta ilmoituspäivästä)`,
        validUntilDefault: '3 vuotta ilmoituspäivästä',
        earliest: 'Aikaisintaan',
        earliestValue: '10 päivää ilmoituksesta',
      },
      updatedTitle: 'Tiedot päivittyneet',
      updatedBody:
        'Metsäkeskuksen aineisto on muuttunut ilmoituksen jälkeen. Yllä ovat tiedot ilmoitushetkeltä.',
      removedBody: 'Ilmoitus ei ole enää Metsäkeskuksen aineistossa.',
      changeLabel: {
        cuttingType: 'Hakkuutapa nyt',
        areaHa: 'Pinta-ala nyt',
        receivedAt: 'Saapunut nyt',
      },
      explainerTitle: 'Mitä tämä tarkoittaa?',
      explainerBody:
        'Metsänomistaja on ilmoittanut Metsäkeskukselle aikomuksestaan hakata tämä alue. Ilmoitus ei velvoita hakkaamaan, ja osa ilmoitetuista hakkuista jää toteutumatta. Hakkuu voi alkaa aikaisintaan 10 päivää ilmoituksen jättämisestä ja ilmoitus on voimassa kolme vuotta.',
      openArea: 'Avaa vahtialue',
      mapService: 'Metsäkeskuksen karttapalvelu',
      newTab: '(avautuu uuteen välilehteen)',
    },
  },
  watchAreas: {
    errors: {
      nameMissing: 'Anna alueelle nimi.',
      nameTooLong: 'Nimi voi olla enintään 100 merkkiä.',
      centerOutside: 'Valitse keskipiste Suomesta.',
      radiusInvalid: (min: number, max: number) => `Säteen pitää olla ${min}–${max} m.`,
      addressTooLong: 'Osoite voi olla enintään 200 merkkiä.',
      planLimit: (max: number) =>
        `Tilaukseesi kuuluu enintään ${max} vahtialuetta. Poista jokin alue ennen uuden lisäämistä.`,
    },
    dashboard: {
      title: 'Vahtialueet',
      dataUpdated: (at: string) => `Tiedot päivitetty viimeksi ${at} (Metsäkeskus)`,
      dataNotUpdated: 'Metsäkeskuksen tietoja ei ole vielä haettu.',
      dataStale:
        'Tietojen haku Metsäkeskuksesta on myöhässä, joten uusimmat ilmoitukset voivat puuttua.',
      newArea: 'Uusi vahtialue',
      limitReached: (max: number) => `Ilmaisella tasolla enintään ${max} vahtialuetta`,
      place: (address: string | null, radius: string) =>
        address ? `${address} · säde ${radius}` : `Säde ${radius}`,
      active: (count: number) => `${count} voimassa`,
      newAlerts: (count: number) => `Uusia: ${count}`,
      checked: (at: string) => `Tarkistettu ${at}`,
      notChecked: 'Ei vielä tarkistettu',
      notifications: (name: string) => `Sähköposti-ilmoitukset: ${name}`,
      actions: (name: string) => `Lisää toimintoja: ${name}`,
      edit: 'Muokkaa',
      remove: 'Poista',
      confirmTitle: 'Poistetaanko vahtialue?',
      confirmBody: (name: string) =>
        `”${name}” ja sen ilmoitushistoria poistetaan. Toimintoa ei voi perua.`,
      confirmOk: 'Poista',
      cancel: 'Peruuta',
      removed: (name: string) => `Vahtialue ”${name}” poistettu.`,
      failed: 'Muutoksen tallennus epäonnistui. Yritä uudelleen.',
      overview: 'Kaikki vahtialueet',
      emptyTitle: 'Ei vielä vahtialueita',
      emptyBody: 'Merkitse ensimmäinen paikka kartalle, niin alamme seurata sen ympäristöä.',
      emptyAction: 'Luo vahtialue',
    },
    detail: {
      back: '← Vahtialueet',
      summary: (place: string, checked: string) => `${place} · ${checked}`,
      checked: (at: string) => `tarkistettu ${at}`,
      notChecked: 'ei vielä tarkistettu',
      created:
        'Vahtialue tallennettu. Uudet ilmoitukset tulevat näkyviin seuraavassa tarkistuksessa.',
      edit: 'Muokkaa',
      notifications: 'Ilmoitusasetukset',
      remove: 'Poista',
      filters: 'Suodattimet',
      allTypes: 'Kaikki',
      onlyNew: 'Vain uudet',
      receivedFrom: 'Saapunut alkaen',
      receivedTo: 'Saapunut viimeistään',
      clearFilters: 'Tyhjennä suodattimet',
      count: (shown: number, unread: number) => `${shown} ilmoitusta · ${unread} uutta`,
      listLabel: 'Vahtialueen metsänkäyttöilmoitukset',
      noDeclarations: 'Alueella ei ole voimassa olevia metsänkäyttöilmoituksia.',
      noMatches: 'Ei ilmoituksia näillä suodattimilla.',
      newBadge: 'Uusi',
      received: (date: string) => `saapunut ${date}`,
      showOnMap: 'Näytä kartalla',
      attributes: {
        cuttingType: 'Hakkuutapa',
        declarationNumber: 'Ilmoitusnumero',
        area: 'Pinta-ala',
        distance: 'Etäisyys',
        distanceValue: (distance: string) => `${distance} vahtialueen keskipisteestä`,
        received: 'Saapunut',
        validUntil: 'Voimassa',
        validUntilValue: (date: string) => `${date} asti (3 vuotta ilmoituspäivästä)`,
      },
      disclaimer: 'Ilmoitus on hakkuuaikomus, ei velvoite hakata.',
    },
  },
  account: {
    title: 'Tili ja asetukset',
    tabs: {
      label: 'Tilin osiot',
      profile: 'Tili',
      security: 'Turvallisuus',
      notifications: 'Ilmoitusasetukset',
      privacy: 'Tietosuoja ja tiedot',
      deleteAccount: 'Poista tili',
    },
    profile: {
      email: 'Sähköposti',
      changeEmail: 'Vaihda',
      emailHint: 'Uusi osoite vahvistetaan sähköpostilla ennen käyttöönottoa.',
      emailChangeSent: 'Lähetimme vahvistuslinkin uuteen osoitteeseen. Linkki on voimassa tunnin.',
      emailPending: (email: string) =>
        `Odottaa vahvistusta: ${email}. Nykyinen osoite on käytössä, kunnes uusi vahvistetaan.`,
      name: 'Nimi',
      optional: '(valinnainen)',
      locale: 'Kieli',
      locales: { fi: 'Suomi', en: 'English' },
      timezone: 'Aikavyöhyke',
      submit: 'Tallenna',
      saved: 'Tiedot tallennettu.',
      errors: {
        nameTooLong: 'Nimi voi olla enintään 100 merkkiä',
        localeInvalid: 'Valitse kieli',
        timezoneInvalid: 'Valitse aikavyöhyke',
        emailInvalid: 'Anna kelvollinen sähköpostiosoite',
        emailSame: 'Tämä on jo tilisi osoite.',
      },
    },
    emailChange: {
      changed: {
        title: 'Sähköpostiosoite vaihdettu',
        body: 'Kirjaudu jatkossa osoitteella',
        cta: 'Siirry tiliin',
      },
      invalid: {
        title: 'Linkki ei ole voimassa',
        body: 'Vahvistuslinkki on vanhentunut, jo käytetty tai korvattu uudemmalla. Tilisi osoite ei ole vaihtunut. Voit pyytää uuden linkin tilin asetuksista.',
        cta: 'Tilin asetuksiin',
      },
      taken: {
        title: 'Osoite on jo käytössä',
        body: 'Osoitteella on jo toinen Metsävahti-tili, joten tilisi osoite ei vaihtunut.',
        cta: 'Tilin asetuksiin',
      },
    },
    password: {
      title: 'Vaihda salasana',
      current: 'Nykyinen salasana',
      next: 'Uusi salasana',
      submit: 'Vaihda salasana',
      changed: 'Salasana vaihdettu. Muut laitteet on kirjattu ulos.',
      errors: {
        currentMissing: 'Anna nykyinen salasana',
        currentWrong: 'Nykyinen salasana on väärin.',
        passwordTooShort: 'Salasanan on oltava vähintään 10 merkkiä',
        passwordTooWeak: 'Salasana on liian heikko. Käytä pidempää tai vaihtelevampaa salasanaa.',
        sameAsCurrent: 'Uusi salasana ei voi olla sama kuin nykyinen.',
      },
    },
    sessions: {
      title: 'Aktiiviset istunnot',
      thisDevice: 'Tämä laite',
      active: 'Aktiivinen',
      signedIn: (when: string) => `Kirjautunut ${when}`,
      lastSeen: (when: string) => `viimeksi aktiivinen ${when}`,
      now: 'nyt',
      logoutOthers: 'Kirjaa ulos muista laitteista',
      loggedOut: 'Muut istunnot kirjattu ulos.',
      noOthers: 'Muita kirjautuneita laitteita ei ole.',
    },
    twoFactor: 'Kaksivaiheinen tunnistus — tulossa myöhemmin.',
    notifications: {
      email: 'Sähköposti-ilmoitukset',
      emailHint: 'Koskee kaikkia vahtialueita',
      mode: 'Lähetystapa',
      modes: {
        immediate: 'Heti',
        daily: (hour: string) => `Päivittäin klo ${hour}`,
        weekly: 'Viikoittain',
      },
      areas: 'Vahtialuekohtaiset asetukset',
      areasOff:
        'Sähköposti-ilmoitukset ovat pois päältä, joten alueiden asetukset eivät ole käytössä.',
      areaSwitch: (name: string) => `Sähköposti-ilmoitukset: ${name}`,
      noAreas: 'Sinulla ei ole vielä vahtialueita.',
      createArea: 'Luo vahtialue',
      marketing: 'Palvelun uutiset',
      marketingHint: 'Harvoin lähetettäviä tiedotteita uusista ominaisuuksista',
      sendTest: 'Lähetä testisähköposti',
      testSent: (email: string) => `Testisähköposti lähetetty osoitteeseen ${email}.`,
      saved: 'Asetukset tallennettu.',
      failed: 'Yhteys palvelimeen katkesi. Yritä uudelleen.',
    },
    privacy: {
      export: {
        title: 'Lataa tietoni',
        body: 'Saat tilitietosi, vahtialueet (GeoJSON), ilmoitushistorian, suostumushistorian ja lähetetyt sähköpostit yhtenä zip-pakettina. Linkki on voimassa 24 tuntia.',
        request: 'Lataa tietoni',
        pending: 'Valmistellaan… lähetämme linkin sähköpostiin.',
        ready: (email: string, until: string) =>
          `Tietosi ovat valmiit. Lähetimme latauslinkin osoitteeseen ${email}. Linkki on voimassa ${until} asti.`,
        download: 'Lataa tiedosto (zip)',
        expired: 'Edellisen viennin linkki on vanhentunut. Voit pyytää uuden viennin.',
        failed: 'Edellinen vienti epäonnistui. Yritä uudelleen.',
        limited: (when: string) => `Voit pyytää seuraavan viennin ${when} jälkeen.`,
        error: 'Pyyntö epäonnistui. Yritä uudelleen.',
      },
      consents: {
        title: 'Suostumushistoria',
        choice: 'Valinta',
        version: 'Versio',
        date: 'Päivämäärä',
        empty: 'Ei tallennettuja suostumuksia.',
        kinds: {
          terms: { granted: 'Käyttöehdot hyväksytty', denied: 'Käyttöehtoja ei hyväksytty' },
          privacy: {
            granted: 'Tietosuojaseloste hyväksytty',
            denied: 'Tietosuojaselostetta ei hyväksytty',
          },
          marketing: {
            granted: 'Palvelun uutiset: suostumus annettu',
            denied: 'Palvelun uutiset: ei suostumusta',
          },
          cookies: {
            granted: 'Analytiikkaevästeet hyväksytty',
            denied: 'Vain välttämättömät evästeet',
          },
        },
      },
      links: {
        label: 'Tietosuojan linkit',
        cookieSettings: 'Evästeasetukset',
        policy: 'Tietosuojaseloste',
        authority: 'Tietosuojavaltuutetun toimisto ↗',
      },
    },
    deleteAccount: {
      title: 'Poista tili',
      body: 'Poistamme tilisi, kaikki vahtialueet ja ilmoitushistorian välittömästi. Toimintoa ei voi perua.',
      deletedTitle: 'Poistetaan',
      deleted: [
        'Tilitiedot, salasana ja kaikki kirjautumiset',
        'Vahtialueet, niiden hälytykset ja ilmoitushistoria',
        'Sinulle lähetettyjen sähköpostien loki ja tietojen vientitiedostot',
      ],
      keptTitle: 'Säilytetään',
      keptConsents:
        'Suostumusmerkinnät (käyttöehdot, tietosuojaseloste, markkinointi, evästeet) todisteena annetuista ja perutuista suostumuksista. Tilisi irrotetaan niistä, ja osoitteesta jää vain tiiviste, josta osoitetta ei voi lukea.',
      keptJobRuns: (days: number) =>
        `Taustatehtävien ajolokit, joissa on vain laskurit eikä tietojasi, poistetaan ${days} päivän kuluttua.`,
      confirmBefore: 'Kirjoita',
      confirmWord: 'POISTA',
      confirmAfter: 'vahvistukseksi',
      password: 'Salasana',
      submit: 'Poista tili pysyvästi',
      errors: {
        confirmMismatch: 'Kirjoita POISTA isoin kirjaimin.',
        passwordMissing: 'Anna salasanasi.',
        passwordWrong: 'Salasana on väärin.',
        failed: 'Pyyntö epäonnistui. Yritä uudelleen.',
      },
      done: {
        title: 'Tilisi on poistettu',
        body: 'Kiitos, että käytit Metsävahtia. Lähetimme vahvistuksen sähköpostiin.',
        home: 'Etusivulle',
      },
    },
  },
  emails: {
    testAlert: {
      subject: 'Metsävahti: testisähköposti',
      watchAreaName: 'Esimerkkialue',
    },
    /** Shared by `AlertImmediate` and `AlertDigest` (Email artboard templates 3 and 4, MV-073). */
    alert: {
      /** Alert subjects keep the brand prefix the test email has ("Metsävahti: …"). */
      subject: (heading: string) => `Metsävahti: ${heading}`,
      cuttingType: 'Hakkuun tyyppi',
      area: 'Pinta-ala',
      distance: 'Etäisyys',
      received: 'Ilmoitus saapunut',
      change: 'Muutos',
      declarationNumber: 'Ilmoituksen numero',
      changeLabel: {
        new: 'Uusi ilmoitus',
        geometry_changed: 'Rajaus muuttunut',
        attributes_changed: 'Tiedot muuttuneet',
        removed: 'Poistunut aineistosta',
      },
      /** "noin 350 m tontistasi"; the polygon covering the centre reads "tonttisi kohdalla". */
      distanceFromPlot: (distance: string) => `noin ${distance} tontistasi`,
      atPlot: 'tonttisi kohdalla',
      receivedShort: (date: string) => `saapunut ${date}`,
      showOnMap: 'Näytä kartalla',
      onMapLink: 'Kartalla →',
      mapAlt: 'Kartta vahtialueesta ja hakkuualueesta',
      unsubscribeArea: 'Lopeta tämän alueen ilmoitukset',
      openAll: 'Avaa kaikki ilmoitukset',
      more: (count: number) =>
        count === 1
          ? 'Lisäksi 1 ilmoitus – näet sen ilmoituslistalta'
          : `Lisäksi ${count} ilmoitusta – näet ne ilmoituslistalta`,
    },
    alertImmediate: {
      badge: {
        new: 'Uusi ilmoitus',
        geometry_changed: 'Rajaus muuttunut',
        attributes_changed: 'Tiedot muuttuneet',
        removed: 'Poistunut',
        many: 'Uusia ilmoituksia',
      },
      heading: {
        new: (area: string) => `Uusi metsänkäyttöilmoitus vahtialueellasi ${area}`,
        geometry_changed: (area: string) =>
          `Metsänkäyttöilmoituksen rajaus muuttui vahtialueellasi ${area}`,
        attributes_changed: (area: string) =>
          `Metsänkäyttöilmoituksen tiedot muuttuivat vahtialueellasi ${area}`,
        removed: (area: string) => `Metsänkäyttöilmoitus poistui vahtialueeltasi ${area}`,
      },
      headingMany: (count: number, area: string, allNew: boolean) =>
        allNew
          ? `${count} uutta metsänkäyttöilmoitusta vahtialueellasi ${area}`
          : `${count} uutta tai muuttunutta metsänkäyttöilmoitusta vahtialueellasi ${area}`,
      lead: {
        new: (distance: string) =>
          `Metsäkeskuksen aineistoon on lisätty hakkuuaikomus, joka on ${distance}.`,
        geometry_changed: (distance: string) =>
          `Hakkuuaikomuksen rajaus on muuttunut Metsäkeskuksen aineistossa. Ilmoitus on ${distance}.`,
        attributes_changed: (distance: string) =>
          `Hakkuuaikomuksen tiedot ovat muuttuneet Metsäkeskuksen aineistossa. Ilmoitus on ${distance}.`,
        removed: (distance: string) =>
          `Hakkuuaikomus, joka oli ${distance}, ei ole enää Metsäkeskuksen aineistossa.`,
      },
      leadMany: (count: number) =>
        `Vahtialueesi läheltä löytyi ${count} metsänkäyttöilmoitusta, jotka ovat uusia tai muuttuneet edellisen tarkistuksen jälkeen.`,
      previewMore: (count: number) => ` ja ${count} muuta`,
      note: 'Metsänkäyttöilmoitus on hakkuuaikomus, ei velvoite hakata. Hakkuu voi alkaa aikaisintaan 10 päivää ilmoituksesta, ja ilmoitus on voimassa kolme vuotta.',
      footerWhy: (area: string) => `Saat tämän viestin, koska seuraat aluetta ”${area}”.`,
    },
    alertDigest: {
      badge: {
        daily: (day: string) => `Päiväkooste ${day}`,
        weekly: (from: string, to: string) => `Viikkokooste ${from}–${to}`,
      },
      heading: (count: number, allNew: boolean) => {
        if (count === 1) {
          return allNew
            ? 'Uusi metsänkäyttöilmoitus vahtialueellasi'
            : 'Muuttunut metsänkäyttöilmoitus vahtialueellasi'
        }
        return allNew
          ? `${count} uutta metsänkäyttöilmoitusta vahtialueillasi`
          : `${count} uutta tai muuttunutta metsänkäyttöilmoitusta vahtialueillasi`
      },
      previewPeriod: { daily: ' viimeisen vuorokauden aikana', weekly: ' tällä viikolla' },
      lead: {
        daily:
          'Kooste viimeisen vuorokauden aikana löytyneistä uusista ja muuttuneista ilmoituksista.',
        weekly: 'Kooste viikon aikana löytyneistä uusista ja muuttuneista ilmoituksista.',
      },
      groupCount: (count: number) => (count === 1 ? '1 ilmoitus' : `${count} ilmoitusta`),
      unsubscribeGroup: 'Lopeta alueen ilmoitukset',
      note: 'Metsänkäyttöilmoitus on hakkuuaikomus, ei velvoite hakata. Voit vaihtaa koosteen tahdin tai siirtyä välittömiin ilmoituksiin asetuksista.',
      footerWhy: {
        daily: 'Saat tämän viestin, koska olet valinnut päivittäisen koosteen.',
        weekly: 'Saat tämän viestin, koska olet valinnut viikoittaisen koosteen.',
      },
    },
    verify: {
      subject: 'Vahvista sähköpostiosoitteesi',
      preview: 'Vahvista sähköpostiosoitteesi, niin vahtialueet aukeavat',
      badge: 'Tervetuloa',
      heading: 'Vahvista sähköpostiosoitteesi',
      lead: 'Kiitos, että loit tilin. Paina alla olevaa painiketta vahvistaaksesi, että osoite on sinun. Linkki on voimassa 24 tuntia.',
      cta: 'Vahvista sähköposti',
      note: 'Jos et luonut tiliä Metsävahtiin, voit jättää tämän viestin huomiotta. Tili poistetaan automaattisesti 7 päivän kuluessa, jos osoitetta ei vahvisteta.',
      footerWhy: 'Saat tämän viestin, koska tällä osoitteella luotiin tili Metsävahtiin.',
    },
    resetPassword: {
      subject: 'Salasanan palautus',
      preview: 'Aseta uusi salasana – linkki voimassa 1 tunnin',
      badge: 'Turvallisuus',
      heading: 'Salasanan palautus',
      lead: 'Saimme pyynnön vaihtaa tilisi salasana. Aseta uusi salasana painikkeesta. Linkki on voimassa tunnin ja toimii vain kerran.',
      cta: 'Aseta uusi salasana',
      note: 'Jos et pyytänyt salasanan vaihtoa, salasanasi ei ole vaihtunut eikä sinun tarvitse tehdä mitään. Halutessasi voit kirjata ulos muut laitteet tilin turvallisuusasetuksista.',
      footerWhy: 'Saat tämän viestin, koska salasanan palautusta pyydettiin tilillesi.',
    },
    changeEmail: {
      subject: 'Vahvista uusi sähköpostiosoite',
      preview: 'Vahvista uusi sähköpostiosoitteesi',
      badge: 'Turvallisuus',
      heading: 'Vahvista uusi sähköpostiosoite',
      lead: (email: string) =>
        `Tilisi sähköpostiosoitteeksi pyydettiin vaihtoa osoitteeseen ${email}. Vahvista vaihto painikkeesta. Vanha osoite pysyy käytössä, kunnes vahvistus on tehty. Linkki on voimassa tunnin.`,
      cta: 'Vahvista uusi osoite',
      note: 'Jos et pyytänyt vaihtoa, jätä viesti huomiotta; osoite ei vaihdu. Lähetimme tiedon myös vanhaan osoitteeseen.',
      footerWhy: 'Saat tämän viestin, koska tilisi sähköpostiosoitteen vaihtoa pyydettiin.',
    },
    emailChangeNotice: {
      subject: 'Sähköpostiosoitteen vaihtoa pyydettiin',
      preview: 'Tilisi sähköpostiosoitteen vaihtoa pyydettiin',
      badge: 'Turvallisuus',
      heading: 'Sähköpostiosoitteen vaihtoa pyydettiin',
      lead: (email: string) =>
        `Tilisi sähköpostiosoitteeksi pyydettiin vaihtoa osoitteeseen ${email}. Osoite vaihtuu vasta, kun vaihto vahvistetaan uuteen osoitteeseen lähetetystä linkistä; siihen asti kirjaudut tällä osoitteella.`,
      cta: 'Avaa turvallisuusasetukset',
      note: 'Jos et pyytänyt vaihtoa, vaihda salasanasi ja kirjaa muut laitteet ulos turvallisuusasetuksista.',
      footerWhy: 'Saat tämän viestin, koska tilisi sähköpostiosoitteen vaihtoa pyydettiin.',
    },
    exportReady: {
      subject: 'Tietojen vienti on valmis',
      preview: 'Tietosi ovat valmiit ladattavaksi – linkki voimassa 24 h',
      badge: 'Tietopyyntö',
      heading: 'Tietojen vienti on valmis',
      lead: 'Pyytämäsi tietopaketti on koottu. Se sisältää tilitietosi, vahtialueet GeoJSON-muodossa, ilmoitushistorian, suostumushistorian ja sinulle lähetetyt sähköpostit.',
      cta: (size: string) => `Lataa tiedot (zip, ${size})`,
      contents: 'Sisältö',
      size: 'Koko',
      expires: 'Linkki vanhenee',
      expiresAt: (when: string) => `${when} (24 h)`,
      note: 'Kuka tahansa linkin saanut voi ladata tietosi sen voimassaoloaikana, joten älä jaa sitä. Jos et pyytänyt vientiä, vaihda salasanasi tilin turvallisuusasetuksista.',
      footerWhy: 'Saat tämän viestin, koska pyysit tietojesi vientiä tilin asetuksista.',
    },
    accountDeleted: {
      subject: 'Tilisi on poistettu',
      preview: 'Tilisi on poistettu – kiitos, että käytit Metsävahtia',
      heading: 'Tilisi on poistettu',
      lead: 'Pyyntösi mukaisesti olemme poistaneet tilisi ja siihen liittyvät tiedot. Et saa enää ilmoituksia vahtialueiltasi.',
      deleted: 'Poistettu',
      deletedValue: (watchAreas: number) =>
        watchAreas === 0
          ? 'Tili ja ilmoitushistoria'
          : `Tili, ${watchAreas} ${watchAreas === 1 ? 'vahtialue' : 'vahtialuetta'}, ilmoitushistoria`,
      kept: 'Säilytetään',
      keptValue: 'Suostumusmerkinnät ilman tiliä ja osoitetta',
      at: 'Ajankohta',
      note: 'Jos et tehnyt tätä pyyntöä, ota heti yhteyttä tietosuojaselosteessa mainittuun osoitteeseen. Voit luoda uuden tilin milloin tahansa; vanhoja vahtialueita ei kuitenkaan voi palauttaa.',
      footerWhy: 'Tämä on viimeinen viesti, jonka lähetämme tähän osoitteeseen.',
    },
    contactReceived: {
      subject: (name: string | undefined) =>
        name ? `Yhteydenotto: ${name}` : 'Yhteydenotto lomakkeelta',
      preview: 'Uusi viesti yhteydenottolomakkeelta',
      heading: 'Uusi yhteydenotto',
      lead: 'Viesti lähetettiin sivulta /yhteystiedot. Vastaa suoraan tähän viestiin, niin vastaus menee lähettäjälle.',
      name: 'Nimi',
      noName: '(ei annettu)',
      email: 'Sähköposti',
      receivedAt: 'Vastaanotettu',
      message: 'Viesti',
      footerWhy: 'Tämä on Metsävahdin sisäinen ilmoitus yhteydenottolomakkeelta.',
    },
    dataRequestReceived: {
      subject: (reference: string) => `Tietopyyntö ${reference}`,
      preview: 'Uusi tietopyyntö lomakkeelta – vastattava 30 päivän kuluessa',
      heading: 'Uusi tietopyyntö',
      lead: 'Rekisteröidyn pyyntö sivulta /tietopyynto. Varmista pyytäjän henkilöllisyys ennen kuin luovutat tai poistat tietoja, ja vastaa viimeistään 30 päivän kuluessa.',
      reference: 'Viite',
      type: 'Pyynnön tyyppi',
      email: 'Sähköposti',
      receivedAt: 'Vastaanotettu',
      message: 'Viesti',
      note: 'Pyytäjä sai vahvistuksen samalla viitteellä. Vastaa suoraan tähän viestiin, niin vastaus menee pyytäjälle.',
      footerWhy: 'Tämä on Metsävahdin sisäinen ilmoitus tietopyyntölomakkeelta.',
    },
    dataRequestConfirmation: {
      subject: 'Tietopyyntösi on vastaanotettu',
      preview: 'Vastaamme tietopyyntöösi 30 päivän kuluessa',
      heading: 'Tietopyyntösi on vastaanotettu',
      lead: 'Kiitos. Olemme vastaanottaneet tietopyyntösi ja vastaamme tähän osoitteeseen viimeistään 30 päivän kuluessa.',
      reference: 'Viite',
      type: 'Pyynnön tyyppi',
      receivedAt: 'Vastaanotettu',
      note: 'Varmistamme ennen käsittelyä, että osoite kuuluu sinulle. Jos et lähettänyt tätä pyyntöä, voit jättää viestin huomiotta.',
      footerWhy:
        'Sait tämän viestin, koska osoitteesi annettiin Metsävahdin tietopyyntölomakkeella.',
    },
  },
  /** `/ilmoitukset-lopetettu`: where the unsubscribe link of an alert email lands (MV-073). */
  unsubscribe: {
    metaTitle: 'Ilmoitusten lopetus',
    done: {
      title: 'Ilmoitukset lopetettu',
      body: 'Et saa enää sähköposti-ilmoituksia tältä vahtialueelta. Vahtialue säilyy tililläsi, ja voit ottaa ilmoitukset takaisin käyttöön ilmoitusasetuksista.',
    },
    used: {
      title: 'Linkki on jo käytetty',
      body: 'Tämän alueen ilmoitukset on jo lopetettu tällä linkillä. Kirjaudu sisään, jos haluat tarkistaa tai muuttaa ilmoitusasetuksiasi.',
    },
    expired: {
      title: 'Linkki ei ole enää voimassa',
      body: 'Lopetuslinkki toimii 30 päivää, eikä vanhentunut tai poistetun alueen linkki muuta mitään. Kirjaudu sisään ja lopeta ilmoitukset ilmoitusasetuksista.',
    },
    login: 'Kirjaudu ilmoitusasetuksiin',
  },
  publicForms: {
    tabsLabel: 'Lomakkeen valinta',
    contactTab: 'Yhteydenotto',
    dataRequestTab: 'Tietopyyntö',
    contactDetails: 'Yhteystiedot',
    supportEmail: 'Sähköposti',
    privacyEmail: 'Tietosuoja',
    responseTime: 'Vastausaika',
    responseTimeValue: 'Yleensä 2 arkipäivää, tietopyynnöt 30 päivän kuluessa.',
    name: 'Nimi',
    email: 'Sähköposti',
    message: 'Viesti',
    consentPrefix: 'Hyväksyn, että viestini ja yhteystietoni käsitellään',
    consentLink: 'tietosuojaselosteen',
    consentSuffix: 'mukaisesti vastaamista varten.',
    honeypot: 'Jätä tämä kenttä tyhjäksi',
    sendAnother: 'Lähetä toinen viesti',
    errors: {
      emailInvalid: 'Anna toimiva sähköpostiosoite.',
      nameTooLong: 'Nimi on liian pitkä (enintään 100 merkkiä).',
      messageMissing: 'Kirjoita viesti.',
      messageTooLong: 'Viesti on liian pitkä (enintään 5000 merkkiä).',
      consentRequired: 'Suostumus tarvitaan, jotta voimme vastata.',
      typeRequired: 'Valitse pyynnön tyyppi.',
    },
    contact: {
      title: 'Yhteystiedot',
      intro:
        'Kysymys palvelusta, virhe aineistossa tai idea? Vastaamme yleensä parin arkipäivän sisällä.',
      submit: 'Lähetä viesti',
      sentTitle: 'Kiitos viestistäsi',
      sentBody: (email: string) =>
        `Vastaamme osoitteeseen ${email} yleensä kahden arkipäivän kuluessa.`,
    },
    dataRequest: {
      title: 'Tietopyyntö',
      intro:
        'Voit käyttää rekisteröidyn oikeuksiasi tällä lomakkeella myös ilman tiliä. Vastaamme 30 päivän kuluessa.',
      type: 'Pyynnön tyyppi',
      types: {
        access: { label: 'Tarkastus', sub: 'Haluan tietää, mitä tietoja minusta on tallennettu.' },
        erasure: { label: 'Poisto', sub: 'Haluan, että tietoni poistetaan.' },
        other: { label: 'Muu pyyntö', sub: 'Oikaisu, rajoittaminen, siirto tai vastustaminen.' },
      },
      selfServicePrefix: 'Jos sinulla on tili, nopein tapa on tehdä pyyntö itse kohdassa',
      selfServiceLink: 'Tili → Tietosuoja ja tiedot',
      selfServiceSuffix: '. Ennen käsittelyä varmistamme, että antamasi osoite kuuluu sinulle.',
      submit: 'Lähetä tietopyyntö',
      sentTitle: 'Tietopyyntö vastaanotettu',
      sentBody: (email: string) =>
        `Lähetimme vahvistuksen osoitteeseen ${email}. Vastaamme samaan osoitteeseen viimeistään 30 päivän kuluessa.`,
    },
  },
  forms: {
    password: {
      show: 'Näytä',
      hide: 'Piilota',
      showLabel: 'Näytä salasana',
      hideLabel: 'Piilota salasana',
      strengthHint: 'Vähintään 10 merkkiä',
      strengthMeter: 'Salasanan vahvuus',
      strength: {
        tooShort: 'Liian lyhyt',
        0: 'Heikko',
        1: 'Heikko',
        2: 'Kohtalainen',
        3: 'Hyvä',
        4: 'Vahva',
      },
    },
  },
  /** Retention rules for the privacy page (`config/retention.ts` fills in the periods). */
  retention: {
    declarations: {
      data: 'Metsänkäyttöilmoitukset (välimuisti)',
      start: 'ilmoituksen voimassaolon päättyminen',
      description: (days: number, alertGraceDays: number) =>
        `Metsänkäyttöilmoitus poistetaan ${days} päivää voimassaolonsa päättymisen jälkeen, ellei siitä ole tehty hälytystä viimeisten ${alertGraceDays} päivän aikana. Ilmoituksen mukana poistuvat sen hälytykset ja aiemmat versiot.`,
    },
    declarationRevisions: {
      data: 'Metsänkäyttöilmoitusten aiemmat versiot',
      start: 'muutos',
      description: (days: number) =>
        `Ilmoituksen aiempi versio poistetaan ${days} päivän kuluttua muutoksesta.`,
    },
    dataExports: {
      data: 'Tietojen vientitiedostot',
      start: 'latauslinkin vanheneminen',
      description: (days: number) =>
        days === 0
          ? 'Vientitiedosto poistetaan ja pyyntö merkitään vanhentuneeksi, kun latauslinkki vanhenee.'
          : `Vientitiedosto poistetaan ja pyyntö merkitään vanhentuneeksi ${days} päivän kuluttua latauslinkin vanhenemisesta.`,
    },
    jobRuns: {
      data: 'Taustatehtävien ajolokit',
      start: 'ajon alku',
      description: (days: number) =>
        `Taustatehtävien ajotiedot poistetaan ${days} päivän kuluttua.`,
    },
    rateLimitBuckets: {
      data: 'Pyyntörajoitusten laskurit',
      start: 'laskentaikkunan päättyminen',
      description: (days: number) =>
        days === 0
          ? 'Pyyntörajoituksen laskuri poistetaan, kun sen laskentaikkuna on päättynyt.'
          : `Pyyntörajoituksen laskuri poistetaan ${days} päivän kuluttua laskentaikkunan päättymisestä.`,
    },
  },
  /** Legal pages (MV-091); the documents' own text comes from `legal-documents`. */
  legal: {
    tocLabel: 'Sisältö',
    updated: (date: string) => `Päivitetty ${date}`,
    version: (version: string) => `Versio ${version}`,
    openCookieSettings: 'Avaa evästeasetukset',
    cookieTable: {
      title: 'Käytetyt evästeet',
      caption: 'Palvelun käyttämät evästeet',
      name: 'Nimi',
      purpose: 'Tarkoitus',
      category: 'Luokka',
      lifetime: 'Voimassa',
      categories: { necessary: 'Välttämätön', analytics: 'Analytiikka' },
    },
    cookies: {
      session: {
        purpose: 'Kirjautumisistunto',
        lifetime: (standardDays: number, rememberedDays: number) =>
          `${standardDays} pv / ${rememberedDays} pv (Muista minut)`,
      },
      consent: {
        purpose: 'Suostumusvalinnat',
        lifetime: (months: number) => `${months} kk`,
      },
    },
  },
  admin: {
    runPipeline: {
      button: 'Aja haku nyt',
      running: 'Haku käynnissä…',
      succeeded: 'Haku valmis.',
      failed: 'Haku epäonnistui. Katso virhe tehtäväajoista.',
      alreadyRunning: 'Haku on jo käynnissä. Odota, että se valmistuu.',
    },
    gdpr: {
      title: 'Tietosuoja',
      consents: {
        title: 'Suostumushistoria',
        choice: 'Valinta',
        version: 'Versio',
        date: 'Aika',
        empty: 'Ei tallennettuja suostumuksia.',
      },
      exportState: {
        title: 'Viimeisin tietojen vienti',
        none: 'Ei vientejä.',
        pending: 'Valmistellaan',
        ready: 'Valmis, linkki lähetetty käyttäjälle',
        expired: 'Vanhentunut',
        failed: 'Epäonnistui',
        validUntil: 'voimassa',
        nextAllowedAt: 'Seuraava vienti sallittu',
      },
      actions: {
        title: 'Tukipyynnöt',
        intro:
          'Toimenpiteet kirjataan tehtäväajoihin (admin-gdpr). Vientilinkki lähtee käyttäjän omaan osoitteeseen.',
        export: 'Vie käyttäjän tiedot',
        exporting: 'Viedään…',
        exported: 'Vienti tehty. Linkki lähetettiin käyttäjälle.',
        delete: 'Poista käyttäjän tili',
        deleting: 'Poistetaan…',
        deleted: 'Tili poistettu.',
        confirmHeading: 'Poistetaanko tili pysyvästi?',
        confirmBody:
          'Käyttäjän vahtialueet, hälytykset, viennit ja ilmoitushistoria poistetaan, suostumukset anonymisoidaan. Käyttäjä saa vahvistuksen sähköpostiin. Toimintoa ei voi perua.',
        confirm: 'Poista pysyvästi',
        cancel: 'Peruuta',
        failed: 'Toiminto epäonnistui.',
        adminAccount: 'Ylläpitäjän tiliä ei voi poistaa täältä. Vaihda rooli ensin.',
        beingDeleted: 'Tilin poisto on käynnissä.',
      },
      errors: {
        notFound: 'Käyttäjää ei löytynyt.',
        adminAccount: 'Ylläpitäjän tiliä ei voi poistaa täältä. Vaihda rooli ensin.',
        beingDeleted: 'Tilin poisto on käynnissä; vientiä ei voi tehdä.',
      },
    },
  },
} as const
