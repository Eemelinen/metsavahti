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
    comingSoon: 'Tämä sivu on vielä rakenteilla.',
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
  },
  account: {
    title: 'Tili ja asetukset',
    tabs: {
      label: 'Tilin osiot',
      profile: 'Tili',
      security: 'Turvallisuus',
      notifications: 'Ilmoitusasetukset',
      privacy: 'Tietosuoja ja tiedot',
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
  },
  emails: {
    testAlert: {
      subject: 'Metsävahti: testisähköposti',
      watchAreaName: 'Esimerkkialue',
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
    },
  },
} as const
