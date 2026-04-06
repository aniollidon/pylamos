---
name: catalan-style
description: Guia per escriure textos en català. Usa-ho quan hagis d'escriure qualsevol text en català. Sobretot si és visible per l'usuari final.
---

# Guia d'estil per als textos en català

Quan escriguis textos en català per a aquest projecte segueix aquestes directrius basades en la
[Guia d'estil de Softcatalà](https://www.softcatala.org/guia-estil-de-softcatala/).

## Principis generals

- **Claredat**: frases curtes i directes. Evita subordinades innecessàries.
- **Naturalitat**: escriu com parlaries, però amb correcció.
- **Coherència**: usa sempre els mateixos termes per al mateix concepte.

L’estil ha de ser clar, lògic i acurat. El lector no ha de percebre que el text és una traducció; per a assolir aquest objectiu, cal evitar els anglicismes (tant lèxics com sintàctics), així com les expressions ambigües i les frases llargues i complexes.

## Ortografia i gramàtica

Les normes generals estan regulades a la Gramàtica de la llengua catalana de l'IEC.

- Les LLMs poden cometre errors d'ortografia i gramàtica. Revisa sempre els textos generats.
- Les LLMs tendeixen a usar lèxic més general amb molta interferència del castellà i anglès. Revisa i evita les formes no catalanes.

# To (formalitat) i tractament de l'usuari

En català, el to que s’utilitza habitualment en la redacció de programari i documentació és més formal que en anglès. Si bé als textos informàtics redactats en anglès és habitual trobar-hi onomatopeies (com ara «huh!») i expressions col·loquials («oh, bother!»), en català aquest tipus d’expressions no hi són gens freqüents. D’altra banda, en anglès sovint s’utilitza un llenguatge que tendeix a «humanitzar» l’ordinador, per mitjà de frases com ara «Sorry, passwords do not match», que en català són del tot alienes al context informàtic. Una altra diferència important és el tractament. Quan l’ordinador es dirigeix a l’usuari (tant en quadres de diàleg com en documentació), en anglès es fa servir sempre la forma «you», del tot neutra en termes de formalitat. En català, en canvi, es fa servir la forma «vós». Cal tenir present, però, que en expressions com ara «A better browser for you» el tractament no es tradueix («Un navegador millor»), per a evitar la tendència a humanitzar l’ordinador pròpia de l’anglès.

- Usa **vós** (2a persona plural formal): "Escriviu una paraula", "Heu trobat la rebuscada!".
- Imperatiu: "Proveu", "Escriviu", "Mireu".

### Variació dialectal

Sempre que sigui possible, i garantint que el resultat no soni forçat, s’ha d’optar per les formes més comunes d’arreu del domini lingüístic en les traduccions d’àmbit general.

### Neutralització del gènere

Sempre que existeixi, optarem per la forma o construcció més genèrica («Us donem la benvinguda», «Tothom», «Traduït per»). En la localització, per raons d’economia d’espai, es desaconsella l’ús de formes dobles.

#### Llista de suggeriments per a neutralitzar

A continuació oferim un conjunt d’expressions comunes que us suggerim neutralitzar.

| Forma sense neutralitzar           | Forma neutralitzada                          |
| ---------------------------------- | -------------------------------------------- |
| Desenvolupadors/traductors         | Equip de desenvolupament, equip de traducció |
| Gràcies als nostres col·laboradors | Agraïm la col·laboració de:                  |
| Benvinguts                         | Us donem la benvinguda                       |
| Tots/totes                         | Tothom                                       |
| Nen/nena, nens/nenes               | Infant, infants, mainada                     |
| Autor/ora:                         | Publicat/creat/traduït per, obra de:         |

En canvi, desaconsellem l’ús de mots com ara «professorat» o «estudiantat», molt estesos però incorrectes, atès que en català (com en la majoria de llengües romàniques), el sufix -at s’empra per a fer referència a un ofici, càrrec o dignitat i no pas a un conjunt de persones. En aquests casos, utilitzarem la forma masculina (atès que és la menys marcada):

| No         | Sí          |
| ---------- | ----------- |
| Professors | Professorat |

### Pronoms possessius

Els missatges de l'ordinador són plens d'expressions com «your computer», «your file», etc. En català, ometem el possessiu quan no hi ha dubte de a què es refereix:

| Text original | Are you sure you want to remove your file?       |
| ------------- | ------------------------------------------------ |
| No            | Esteu segur que voleu eliminar el vostre fitxer? |
| Sí            | Esteu segur que voleu eliminar el fitxer?        |

Si convé recollir el matís semàntic, es pot recórrer a estructures amb «tenir»:

| Text original | Please check your printer is properly installed.                  |
| ------------- | ----------------------------------------------------------------- |
| No            | Comproveu que la vostra impressora està correctament instal·lada. |
| Sí            | Comproveu que teniu la impressora ben instal·lada.                |

Conservem el possessiu només quan cal distingir explícitament (p.ex. «voleu penjar-hi igualment el vostre fitxer?» quan hi ha un altre fitxer amb el mateix nom al servidor).

### Veu activa i veu passiva

El català no fa un ús tan habitual de la passiva com l'anglès. Convertim les frases a la forma activa sempre que puguem:

| Text original | Your signature is not displayed, but is added to the message window when the message is sent. |
| ------------- | --------------------------------------------------------------------------------------------- |
| No            | La signatura no és visualitzada, però és afegida a la finestra del missatge quan és enviat.   |
| Sí            | La signatura no es visualitza, però s'afegeix a la finestra del missatge quan s'envia.        |

Cal modificar l'ordre dels components respecte de l'anglès:

| Text original | The file has been saved. |
| ------------- | ------------------------ |
| No            | El fitxer s'ha desat.    |
| Sí            | S'ha desat el fitxer.    |

Això no vol dir que no es pugui utilitzar la forma passiva si realment és necessari:

| Text original | mIRC has been developed by Khaled Mardam-Bey.        |
| ------------- | ---------------------------------------------------- |
| No            | El mIRC l'ha desenvolupat Khaled Mardam-Bey.         |
| Sí            | El mIRC ha estat desenvolupat per Khaled Mardam-Bey. |

### Expressions innecessàries

Els programadors en anglès tendeixen a «humanitzar» el programari. Aquestes expressions no les traduïm.

#### Sorry

| Text original | Sorry, that action name already exists.      |
| ------------- | -------------------------------------------- |
| No            | Em sap greu, aquest nom d'acció ja existeix. |
| Sí            | Aquest nom d'acció ja existeix.              |

#### Please

| Text original | Please try again later.                  |
| ------------- | ---------------------------------------- |
| No            | Si us plau, torneu-ho a provar més tard. |
| Sí            | Torneu a provar-ho més tard.             |

#### You can

Quan «You can» implica una ordre, traduïm per imperatiu:

| Text original | You can use + and - to perform relative movement.   |
| ------------- | --------------------------------------------------- |
| No            | Podeu utilitzar + i - per a fer moviments relatius. |
| Sí            | Utilitzeu + i - per a fer moviments relatius.       |

Quan expressa possibilitat real, traduïm per «podeu» + infinitiu.

#### May

- **Possibilitat**: «podeu» + infinitiu.
- **Probabilitat**: «És possible que» / «Pot ser que» + subjuntiu (mai «pot» + infinitiu).

| Text original | The server may be down or may be incorrectly configured.          |
| ------------- | ----------------------------------------------------------------- |
| No            | El servidor pot haver caigut o estar configurat incorrectament.   |
| Sí            | És possible que el servidor hagi caigut o estigui mal configurat. |

Evitem traduir «may» en condicional. Quan fa referència a característiques d'alguna cosa, és aconsellable ometre'l.

#### Simply

L'adverbi «simply» generalment no el traduïm:

| Text original | Simply right click on the icon and choose «Configuration...» from the menu. |
| ------------- | --------------------------------------------------------------------------- |
| No            | Simplement feu clic amb el botó dret a la icona i trieu «Configuració...».  |
| Sí            | Feu clic amb el botó dret a la icona i trieu «Configuració...».             |

#### Onomatopeies

No traduïm onomatopeies com «oh» o expressions col·loquials angleses.

### Expressions sintètiques

En català és preferible redactar amb oracions completes amb verb conjugat:

- **Infinitiu com a pregunta**: «Continuar?» → «Voleu continuar?»
- **Substantiu sol**: «Error en el fitxer.» → «Hi ha un error en el fitxer.»
- **Substantiu + adjectiu**: «Carpeta ineliminable.» → «No es pot eliminar la carpeta.»
- **Substantiu + participi**: «Opció habilitada.» → «L'opció és habilitada.»

## Qüestions gramaticals

### Estructura de la frase

L'ordre de la frase ha de ser lògic en català: **Subjecte + Verb + Complements regits + Complements no regits**. No s'ha de mediatitzar per l'estructura anglesa.

| Text original | Inserting can only be done in editing mode. |
| ------------- | ------------------------------------------- |
| No            | Inserir només es pot fer en mode edició.    |
| Sí            | Només es pot inserir en mode edició.        |

#### Ordre lògic de la informació

Primer la informació general, després els detalls:

| Text original | Choose Open from the File menu. |
| ------------- | ------------------------------- |
| No            | Trieu Obre al menú Fitxer.      |
| Sí            | Al menú Fitxer, trieu Obre.     |

#### Construcció positiva de les frases

Preferim construccions positives:

| Text original | Don't forget to save your document. |
| ------------- | ----------------------------------- |
| No            | No us oblideu de desar el document. |
| Sí            | Recordeu-vos de desar el document.  |

### Formes verbals

#### Quan l'usuari s'adreça a l'ordinador

Imperatiu en 2a persona del **singular** (tractament de «tu»): menús, botons d'acció, opcions de configuració.

- No «Editar», sinó «Edita».
- No «Obrir», sinó «Obre».

Mai l'infinitiu per a expressar ordres.

#### Quan l'ordinador s'adreça a l'usuari

Imperatiu en 2a persona del **plural** (tractament de «vós»): documentació, quadres de diàleg informatius, preguntes.

- «Escriviu», «Proveu», «Seleccioneu».

El plural no implica que s'adreci a més d'una persona: escrivim «esteu desconnectat» (no «desconnectats»), «esteu segur» (no «segurs»).

Evitem l'ús explícit de «vós» sempre que es pugui:

| Text original | Generate a new key of your own.    |
| ------------- | ---------------------------------- |
| No            | Genereu una clau per a vós mateix. |
| Sí            | Genereu una clau pròpia.           |

#### Temps verbal

Traduïm el «past simple» anglès pel pretèrit indefinit o present d'indicatiu:

| Anglès                    | Català        |
| ------------------------- | ------------- |
| Cannot / Unable to        | No es pot     |
| Could not / Was unable to | No s'ha pogut |
| You cannot                | No podeu      |
| You could not             | No heu pogut  |

Evitem l'ús inadequat del futur en lloc del present:

| Text original | The first entry will have to be... |
| ------------- | ---------------------------------- |
| No            | La primera entrada haurà de ser... |
| Sí            | La primera entrada ha de ser...    |

#### Ser i estar

L'anglès «to be» es pot traduir per «ser» o «estar». Regles:

- **Lloc**: sempre «ser» (no «estar»): «El fitxer X **és** a la carpeta Y.»
- **Adjectius/participis**: preferim «ser»: «La base de dades **és** buida.», «El disc **és** ple.»
- Quan només pot anar «estar»: «El programa X **està** baixat.», «El disc **està** danyat.»
- En cas de dubte, opteu per «estar» o una solució no compromesa: «El disc ja s'ha formatat.»

#### Verb + de + infinitiu

Quan «de» és optatiu, no el posem:

| Sí                                | No                                  |
| --------------------------------- | ----------------------------------- |
| Teniu prohibit accedir al fitxer. | Teniu prohibit d'accedir al fitxer. |

#### Gerundi

No traduïm el gerundi anglès literalment. Alternatives:

- **Acció en curs**: «S'està baixant el correu.» (no «Baixant el correu.»)
- **en + infinitiu**: «S'ha produït un error en llegir el correu.» (mai «al llegir»)
- **Substantiu** (en títols): «Edició de fitxers.» (no «Editant els fitxers.»)

El gerundi no pot tenir valor d'adjectiu:

| Sí                                | No                                |
| --------------------------------- | --------------------------------- |
| Fitxer que conté la documentació. | Fitxer contenint la documentació. |

Evitem el gerundi en construccions que no indiquin simultaneïtat:

| Sí                                                | No                                              |
| ------------------------------------------------- | ----------------------------------------------- |
| S'ha produït un error i el fitxer s'ha fet malbé. | S'ha produït un error, fent-se malbé el fitxer. |

#### Adverbis

Evitem els adverbis en «–ment» quan hi ha alternativa més natural:

| Sí              | No                         |
| --------------- | -------------------------- |
| Mal configurat. | Configurat incorrectament. |

Si combinem dos adverbis en «–ment», suprimim la terminació del **segon** (no del primer):

| Sí                          | No                          |
| --------------------------- | --------------------------- |
| Independentment i eficient. | Independent i eficientment. |

#### Condicionals (should)

Evitem «Hauríeu de» + infinitiu. Preferim «És recomanable que» + subjuntiu:

| Text original | You should close all programs.                 |
| ------------- | ---------------------------------------------- |
| No            | Hauríeu de tancar tots els programes.          |
| Sí            | És recomanable que tanqueu tots els programes. |

Quan «should» indica conseqüència, usem el futur o «haver de» en present:

| Text original | After clicking there a window should be opened.            |
| ------------- | ---------------------------------------------------------- |
| No            | Després de clicar-hi s'hauria d'obrir una finestra.        |
| Sí            | Després de clicar-hi s'obrirà / s'ha d'obrir una finestra. |

#### en + infinitiu

Per a indicar simultaneïtat, usem «en» + infinitiu, mai «al» + infinitiu:

| Sí                                 | No                                 |
| ---------------------------------- | ---------------------------------- |
| En tancar l'ordinador, recordeu... | Al tancar l'ordinador, recordeu... |

### La negació

#### «Or» amb valor negatiu

La conjunció «or» amb valor negatiu es tradueix per «ni», no per «o»:

| Text original | You won't be able to open or modify the file. |
| ------------- | --------------------------------------------- |
| No            | No podreu obrir o modificar el fitxer.        |
| Sí            | No podreu obrir ni modificar el fitxer.       |

#### La doble negació

Les partícules «mai», «cap», «res», «gens» i «ningú» sempre duen «no»:

- «No tragueu **mai** el disquet abans d'hora.»
- «**Cap** ordre **no** s'ha d'escriure en majúscules.»

Quan en anglès una construcció negativa inclou un article indefinit, traduïm per «cap»:

| Text original | Unable to find a valid file.     |
| ------------- | -------------------------------- |
| No            | No s'ha trobat un fitxer vàlid.  |
| Sí            | No s'ha trobat cap fitxer vàlid. |

Quan l'objecte directe és plural, sovint cal traduir-lo en singular:

| Text original | No files were found.       |
| ------------- | -------------------------- |
| No            | No s'han trobat fitxers.   |
| Sí            | No s'ha trobat cap fitxer. |

### El substantiu

Evitem l'abús de substantius; sovint un verb és més directe i genuí:

| Sí                             | No                                           |
| ------------------------------ | -------------------------------------------- |
| ...és útil per a fer trucades. | ...és útil per a la realització de trucades. |

#### Les marques de plural

Plurals de substantius en -sc, -st, -xt, -ig: inserció vocàlica → «boscos», «testos», «contextos», «sondejos». Excepció: «aquests» (mai «aquestos»).

#### L'article en les enumeracions

Repetim el determinant quan canvia gènere i/o nombre:

| Text original | All movie and sound files.                 |
| ------------- | ------------------------------------------ |
| No            | Totes les pel·lícules i fitxers de so.     |
| Sí            | Totes les pel·lícules i els fitxers de so. |

#### La concordança de gènere

Quan un adjectiu es refereix a substantius de gènere diferent, concordança en masculí:

| Text original | Hide running programs and applications.          |
| ------------- | ------------------------------------------------ |
| No            | Amagueu els programes i les aplicacions obertes. |
| Sí            | Amagueu els programes i les aplicacions oberts.  |

#### Substantiu + a + infinitiu

Evitem aquesta construcció:

| Text original | File to open.            |
| ------------- | ------------------------ |
| No            | Fitxer a obrir.          |
| Sí            | Fitxer que s'ha d'obrir. |

### Complement + substantiu

En català, el complement es posposa al substantiu (a diferència de l'anglès):

| Text original | New file.   |
| ------------- | ----------- |
| No            | Nou fitxer. |
| Sí            | Fitxer nou. |

| Text original | Consider the following steps:          |
| ------------- | -------------------------------------- |
| No            | Tingueu en compte els següents passos: |
| Sí            | Tingueu en compte els passos següents: |

### El pronom «es»

Davant un mot començat per s-, ce- o ci-, s'escriu en forma plena «se»:

- «**Se** sap que algunes característiques...»
- «Les propietats d'aquest programa **se** sumen a les de...»

### L'article

En català cal afegir articles on l'anglès els omet:

| Text original | Downloading mail.             |
| ------------- | ----------------------------- |
| No            | S'està baixant correu.        |
| Sí            | S'està baixant **el** correu. |

| Text original | Please select location.       |
| ------------- | ----------------------------- |
| No            | Seleccioneu ubicació.         |
| Sí            | Seleccioneu **una** ubicació. |

L'article precedeix sempre els noms de programes i sistemes operatius: «l'Excel», «el Windows», «el Linux».

### Les preposicions «per» i «per a»

- **«per»** → agent o causa: «Traduït **per** Softcatalà.», «S'ha cancel·lat **per** sobrecàrrega.»
- **«per a»** → destinatari o finalitat: «Programa **per a** la compressió de fitxers.», «Introduïu la contrasenya **per a** accedir.»

Davant infinitiu:

- **«per»** → cosa per fer (pendent): «Programa per baixar.» (encara no s'ha baixat)
- **«per»** → causa: «Gràcies per visitar el nostre web.»
- **«per a»** → destinació o finalitat: «Programa per a baixar imatges.» (que serveix per a fer baixades)

### Les locucions «per tal de» i «per tal que»

Evitem-les: són arcaiques i fan les frases innecessàriament llargues. Alternatives: «per (a)» i «perquè».

| Sí                                                     | No                                                          |
| ------------------------------------------------------ | ----------------------------------------------------------- |
| Deixeu el camp en blanc per a mantenir la contrasenya. | Deixeu el camp en blanc per tal de mantenir la contrasenya. |

| Sí                                                         | No                                                              |
| ---------------------------------------------------------- | --------------------------------------------------------------- |
| Heu de reiniciar el servidor perquè s'apliquin els canvis. | Heu de reiniciar el servidor per tal que s'apliquin els canvis. |

### Les preposicions «en» i «a»

- **Moviment**: sempre «a» → «Torneu **a** la pàgina anterior.»
- **Localització estàtica**:
  - Davant topònims: «a» → «La reunió serà **a** València.»
  - Davant article determinat: «a» o «en» (ambdues correctes).
  - Davant substantius abstractes: «en» → «Les limitacions **en** l'ús de dades.»
  - Tots els altres casos (altres determinants, numerals, noms): sempre «en» → «Voleu desar el fitxer **en** aquesta carpeta?»

### Preposicions de lloc compostes

Usem la variant més curta: «damunt la taula» (no «a damunt de la taula»), «sota l'altra» (no «a sota de l'altra»).

### «Com» i «com a»

- **«com»** = «en comparació a», «semblant a»: «Un gestor de correu com l'Eudora.»
- **«com a»** = «en qualitat de», «fent la funció de»: «El programa X pot treballar com a gestor de base de dades.»

### Construcció «d'altres»

«D'altres» només té valor partitiu (una part d'un col·lectiu ja esmentat). No pot dur cap nom darrere:

- Correcte: «Alguns documents poden editar-se, però d'altres no.»
- Correcte: «Hi ha **altres** fitxers per traduir.» (no «d'altres fitxers»)

## Aspectes convencionals

### Puntuació

#### Punts suspensius

- Sense espai amb el mot precedent: «S'està carregant...», no «S'està carregant ...».
- Si la frase comença amb punts suspensius, també van enganxats: «...el nom del camp no és buit.»
- No combineu «etc.» i «...»: trieu una sola opció.

#### La coma

- En una enumeració simple, no posem coma abans de «i» o «o».
- Posem coma en incisos inicials o connectors quan calgui claredat.

| Text original | Menus, toolbars, and keys.       |
| ------------- | -------------------------------- |
| No            | Menús, barres d'eines, i tecles. |
| Sí            | Menús, barres d'eines i tecles.  |

#### Cometes

- En català, usem **cometes baixes**: « ».
- Si hi ha cometes dins cometes, ordre recomanat: « ... " ... ' ... ' ... " ... ».
- En cadenes d'interfície, les cometes poden ressaltar botons o opcions: «D'acord».
- No combineu alhora cometes i cursiva/negreta per al mateix text.

#### Parèntesis i guió llarg

- En incisos amb guió llarg, deixeu espai abans del guió d'obertura i després del de tancament.
- Si el guió llarg marca èmfasi, sovint és millor una coma o punt i coma.

#### Guionet

- Amb prefixos, en general **sense guionet**: «antivirus», «audiovisual».
- Excepcions en compostos catalans per evitar lectures errònies: «porta-retalls», «posa-ratolins».

#### Signes d'interrogació i d'admiració

- En català TIC, habitualment només al final: «Voleu desar els canvis?»
- Evitem «¿...?» i «¡...!» tret de casos justificats.
- L'admiració en errors, només si hi ha una alerta realment crítica.

#### Barra inclinada

- Entre mots simples, sense espais: «Numeració/Pics».
- Entre sintagmes, amb espais per llegibilitat: «artistes / àlbums».

### Majúscules i minúscules

- Eviteu la capitalització excessiva pròpia de l'anglès.
- Majúscula inicial en inici de frase, noms propis, sigles i noms d'opcions de menú.
- Noms genèrics en minúscula: «navegador», «editor d'HTML», «client de correu».
- Noms de llengües en minúscula: «català», «anglès», «francès».
- Després de dos punts, majúscula només en citacions textuals o etiquetes tipus «Atenció:».
- Noms d'institucions amb nom complet oficial: «Departament de Comerç», «The Open Group».

| Text original | For more information..., see the Department of Commerce web site. |
| ------------- | ----------------------------------------------------------------- |
| No            | ...vegeu la pàgina web del departament de Comerç.                 |
| Sí            | ...vegeu la pàgina web del Departament de Comerç.                 |

### Llistes numerades i vinyetes

- **Frases completes**: cada element comença amb majúscula i acaba amb punt.
- **Frases incompletes** (nominals): majúscula inicial i sense puntuació final.
- Eviteu barrejar elements complets i incomplets en una mateixa llista; uniformitzeu-los.

### Abreviacions

No confongueu símbols, abreviatures i sigles.

#### Símbols

- No porten punt final i segueixen convencions internacionals.
- Respecteu majúscules/minúscules: «kB» (quilobyte), «MB» (megabyte), «Gb» (gigabit), «GB» (gigabyte).
- En català, «dpi» es tradueix habitualment per «ppp» (punts per polzada).

#### Abreviatures

- Porten punt final: «p. ex.», «núm.», «màx.», «mín.», «tel.».
- Respecteu les formes establertes dels dies i mesos: «dl.», «dt.», «gen.», «febr.», etc.

#### Sigles i acrònims

- Escriviu-les en majúscules, sense punts i sense cursiva: «USB», «HTML», «CD-ROM».
- Apostrofeu-les segons com es llegeixen i el gènere del concepte: «l'HTML», «la RAM», «el PC».
- Les sigles no fan plural amb «-s»: «els CD-ROM», «els PC».
- En textos llargs, la primera aparició d'una sigla poc coneguda pot incloure desplegament i traducció.
- Feu servir la forma catalana quan sigui d'ús consolidat (p. ex. «PMF», «XDSI»), però preserveu les internacionals molt arrelades («PC», «CD-ROM»).

## Aspectes de localització

### Formats i convencions

#### Locale

- Feu servir preferentment el locale genèric `ca` sempre que sigui possible.
- Codis habituals: `ca`, `ca_ES`, `ca_AD`, `ca_FR`, `ca_IT`.
- Per a variants, useu etiquetes BCP-47 com `ca@valencia`.

#### Nombres

- Milers amb punt i decimals amb coma: `1.234.567,89`.
- «billion» (en anglès) normalment és «mil milions», no «bilió».
- Ordinals abreujats: `1r`, `2n`, `3a`, `4t`, `5è`.

#### Unitats de mesura

- Per defecte, useu sistema mètric decimal (`cm`, `m`, `km`).
- Si el producte ho permet, deixeu que l'usuari pugui canviar d'unitats.

#### Data i hora

- Data en format `dia/mes/any` o «11 de setembre de 2000».
- Hora en format de 24 hores: `17:15:00` (sense AM/PM).
- Si traduïu patrons de format (`strftime`, Java, C#, etc.), adapteu ordre i format a català.

| Anglès | "dddd, MMMM d, h:mm tt" (Monday, October 13, 5:30 AM) |
| ------ | ----------------------------------------------------- |
| Català | "dddd, d MMMM, H:mm" (dilluns, 13 octubre, 5:30)      |

#### Adreces web

- Si un enllaç extern és en una altra llengua, indiqueu-la al final: `(en anglès)`.

#### Números de telèfon

- Formateu amb espais en grups de tres: `971 123 123`.
- Si el número és fictici, useu-ne un d'un territori de parla catalana.

#### Moneda

- El símbol monetari va darrere i amb espai: `1.000 €`, no `€1.000`.
- Sempre que sigui viable, convertiu imports a euros.

#### Percentatges

- Sense espai entre xifra i `%`: `10%`.

#### Ordenació d'elements

- Ordeneu llistes (llengües, països, etc.) segons criteris de col·lació catalana.

### Localització de programari

#### Noms de programes

- No traduïu noms propis de productes, programes o empreses.
- Noms genèrics en minúscula: «client de correu», «navegador d'Internet».

#### Especificacions de versió

- «versió» en minúscula: `Tomboy versió 0.14`.
- Si hi ha poc espai, podeu ometre «versió»: `Tomboy 0.14`.

#### Tecles

- Noms recomanats: «Retorn», «Supr», «Bloq Maj», «Maj», «Esc», «Av Pàg», «Re Pàg».
- Combinacions simultànies: `Ctrl+P`.
- Combinacions seqüencials: `Ctrl,N,O`.
- Manteniu les dreceres establertes encara que la lletra no coincideixi amb la inicial catalana.

#### Tipus de dades i atributs

- Traduccions habituals: `String` -> «Cadena», `Integer` -> «Enter», `Float` -> «Coma flotant», `True` -> «Cert», `False` -> «Fals».
- Si una cadena tècnica no es pot traduir per funcionament, preserveu-la.

#### Missatges d'error i d'avís

- Preferiu «S'ha produït un error...» davant «Error...», si l'espai ho permet.
- Eviteu «Ha ocorregut un error...», preferiu «S'ha produït un error...».

| Text original | Error opening file.                       |
| ------------- | ----------------------------------------- |
| No            | Error en obrir el fitxer.                 |
| Sí            | S'ha produït un error en obrir el fitxer. |

### Localització de documentació

- Prioritzeu llegibilitat per sobre d'economia d'espai.
- Manteniu coherència estricta amb la terminologia de la interfície.
- Eviteu gerundis en títols; preferiu construccions nominals o infinitiu.
- Verifiqueu que opcions, menús i botons de la documentació coincideixen exactament amb l'aplicació.
- Si l'aplicació no està traduïda, mostreu l'opció original seguida de traducció entre parèntesis.
- Feu servir captures en català i de la mateixa versió del programari.
- Localitzeu exemples (persones, empreses, adreces, telèfons) perquè siguin naturals per al domini lingüístic català.

## Apèndixs

### Apèndix 1. Paraules i expressions freqüents

Manteniu una terminologia coherent a tot el projecte. Si hi ha dubte, preferiu la forma més estesa en català tècnic i eviteu calcs de l'anglès o del castellà.

### Apèndix 2. Errors freqüents

#### Construccions incorrectes

- «Atès que» (no «donat que»)
- «ja que/perquè» (no «doncs» causal)
- «pel que fa a/quant a» (no «en quant a»)
- «hi ha» (no «hi han»)
- «com ara» (no «tals com»)
- «haver de» o «caldre» (no «tenir que»)

| Text original | Since the FAQ are not updated...            |
| ------------- | ------------------------------------------- |
| No            | Donat que les PMF no estan actualitzades... |
| Sí            | Atès que les PMF no estan actualitzades...  |

| Text original | There are some commands that... |
| ------------- | ------------------------------- |
| No            | Hi han algunes ordres que...    |
| Sí            | Hi ha algunes ordres que...     |

#### Paraules i expressions a evitar

- «Sí» (afirmació) i «si» (condició) no es poden confondre.
- «to be about to» sovint és «ara + futur» (no «estar a punt de» en contextos d'interfície).
- «to need» sovint equival a obligació: «cal» / «cal que», no «necessitar».

| Text original | The application is about to be installed. |
| ------------- | ----------------------------------------- |
| No            | L'aplicació està a punt d'instal·lar-se.  |
| Sí            | Ara s'instal·larà l'aplicació.            |

#### Falsos amics habituals

- «actual» (cat.) != «actual» (en.): sovint cal «real».
- «library» no és «llibreria», sinó «biblioteca».
- «remove» no és «remoure», sinó «eliminar» o «treure».
- «support» no és «suportar» en sentit tècnic, sinó «ser compatible amb» o «permetre l'ús de».

#### Barbarismes i formes no recomanades

- «contrasenya» (no «contrassenya»)
- «cerca»/«cercar» (evitem «búsqueda»)
- «mida» (no «tamany»)
- «donar suport» (no «recolzar», en sentit figurat)
- «targeta» (no «tarja», en l'àmbit TIC)
- «diversos/diverses» (millor que «varis» en aquest context)
- «programari» i «maquinari» no fan plural

#### El web o la web?

- «el web» per al lloc web o el sistema web.
- «la pàgina web» per a una pàgina concreta.

#### Tipografia

- Feu servir apòstrof tipogràfic correcte: «l'adreça», no «l´adreça».
- Feu servir punt volat en la ela geminada: «l·l» (no «l.l»).

### Apèndix 3. Topònims i llengües

#### Topònims

- Als Països Catalans, useu sempre la forma nadiua.
- Fora dels Països Catalans, useu la forma catalana tradicional si existeix (p. ex. «Londres», «Moscou»).
- Si no hi ha forma catalana establerta, useu la forma oficial original o la transcripció normativa.
- Els articles de topònims van en minúscula, excepte a inici de frase o si la forma original els manté en majúscula.

#### Llengües

- Els noms de llengua en català van en minúscula: «català», «anglès», «alemany», «occità».

#### Alfabets

- Useu les denominacions catalanes: «ciríl·lic», «àrab», «hebreu», «xinès simplificat», «xinès tradicional», «llatí».
